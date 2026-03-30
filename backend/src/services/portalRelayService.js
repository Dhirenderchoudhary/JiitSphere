const crypto = require('crypto');
const env = require('../config/env');

const relaySessions = new Map();

/* ── session TTL cleanup ─────────────────────────────────────────── */
const purgeExpiredRelaySessions = () => {
  const now = Date.now();
  for (const [id, session] of relaySessions) {
    if (now - session.createdAt > env.sessionMaxAgeMs) {
      relaySessions.delete(id);
    }
  }
};

setInterval(purgeExpiredRelaySessions, env.sessionCleanupIntervalMs).unref();

const normalizeCookies = (setCookieHeaderValue = '') => {
  const rawCookies = String(setCookieHeaderValue)
    .split(/,(?=\s*[^=;,\s]+=[^;,]+)/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return rawCookies
    .map((item) => item.split(';')[0]?.trim())
    .filter(Boolean)
    .map((cookie) => {
      const [name, ...rest] = cookie.split('=');
      return {
        name: name?.trim(),
        value: rest.join('=').trim()
      };
    })
    .filter((item) => item.name && item.value !== undefined);
};

const toCookieHeader = (cookieMap) => {
  return Object.entries(cookieMap)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
};

const createRelaySession = (ownerId) => {
  const sessionId = crypto.randomUUID();
  relaySessions.set(sessionId, {
    ownerId,
    cookies: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  return sessionId;
};

const getRelaySession = (sessionId) => relaySessions.get(sessionId);

const ensureOwnedSession = (sessionId, ownerId) => {
  const session = getRelaySession(sessionId);
  if (!session) return null;
  if (session.ownerId !== ownerId) return null;
  return session;
};

const updateCookiesFromResponse = (session, response) => {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return;

  const parsed = normalizeCookies(setCookie);
  parsed.forEach(({ name, value }) => {
    session.cookies[name] = value;
  });
  session.updatedAt = Date.now();
};

const buildCookieHeader = (session) => toCookieHeader(session.cookies);

const destroyRelaySession = (sessionId, ownerId) => {
  const session = ensureOwnedSession(sessionId, ownerId);
  if (!session) return false;
  relaySessions.delete(sessionId);
  return true;
};

module.exports = {
  createRelaySession,
  ensureOwnedSession,
  updateCookiesFromResponse,
  buildCookieHeader,
  destroyRelaySession
};
