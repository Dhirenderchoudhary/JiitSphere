// SPDX-License-Identifier: GPL-3.0-or-later
const env = require('../config/env');
const {
  createRelaySession,
  ensureOwnedSession,
  updateCookiesFromResponse,
  buildCookieHeader,
  destroyRelaySession
} = require('../services/portalRelayService');
const CustomPortalClient = require('../services/customPortalClient');
const { encryptPortalPayload, encryptPortalPayloadVariants, generatePortalLocalName } = require('../utils/portalCrypto');

const portalClient = new CustomPortalClient(env.portalRelayBaseUrl);

const DEFAULT_PORTAL_CAPTCHA = { captcha: 'phw5n', hidden: 'gmBctEffdSg=' };

const parseBody = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (_error) {
      return null;
    }
  }
  const text = await response.text();
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return text;
    }
  }

  return text;
};

const portalHeaders = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://webportal.jiit.ac.in:6011',
  Referer: 'https://webportal.jiit.ac.in:6011/studentportal/#/',
  'X-Requested-With': 'XMLHttpRequest'
};

const RELAY_ATTEMPT_TIMEOUT_MS = Number(env.portalRequestTimeoutMs || 12000);

const startRelaySession = (req, res) => {
  const ownerId = req.user.userId || req.user.email || 'unknown';
  const sessionId = createRelaySession(ownerId);
  return res.status(200).json({ success: true, data: { sessionId, baseUrl: env.portalRelayBaseUrl } });
};

const fetchRelayCaptcha = async (req, res, next) => {
  try {
    const ownerId = req.user.userId || req.user.email || 'unknown';
    const requestedSessionId = req.body?.sessionId;

    const sessionId = requestedSessionId || createRelaySession(ownerId);
    const session = ensureOwnedSession(sessionId, ownerId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Relay session not found' });
    }

    const url = portalClient.toAbsoluteUrl('/StudentPortalAPI/token/getcaptcha');
    const outboundHeaders = { ...portalHeaders };

    const cookieHeader = buildCookieHeader(session);
    if (cookieHeader) outboundHeaders.Cookie = cookieHeader;

    const response = await fetch(url, {
      method: 'GET',
      headers: outboundHeaders
    });

    updateCookiesFromResponse(session, response);
    const data = await parseBody(response);

    const captchaPayload = data?.response?.captcha || data?.captcha || null;
    if (captchaPayload && typeof captchaPayload === 'object') {
      session.lastCaptchaPayload = captchaPayload;
      session.lastCaptchaFetchedAt = Date.now();
    }

    return res.status(200).json({
      success: true,
      data: {
        sessionId,
        relayStatus: response.status,
        relayOk: response.ok,
        targetUrl: url,
        response: data
      }
    });
  } catch (error) {
    return next(error);
  }
};

const relayRequest = async (req, res, next) => {
  try {
    const ownerId = req.user.userId || req.user.email || 'unknown';
    const { sessionId, path, method = 'GET', body, headers = {} } = req.body || {};

    const session = ensureOwnedSession(sessionId, ownerId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Relay session not found' });
    }

    const url = portalClient.toAbsoluteUrl(path || '.');
    const outboundHeaders = { ...portalHeaders, ...headers };

    const cookieHeader = buildCookieHeader(session);
    if (cookieHeader) {
      outboundHeaders.Cookie = cookieHeader;
    }

    const response = await fetch(url, {
      method,
      headers: outboundHeaders,
      body: body ? JSON.stringify(body) : undefined
    });

    updateCookiesFromResponse(session, response);
    const data = await parseBody(response);

    return res.status(200).json({
      success: true,
      data: {
        relayStatus: response.status,
        relayOk: response.ok,
        targetUrl: url,
        response: data
      }
    });
  } catch (error) {
    return next(error);
  }
};

const executeRelayAttempt = async (session, candidate) => {
  const url = portalClient.toAbsoluteUrl(candidate.path);
  const headers = {
    ...portalHeaders,
    'Content-Type': candidate.contentType || 'application/json',
    LocalName: generatePortalLocalName()
  };

  const cookieHeader = buildCookieHeader(session);
  if (cookieHeader) headers.Cookie = cookieHeader;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), RELAY_ATTEMPT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: candidate.method || 'POST',
      headers,
      body:
        candidate.rawBody !== undefined
          ? String(candidate.rawBody)
          : candidate.body
            ? JSON.stringify(candidate.body)
            : undefined,
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    const code = error?.cause?.code || error?.code || error?.name || 'PORTAL_FETCH_ERROR';
    const isAbort = String(error?.name || '').toLowerCase() === 'aborterror' || String(code) === 'ABORT_ERR';
    const message = isAbort
      ? `Portal request timed out after ${RELAY_ATTEMPT_TIMEOUT_MS}ms`
      : error?.cause?.message || error?.message || 'Portal request failed';

    return {
      endpoint: candidate.path,
      contentType: headers['Content-Type'],
      status: 0,
      ok: false,
      response: {
        status: {
          responseStatus: 'FAILED',
          errors: [message]
        },
        meta: {
          networkError: true,
          code: String(code),
          path: candidate.path
        }
      }
    };
  } finally {
    clearTimeout(timeoutHandle);
  }

  updateCookiesFromResponse(session, response);
  const data = await parseBody(response);

  return {
    endpoint: candidate.path,
    contentType: headers['Content-Type'],
    status: response.status,
    ok: response.ok,
    response: data
  };
};

const responseLooksSuccessful = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  const responseStatus = String(payload?.status?.responseStatus || payload?.responseStatus || '').toLowerCase();
  const statusLiteral = String(payload?.status || '').toLowerCase();
  return responseStatus === 'success' || responseStatus === 'ok' || statusLiteral === 'success';
};

const extractFailureMessage = (payload) => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;

  const errors = payload?.status?.errors || payload?.errors;
  if (Array.isArray(errors) && errors.length) return String(errors[0]);
  if (typeof errors === 'string' && errors.trim()) return errors;

  const fallback = String(payload?.message || payload?.status?.identifier || '').trim();
  if (/^(no message available|n\/a|null|undefined)$/i.test(fallback)) return '';
  return fallback;
};

const extractResponseStatus = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload?.status?.responseStatus || payload?.responseStatus || payload?.status || '').trim();
};

const sanitizeAttempt = (attempt = {}) => ({
  endpoint: attempt.endpoint,
  contentType: attempt.contentType,
  status: attempt.status,
  ok: Boolean(attempt.ok),
  strategy: attempt.strategy,
  phase: attempt.phase,
  timeZoneVariant: attempt.timeZoneVariant,
  responseStatus: extractResponseStatus(attempt.response),
  message: extractFailureMessage(attempt.response)
});

const applyAuthContextToSession = (session, payload) => {
  const regdata = payload?.response?.regdata;
  const token = payload?.response?.token || regdata?.token;
  if (!regdata && !token) return false;

  session.authContext = {
    regdata: regdata || {},
    tokenDate: new Date().toString(),
    verifiedAt: Date.now()
  };
  return true;
};

const runEncryptedLoginFlow = async ({
  session,
  attempts,
  portalUsername,
  normalizedUserType,
  password,
  captchaPayload,
  strategy,
  maxCombos = 6
}) => {
  const preloginPayload = JSON.stringify({
    username: portalUsername,
    usertype: normalizedUserType,
    captcha: captchaPayload
  });

  const variants = encryptPortalPayloadVariants(preloginPayload);
  const variantByZone = new Map();
  for (const variant of variants) {
    if (!variantByZone.has(variant.timeZone)) {
      variantByZone.set(variant.timeZone, variant);
    }
  }

  const orderedVariants = ['Asia/Kolkata', 'local', 'UTC']
    .map((zone) => variantByZone.get(zone))
    .filter(Boolean);

  const matrix = [];
  for (const contentType of ['text/plain;charset=UTF-8', 'application/json']) {
    for (const variant of orderedVariants) {
      matrix.push({ contentType, variant });
    }
  }

  const cappedMatrix = matrix.slice(0, Math.max(1, Number(maxCombos || 1)));

  for (const { contentType, variant } of cappedMatrix) {
    const pretokenAttempt = await executeRelayAttempt(session, {
      path: '/StudentPortalAPI/token/pretoken-check',
      method: 'POST',
      contentType,
      rawBody: variant.encrypted
    });
    pretokenAttempt.strategy = strategy;
    pretokenAttempt.phase = 'pretoken-check';
    pretokenAttempt.timeZoneVariant = variant.timeZone;
    attempts.push(pretokenAttempt);

    const pretokenPayload = pretokenAttempt.response;
    const random = pretokenPayload?.response?.random;
    const otppwd = pretokenPayload?.response?.otppwd;
    if (!responseLooksSuccessful(pretokenPayload) || !random || !otppwd || !password) {
      continue;
    }

    const tokenPayload = JSON.stringify({
      otppwd,
      username: portalUsername,
      passwordotpvalue: password,
      Modulename: 'STUDENTMODULE',
      random
    });

    const encryptedGenerateToken = encryptPortalPayload(
      tokenPayload,
      new Date(),
      variant.timeZone === 'local' ? undefined : variant.timeZone
    );

    const tokenAttempt = await executeRelayAttempt(session, {
      path: '/StudentPortalAPI/token/generatetoken',
      method: 'POST',
      contentType,
      rawBody: encryptedGenerateToken
    });
    tokenAttempt.strategy = strategy;
    tokenAttempt.phase = 'generatetoken';
    tokenAttempt.timeZoneVariant = variant.timeZone;
    attempts.push(tokenAttempt);

    const authenticated = responseLooksSuccessful(tokenAttempt.response) && applyAuthContextToSession(session, tokenAttempt.response);
    if (authenticated) {
      return true;
    }
  }

  return false;
};

const tryRelayLogin = async (req, res, next) => {
  try {
    const ownerId = req.user.userId || req.user.email || 'unknown';
    const { sessionId, userId, password, captcha, usertype = 'S', encryptedPayload } = req.body || {};

    const normalizedUserId = String(userId || '').trim();
    const normalizedPassword = String(password || '').trim();
    if (!normalizedUserId || !normalizedPassword) {
      return res.status(400).json({ success: false, message: 'User ID and password are required' });
    }

    const session = ensureOwnedSession(sessionId, ownerId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Relay session not found' });
    }

    const attempts = [];
    let authenticated = false;
    const normalizedUserType = String(usertype || 'S').trim().toUpperCase();
    const normalizedCaptcha = String(captcha || '')
      .trim()
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 10);
    const maxAttemptBudget = normalizedCaptcha ? 40 : 30;

    const loginIdentities = [];
    const seenIdentities = new Set();
    const pushIdentity = (username, identityType, label) => {
      const normalizedUsername = String(username || '').trim();
      const normalizedType = String(identityType || '').trim().toUpperCase();
      if (!normalizedUsername || !normalizedType) return;

      const key = `${normalizedType}:${normalizedUsername.toLowerCase()}`;
      if (seenIdentities.has(key)) return;
      seenIdentities.add(key);
      loginIdentities.push({ username: normalizedUsername, usertype: normalizedType, label });
    };

    const baseUserId = normalizedUserId.replace(/^p/i, '');
    const primaryUsername =
      normalizedUserType === 'P'
        ? /^p/i.test(normalizedUserId)
          ? normalizedUserId
          : `P${normalizedUserId}`
        : normalizedUserId;

    pushIdentity(primaryUsername, normalizedUserType, 'primary');
    if (normalizedUserId.includes('@')) {
      const localUser = normalizedUserId.split('@')[0];
      pushIdentity(localUser, normalizedUserType, 'email-local');
    }
    if (normalizedUserType === 'S') {
      if (baseUserId && baseUserId !== normalizedUserId) {
        pushIdentity(baseUserId, 'S', 'strip-prefix');
      }
      if (baseUserId && !/^p/i.test(normalizedUserId)) {
        pushIdentity(`P${baseUserId}`, 'P', 'prefixed-fallback');
      }
    } else if (normalizedUserType === 'P' && baseUserId && baseUserId !== normalizedUserId) {
      pushIdentity(baseUserId, 'S', 'student-fallback');
    }

    const candidates = [];

    if (encryptedPayload) {
      candidates.push({
        path: '/StudentPortalAPI/token/pretoken-check',
        method: 'POST',
        contentType: 'text/plain;charset=UTF-8',
        rawBody: String(encryptedPayload)
      });
    }

    if (!encryptedPayload && loginIdentities.length) {
      const fastIdentityLimit = normalizedCaptcha
        ? loginIdentities.length
        : Math.min(loginIdentities.length, 2);
      const effectiveIdentities = loginIdentities.slice(0, fastIdentityLimit);
      const deferredIdentities = loginIdentities.slice(fastIdentityLimit);

      for (const identity of effectiveIdentities) {
        if (authenticated || attempts.length >= maxAttemptBudget) break;

        authenticated = await runEncryptedLoginFlow({
          session,
          attempts,
          portalUsername: identity.username,
          normalizedUserType: identity.usertype,
          password: normalizedPassword,
          captchaPayload: DEFAULT_PORTAL_CAPTCHA,
          strategy: `encrypted-default-captcha:${identity.label}`,
          maxCombos: normalizedCaptcha ? 4 : 3
        });

        if (!authenticated && normalizedCaptcha) {
          const captchaEnvelope =
            session.lastCaptchaPayload && typeof session.lastCaptchaPayload === 'object'
              ? { ...session.lastCaptchaPayload, captcha: normalizedCaptcha }
              : { captcha: normalizedCaptcha };

          authenticated = await runEncryptedLoginFlow({
            session,
            attempts,
            portalUsername: identity.username,
            normalizedUserType: identity.usertype,
            password: normalizedPassword,
            captchaPayload: captchaEnvelope,
            strategy: `encrypted-user-captcha:${identity.label}`,
            maxCombos: 6
          });
        }

        if (!authenticated) {
          const identityCandidates = portalClient.makeLoginCandidates({
            userId: identity.username,
            password: normalizedPassword,
            captcha: normalizedCaptcha,
            usertype: identity.usertype
          });
          identityCandidates.forEach((candidate) => {
            candidates.push({ ...candidate, strategyLabel: identity.label });
          });
        }
      }

      if (!authenticated && !normalizedCaptcha && deferredIdentities.length && attempts.length < maxAttemptBudget) {
        for (const identity of deferredIdentities) {
          if (authenticated || attempts.length >= maxAttemptBudget) break;

          authenticated = await runEncryptedLoginFlow({
            session,
            attempts,
            portalUsername: identity.username,
            normalizedUserType: identity.usertype,
            password: normalizedPassword,
            captchaPayload: DEFAULT_PORTAL_CAPTCHA,
            strategy: `encrypted-default-captcha-deep:${identity.label}`,
            maxCombos: 4
          });

          if (!authenticated) {
            const identityCandidates = portalClient.makeLoginCandidates({
              userId: identity.username,
              password: normalizedPassword,
              captcha: normalizedCaptcha,
              usertype: identity.usertype
            });
            identityCandidates.forEach((candidate) => {
              candidates.push({ ...candidate, strategyLabel: `${identity.label}-deep` });
            });
          }
        }
      }
    }

    if (!authenticated) {
      const fastFallbackLimit = normalizedCaptcha ? candidates.length : Math.min(candidates.length, 4);
      const fastFallbackCandidates = candidates.slice(0, fastFallbackLimit);
      for (const candidate of fastFallbackCandidates) {
        if (attempts.length >= maxAttemptBudget) break;
        const attempt = await executeRelayAttempt(session, candidate);
        attempt.strategy = candidate.strategyLabel ? `legacy-fallback:${candidate.strategyLabel}` : 'legacy-fallback';
        attempts.push(attempt);
        if (!authenticated && responseLooksSuccessful(attempt.response) && applyAuthContextToSession(session, attempt.response)) {
          authenticated = true;
        }
      }

      if (!authenticated && !normalizedCaptcha && fastFallbackLimit < candidates.length && attempts.length < maxAttemptBudget) {
        const deepFallbackCandidates = candidates.slice(fastFallbackLimit);
        for (const candidate of deepFallbackCandidates) {
          if (authenticated || attempts.length >= maxAttemptBudget) break;
          const attempt = await executeRelayAttempt(session, candidate);
          attempt.strategy = candidate.strategyLabel ? `legacy-fallback-deep:${candidate.strategyLabel}` : 'legacy-fallback-deep';
          attempts.push(attempt);
          if (responseLooksSuccessful(attempt.response) && applyAuthContextToSession(session, attempt.response)) {
            authenticated = true;
          }
        }
      }
    }

    const sanitizedAttempts = attempts.map((attempt) => sanitizeAttempt(attempt));

    const attemptMessages = sanitizedAttempts
      .map((attempt) => attempt.message)
      .filter(Boolean);
    const failureMessage = attemptMessages.find((msg) => /invalid|captcha|password|credential/i.test(msg)) || attemptMessages[0] || '';

    return res.status(200).json({
      success: true,
      data: {
        attempts: sanitizedAttempts,
        authenticated,
        recommendation: authenticated ? 'proceed' : 'captcha-required',
        failureMessage: authenticated ? '' : failureMessage || 'Official portal credentials verification failed'
      }
    });
  } catch (error) {
    return next(error);
  }
};

const closeRelaySession = (req, res) => {
  const ownerId = req.user.userId || req.user.email || 'unknown';
  const { sessionId } = req.body || {};

  const removed = destroyRelaySession(sessionId, ownerId);
  return res.status(200).json({ success: true, data: { removed } });
};

module.exports = {
  startRelaySession,
  fetchRelayCaptcha,
  relayRequest,
  tryRelayLogin,
  closeRelaySession
};
