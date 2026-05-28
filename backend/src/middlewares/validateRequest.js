const { ZodError } = require('zod');

const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      // Multer parses multipart form data values as strings, so we may need to coerce them 
      // in the zod schema, but the validation itself happens here.
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (error) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: (error.issues || error.errors || []).map(err => ({
            field: (err.path || []).join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};

module.exports = validateRequest;
