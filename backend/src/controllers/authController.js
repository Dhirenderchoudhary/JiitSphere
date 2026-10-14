const crypto = require('crypto');
const env = require('../config/env');
const { sign } = require('../utils/token');
const { createRelaySession, ensureOwnedSession } = require('../services/portalRelayService');
const { PortalClient } = require('../services/portalClient');
const { getSnapshot } = require('../services/requestAnalyticsStore');

const allowedUsers = env.userAllowedIdentifiers.reduce((acc, identifier) => {
  acc[identifier.toLowerCase()] = true;
  return acc;
}, {});

const timingSafeHashEquals = (a = '', b = '') => {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || !right) return false;

  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const makeDisplayName = (identifier) => {
  if (!identifier.includes('@')) {
    return `Student ${identifier}`;
  }

  const [name] = identifier.split('@');
  return name
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const DEMO_USER_ID = 'dhirender.choudhary@jiitsphere.local';
const DEMO_DISPLAY_NAME = 'Dhirender Choudhary';

const normalizeDemoUser = (user = {}) => {
  const normalizedUserId = String(user?.userId || '')
    .trim()
    .toLowerCase();
  const isLocalDemoId = normalizedUserId.endsWith('@jiitsphere.local');
  const isDemoUser =
    Boolean(user?.demo) ||
    String(user?.mode || '').toLowerCase() === 'public-demo' ||
    (isLocalDemoId && normalizedUserId.startsWith('demo.')) ||
    normalizedUserId === DEMO_USER_ID;

  if (!isDemoUser) return user;

  return {
    ...user,
    userId: DEMO_USER_ID,
    name: DEMO_DISPLAY_NAME,
    role: 'student',
    demo: true,
    mode: 'public-demo',
  };
};

const issuePortalLogin = (userId, name) => {
  const user = { userId, name, role: 'portal-pending', portalMode: true };

  const token = sign(
    {
      ...user,
      scope: ['portal:relay', 'portal:sdk-login'],
      // iat lets /auth/me slide the window for users who keep coming back.
      iat: Date.now(),
      exp: Date.now() + env.portalTokenMaxAgeMs,
    },
    env.authSecret
  );

  const relaySessionId = createRelaySession(user.userId);

  return { token, user, relaySessionId };
};

const login = async (req, res) => {
  const { userId, email, password } = req.body || {};
  const normalizedIdentifier = String(userId || email || '')
    .trim()
    .toLowerCase();
  const normalizedPassword = String(password || '');

  if (!normalizedIdentifier || !normalizedPassword) {
    return res.status(400).json({ success: false, message: 'User ID and password are required' });
  }

  if (normalizedIdentifier.length > 120 || normalizedPassword.length > 512) {
    return res.status(400).json({ success: false, message: 'Invalid credential payload' });
  }

  if (!env.userAllowAll && !allowedUsers[normalizedIdentifier]) {
    return res
      .status(403)
      .json({ success: false, message: 'User ID is not allowed for this portal' });
  }

  await new Promise((r) => setImmediate(r));
  const incomingHash = crypto.createHash('sha256').update(normalizedPassword).digest('hex');
  if (!timingSafeHashEquals(incomingHash, env.userPasswordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const user = {
    userId: normalizedIdentifier,
    name: makeDisplayName(normalizedIdentifier),
    role: env.adminAllowedEmails.includes(normalizedIdentifier) ? 'admin' : 'student',
  };

  // Was hardcoded to 24h, which ignored SESSION_MAX_AGE and forced a daily
  // re-login. Now shares the configured window with every other session.
  const token = sign(
    {
      ...user,
      iat: Date.now(),
      exp: Date.now() + env.sessionMaxAgeMs,
    },
    env.authSecret
  );

  return res
    .status(200)
    .json({ success: true, message: 'Login successful', data: { token, user } });
};

/**
 * Mint a replacement token when the caller's is older than the refresh
 * threshold, so an active user's window keeps sliding instead of expiring a
 * fixed period after they first logged in. Returns null when the current token
 * is still fresh, to avoid re-signing on every request.
 */
const renewedTokenFor = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  const issuedAt = Number(payload.iat) || 0;
  // Tokens issued before iat existed have no age to compare, so refresh them
  // once and they slide normally from then on.
  if (issuedAt && Date.now() - issuedAt < env.sessionRefreshAfterMs) return null;

  const maxAgeMs = payload.portalMode ? env.portalTokenMaxAgeMs : env.sessionMaxAgeMs;
  const now = Date.now();
  const { iat: _iat, exp: _exp, ...claims } = payload;

  return sign({ ...claims, iat: now, exp: now + maxAgeMs }, env.authSecret);
};

const me = (req, res) => {
  const user = normalizeDemoUser(req.user || {});
  const token = renewedTokenFor(req.user);

  // `token` is present only when it changed; the client keeps its own otherwise.
  return res.status(200).json({ success: true, data: { user, ...(token ? { token } : {}) } });
};

const demoLogin = (req, res) => {
  if (!env.portalPublicDemoEnabled) {
    return res.status(404).json({ success: false, message: 'Demo login is disabled' });
  }

  const defaultDemoId = DEMO_USER_ID;
  const requested = String(req.body?.userId || '')
    .trim()
    .toLowerCase();
  const safeDemoId =
    requested && requested.endsWith('@jiitsphere.local') ? requested : defaultDemoId;

  const user = {
    userId: safeDemoId,
    name: DEMO_DISPLAY_NAME,
    role: 'student',
    demo: true,
    mode: 'public-demo',
  };

  const token = sign(
    {
      ...user,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    },
    env.authSecret
  );

  return res
    .status(200)
    .json({ success: true, message: 'Demo login successful', data: { token, user } });
};

const collectValues = (node, out = new Set()) => {
  if (node && typeof node === 'object') Object.values(node).forEach((v) => collectValues(v, out));
  else if (node !== null && node !== undefined) out.add(String(node).trim().toLowerCase());
  return out;
};

// The captured response is only a claim. Sessions are keyed by student, so
// trusting it would let anyone post a junk token with someone else's enrollment
// number and replace their session. The portal's own record for the token must
// name the same student.
const portalConfirmsStudent = async (portalToken, instituteId, userId) => {
  const client = new PortalClient(
    { cookies: {} },
    { token: portalToken, instituteid: instituteId }
  );
  const info = await client.post(
    '/StudentPortalAPI/studentpersinfo/getstudent-personalinformation',
    { clientid: 'SOAU', instituteid: instituteId },
    { encrypted: false }
  );
  return collectValues(info).has(userId);
};

/**
 * Takes the portal's own Google sign-in response, captured on the real portal
 * page by the JiitSphere extension. Google only issues tokens for the college
 * client ID on the portal's origin, so the browser has to sign in there.
 */
const portalGoogleLogin = async (req, res) => {
  const response = req.body?.response;
  const portalToken = String(response?.token || '').trim();
  const instituteId = String(response?.value || '').trim();
  const userId = String(response?.enrollmentno || response?.userid || '')
    .trim()
    .toLowerCase();

  if (
    !portalToken ||
    portalToken.length > 4096 ||
    !instituteId ||
    !/^[a-z0-9._@-]{4,120}$/i.test(userId)
  ) {
    return res
      .status(400)
      .json({ success: false, message: 'The portal did not return a usable sign-in' });
  }

  let confirmed;
  try {
    confirmed = await portalConfirmsStudent(portalToken, instituteId, userId);
  } catch (err) {
    const status = err.details?.httpStatus;
    if (status && status < 500) confirmed = false;
    else {
      return res
        .status(502)
        .json({ success: false, message: 'Could not reach the portal to confirm your sign-in' });
    }
  }
  if (!confirmed) {
    return res
      .status(401)
      .json({ success: false, message: 'The portal did not confirm this sign-in' });
  }

  const name = String(response.name || '').trim() || makeDisplayName(userId);
  const portalLogin = issuePortalLogin(userId, name);
  const session = ensureOwnedSession(portalLogin.relaySessionId, userId);
  session.authContext = {
    regdata: {
      token: portalToken,
      clientid: response.clientid || null,
      instituteid: instituteId,
      institutelist: [{ value: instituteId, label: response.label || '' }],
      name,
      enrollmentno: response.enrollmentno || null,
      userid: response.userid || null,
      memberid: response.memberid || null,
      membertype: response.membertype || 'S',
    },
    tokenDate: new Date().toString(),
    verifiedAt: Date.now(),
  };

  return res
    .status(200)
    .json({ success: true, message: 'Portal Google sign-in successful', data: portalLogin });
};

const analytics = (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required for analytics' });
  }

  return res.status(200).json({ success: true, data: getSnapshot() });
};

module.exports = {
  login,
  demoLogin,
  portalGoogleLogin,
  me,
  analytics,
};
