// SPDX-License-Identifier: GPL-3.0-or-later
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const toHandler = (message) => (_req, res) => {
  res.status(429).json({ success: false, message });
};

const normalizeIdentifier = (value) => String(value || '').trim().toLowerCase();

const clientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const authKey = (req) => {
  const identifier = normalizeIdentifier(req.body?.userId || req.body?.email);
  if (identifier) return `auth:${identifier}`;
  return `auth-ip:${clientIp(req)}`;
};

const relayKey = (req) => {
  const identifier = normalizeIdentifier(req.user?.userId || req.user?.email || req.body?.userId || req.body?.email);
  if (identifier) return `relay:${identifier}`;
  return `relay-ip:${clientIp(req)}`;
};

const apiKey = (req) => {
  const identifier = normalizeIdentifier(req.user?.userId || req.user?.email || req.body?.userId || req.body?.email);
  if (identifier) return `api:${identifier}`;
  return `api-ip:${clientIp(req)}`;
};

const authLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  keyGenerator: authKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: toHandler('Too many login attempts. Please wait and try again.')
});

const relayLimiter = rateLimit({
  windowMs: env.relayRateLimitWindowMs,
  max: env.relayRateLimitMax,
  keyGenerator: relayKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: toHandler('Too many portal requests. Please retry in a minute.')
});

const apiLimiter = rateLimit({
  windowMs: env.globalRateLimitWindowMs,
  max: env.globalRateLimitMax,
  keyGenerator: apiKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  handler: toHandler('Too many requests. Please retry shortly.')
});

module.exports = {
  authLimiter,
  relayLimiter,
  apiLimiter
};
