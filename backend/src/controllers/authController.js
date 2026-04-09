const crypto = require('crypto');
const env = require('../config/env');
const { sign } = require('../utils/token');
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

const login = (req, res) => {
  const { userId, email, password, portalMode = false } = req.body || {};
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

  if (!portalMode && !env.userAllowAll && !allowedUsers[normalizedIdentifier]) {
    return res.status(403).json({ success: false, message: 'User ID is not allowed for this portal' });
  }

  if (!portalMode) {
    const incomingHash = crypto.createHash('sha256').update(normalizedPassword).digest('hex');
    if (!timingSafeHashEquals(incomingHash, env.userPasswordHash)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  }

  const user = {
    userId: normalizedIdentifier,
    name: makeDisplayName(normalizedIdentifier),
    role: env.adminAllowedEmails.includes(normalizedIdentifier) ? 'admin' : 'student'
  };

  const token = sign(
    {
      ...user,
      exp: Date.now() + 1000 * 60 * 60 * 24
    },
    env.authSecret
  );

  return res.status(200).json({ success: true, message: 'Login successful', data: { token, user } });
};

const me = (req, res) => {
  return res.status(200).json({ success: true, data: { user: req.user } });
};

const analytics = (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required for analytics' });
  }

  return res.status(200).json({ success: true, data: getSnapshot() });
};

module.exports = {
  login,
  me,
  analytics
};
