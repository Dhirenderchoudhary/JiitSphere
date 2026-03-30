const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const toHandler = (message) => (_req, res) => {
  res.status(429).json({ success: false, message });
};

const authLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: toHandler('Too many login attempts. Please wait and try again.')
});

const relayLimiter = rateLimit({
  windowMs: env.relayRateLimitWindowMs,
  max: env.relayRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: toHandler('Too many portal requests. Please retry in a minute.')
});

const apiLimiter = rateLimit({
  windowMs: env.globalRateLimitWindowMs,
  max: env.globalRateLimitMax,
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
