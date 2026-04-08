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

  const response = await fetch(url, {
    method: candidate.method || 'POST',
    headers,
    body:
      candidate.rawBody !== undefined
        ? String(candidate.rawBody)
        : candidate.body
          ? JSON.stringify(candidate.body)
          : undefined
  });

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
  strategy
}) => {
  const preloginPayload = JSON.stringify({
    username: portalUsername,
    usertype: normalizedUserType,
    captcha: captchaPayload
  });

  const variants = encryptPortalPayloadVariants(preloginPayload);
  const contentTypes = ['application/json', 'text/plain;charset=UTF-8'];

  for (const variant of variants) {
    for (const contentType of contentTypes) {
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
  }

  return false;
};

const tryRelayLogin = async (req, res, next) => {
  try {
    const ownerId = req.user.userId || req.user.email || 'unknown';
    const { sessionId, userId, password, captcha, usertype = 'S', encryptedPayload } = req.body || {};

    const session = ensureOwnedSession(sessionId, ownerId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Relay session not found' });
    }

    const attempts = [];
    let authenticated = false;
    const normalizedUserType = String(usertype || 'S').trim().toUpperCase();
    const portalUsername = normalizedUserType === 'P' ? `P${userId}` : userId;
    const normalizedCaptcha = String(captcha || '')
      .trim()
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 10);

    const candidates = [];

    if (encryptedPayload) {
      candidates.push({
        path: '/StudentPortalAPI/token/pretoken-check',
        method: 'POST',
        contentType: 'text/plain;charset=UTF-8',
        rawBody: String(encryptedPayload)
      });
    }

    if (!encryptedPayload && portalUsername) {
      authenticated = await runEncryptedLoginFlow({
        session,
        attempts,
        portalUsername,
        normalizedUserType,
        password,
        captchaPayload: DEFAULT_PORTAL_CAPTCHA,
        strategy: 'encrypted-default-captcha'
      });

      if (!authenticated && normalizedCaptcha) {
        const captchaEnvelope =
          session.lastCaptchaPayload && typeof session.lastCaptchaPayload === 'object'
            ? { ...session.lastCaptchaPayload, captcha: normalizedCaptcha }
            : { captcha: normalizedCaptcha };

        authenticated = await runEncryptedLoginFlow({
          session,
          attempts,
          portalUsername,
          normalizedUserType,
          password,
          captchaPayload: captchaEnvelope,
          strategy: 'encrypted-user-captcha'
        });
      }
    }

    if (!authenticated) {
      candidates.push(...portalClient.makeLoginCandidates({ userId: portalUsername, password, captcha: normalizedCaptcha, usertype: normalizedUserType }));

      for (const candidate of candidates) {
        const attempt = await executeRelayAttempt(session, candidate);
        attempt.strategy = 'legacy-fallback';
        attempts.push(attempt);
        if (!authenticated && responseLooksSuccessful(attempt.response) && applyAuthContextToSession(session, attempt.response)) {
          authenticated = true;
        }
      }
    }

    const attemptMessages = attempts
      .map((attempt) => extractFailureMessage(attempt.response))
      .filter(Boolean);
    const failureMessage = attemptMessages.find((msg) => /invalid|captcha|password|credential/i.test(msg)) || attemptMessages[0] || '';

    return res.status(200).json({
      success: true,
      data: {
        attempts,
        authenticated,
        recommendation: authenticated ? 'proceed' : 'captcha-required',
        failureMessage: failureMessage || 'Official portal credentials verification failed'
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
