const env = require('../config/env');
const { verify } = require('../utils/token');
const { trackRequest } = require('../services/requestAnalyticsStore');

const requestAnalytics = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = verify(token, env.authSecret);

    const route = req.baseUrl && req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.route?.path || req.originalUrl?.split('?')[0] || req.originalUrl;

    trackRequest({
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      userId: payload?.userId || null,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      referrer: req.headers.referer || req.headers.referrer || ''
    });
  });

  next();
};

module.exports = requestAnalytics;
