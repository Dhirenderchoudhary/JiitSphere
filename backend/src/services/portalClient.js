// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * portalClient.js — Stateful portal API client with retry, timeout, and deduplication.
 *
 * Design:
 *   - Every request gets a configurable timeout (default 8 s)
 *   - Retries up to 3 times with exponential backoff for 5xx / network errors
 *   - In-flight deduplication prevents duplicate concurrent calls to the same endpoint+payload
 *   - Structured errors: always throws { type, message, details }
 */

const crypto = require('crypto');
const { encryptPortalPayload } = require('../utils/portalCrypto');
const { ensureOwnedSession, buildCookieHeader } = require('./portalRelayService');
const env = require('../config/env');

// ── Constants ──────────────────────────────────────────────────────────────

const PORTAL_TIME_ZONE = 'Asia/Kolkata';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;

// ── Structured Error ───────────────────────────────────────────────────────

class PortalError extends Error {
  /**
   * @param {'FETCH_ERROR'|'PARSE_ERROR'|'VALIDATION_ERROR'|'SESSION_ERROR'} type
   * @param {string} message
   * @param {*} [details]
   */
  constructor(type, message, details = null) {
    super(message);
    this.name = 'PortalError';
    this.type = type;
    this.details = details;
  }

  toJSON() {
    return { type: this.type, message: this.message, details: this.details };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const portalOrigin = new URL(env.portalRelayBaseUrl).origin;
const toPortalUrl = (path) => new URL(path, portalOrigin).toString();

const dateCode = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PORTAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });

  const parts = formatter.formatToParts(date);
  const pv = (type) => parts.find((i) => i.type === type)?.value || '';
  const wMap = { sun: '0', mon: '1', tue: '2', wed: '3', thu: '4', fri: '5', sat: '6' };
  const dd = String(pv('day')).padStart(2, '0');
  const mm = String(pv('month')).padStart(2, '0');
  const yy = String(pv('year')).slice(2);
  const dow = wMap[pv('weekday').toLowerCase()] || String(date.getDay());
  return `${dd[0]}${mm[0]}${yy[0]}${dow}${dd[1]}${mm[1]}${yy[1]}`;
};

const buildLocalNameHeader = (tokenDate = new Date().toString()) => {
  const head = String(tokenDate).substring(0, 4);
  const tail = String(tokenDate).substring(4, 9);
  return encryptPortalPayload(
    `${head}${dateCode(new Date())}${tail}`,
    new Date(),
    PORTAL_TIME_ZONE
  );
};

/** Secure payload hash using SHA-256 for dedup key */
const payloadHash = (payload) => {
  if (!payload) return 'empty';
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(str).digest('hex');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── In-flight deduplication cache ──────────────────────────────────────────

const inFlightCache = new Map();

// ── Client class ───────────────────────────────────────────────────────────

class PortalClient {
  /**
   * @param {object} relaySession — session from portalRelayService
   * @param {object} authContext  — { token, clientid, instituteid, tokenDate, name, enrollmentno, userid, memberid, membertype }
   */
  constructor(relaySession, authContext) {
    if (!relaySession || !authContext?.instituteid) {
      throw new PortalError('SESSION_ERROR', 'Missing relay session or auth context');
    }
    this.relaySession = relaySession;
    this.auth = authContext;
  }

  /** Build standard portal headers */
  _headers(contentType = 'application/json') {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': contentType,
      Origin: 'https://webportal.jiit.ac.in:6011',
      Referer: 'https://webportal.jiit.ac.in:6011/studentportal/#/',
      'X-Requested-With': 'XMLHttpRequest'
    };
    const cookieHeader = buildCookieHeader(this.relaySession);
    if (cookieHeader) headers.Cookie = cookieHeader;
    if (this.auth.token) {
      headers.Authorization = `Bearer ${this.auth.token}`;
      headers.LocalName = buildLocalNameHeader(this.auth.tokenDate);
    }
    return headers;
  }

  /**
   * POST to portal with encrypted payload.
   * @param {string} path     — e.g. '/StudentPortalAPI/studentsgpacgpa/getallsemesterdata'
   * @param {object} payload  — plain JS object
   * @param {object} [opts]
   * @param {boolean} [opts.encrypted=true]    — AES-encrypt the payload
   * @param {number}  [opts.timeout]           — ms, default 8000
   * @returns {Promise<object>}  The `response` field from the portal JSON
   * @throws {PortalError}
   */
  async post(path, payload, opts = {}) {
    const { encrypted = true, timeout = DEFAULT_TIMEOUT_MS } = opts;

    const safeUserId = String(this.auth.userid || this.auth.clientid || this.auth.memberid || 'anon');
    const dedupKey = `POST:${safeUserId}:${path}:${payloadHash(payload)}`;
    const existing = inFlightCache.get(dedupKey);
    if (existing) return existing;

    const promise = this._postWithRetry(path, payload, encrypted, timeout);
    inFlightCache.set(dedupKey, promise);

    try {
      return await promise;
    } finally {
      inFlightCache.delete(dedupKey);
    }
  }

  /**
   * GET from portal (used for PDF downloads).
   * @param {string} path
   * @param {object} [opts]
   * @param {'json'|'buffer'} [opts.responseType='json']
   * @param {number} [opts.timeout]
   * @returns {Promise<object|Buffer>}
   */
  async get(path, opts = {}) {
    const { responseType = 'json', timeout = DEFAULT_TIMEOUT_MS } = opts;
    const url = toPortalUrl(path);
    const headers = this._headers();
    delete headers['Content-Type'];
    if (responseType === 'buffer') {
      headers.Accept = 'application/pdf, application/octet-stream, */*';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new PortalError('FETCH_ERROR', `GET ${path} returned HTTP ${response.status}`);
      }

      if (responseType === 'buffer') {
        return Buffer.from(await response.arrayBuffer());
      }

      const data = await response.json();
      return data;
    } catch (err) {
      if (err instanceof PortalError) throw err;
      throw new PortalError('FETCH_ERROR', `GET ${path} failed: ${err.message}`, {
        code: err.code || err.name
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Internal: POST with up to MAX_RETRIES retries on transient failures */
  async _postWithRetry(path, payload, encrypted, timeout) {
    let lastErr = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      }

      try {
        return await this._postOnce(path, payload, encrypted, timeout);
      } catch (err) {
        lastErr = err;
        // Only retry on transient errors
        if (err.type !== 'FETCH_ERROR') throw err;
        const isTransient =
          err.details?.httpStatus >= 500 ||
          err.details?.code === 'ABORT_ERR' ||
          err.details?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
          err.details?.code === 'ECONNRESET';
        if (!isTransient) throw err;
      }
    }

    throw lastErr;
  }

  /** Internal: single POST attempt */
  async _postOnce(path, payload, encrypted, timeout) {
    const url = toPortalUrl(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      let body;
      let contentType = 'application/json';

      if (encrypted) {
        body = encryptPortalPayload(
          JSON.stringify(payload || {}),
          new Date(),
          PORTAL_TIME_ZONE
        );
      } else {
        body = JSON.stringify(payload || {});
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: this._headers(contentType),
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        // If encrypted request got a 400 due to JSON parse error, retry with plain JSON
        if (encrypted && response.status >= 400 && response.status < 500) {
          const errData = await response.json().catch(() => null);
          const errMsg = String(errData?.status?.errors || errData?.message || '').toLowerCase();
          if (errMsg.includes('json parse error') || errMsg.includes('unrecognized token')) {
            // Retry with plain JSON (not encrypted)
            return this._postOnce(path, payload, false, timeout);
          }
        }
        throw new PortalError('FETCH_ERROR', `POST ${path} returned HTTP ${response.status}`, {
          httpStatus: response.status
        });
      }

      const data = await response.json();

      const status = String(
        data?.status?.responseStatus || data?.responseStatus || ''
      ).toLowerCase();

      if (status !== 'success' && status !== 'ok') {
        const errMsg =
          data?.status?.errors?.[0] ||
          data?.status?.errors ||
          data?.message ||
          'Portal returned non-success status';
        throw new PortalError('FETCH_ERROR', `POST ${path}: ${errMsg}`, {
          httpStatus: response.status,
          portalStatus: data?.status
        });
      }

      return data.response || data;
    } catch (err) {
      if (err instanceof PortalError) throw err;
      throw new PortalError('FETCH_ERROR', `POST ${path} failed: ${err.message}`, {
        code: err.cause?.code || err.code || err.name
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { PortalClient, PortalError, toPortalUrl, buildLocalNameHeader };
