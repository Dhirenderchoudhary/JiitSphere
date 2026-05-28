const env = require('../config/env');

const errorHandler = (err, _req, res, _next) => {
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: (err.issues || err.errors || []).map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => ({
      field: el.path,
      message: el.message
    }));
    return res.status(400).json({
      success: false,
      message: 'Invalid input data',
      errors
    });
  }

  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate field value entered'
    });
  }

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
