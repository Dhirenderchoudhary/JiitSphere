const env = require('../config/env');

const errorHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500 && env.isProduction) {
    console.error('[ERROR]', err.message);
  }

  const message =
    statusCode >= 500 && env.isProduction
      ? 'Internal server error'
      : err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message
  });
};

module.exports = errorHandler;
