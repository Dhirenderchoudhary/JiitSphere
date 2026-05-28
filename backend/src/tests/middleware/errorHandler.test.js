const request = require('supertest');
const express = require('express');
const { ZodError } = require('zod');
const errorHandler = require('../../middlewares/errorHandler');

const app = express();

app.get('/zod', () => {
  const err = new Error('ZodError');
  err.name = 'ZodError';
  err.errors = [{ path: ['testField'], message: 'Zod invalid type' }];
  throw err;
});

app.get('/mongoose-val', () => {
  const err = new Error('ValidationError');
  err.name = 'ValidationError';
  err.errors = {
    testField: { path: 'testField', message: 'Mongoose validation failed' },
  };
  throw err;
});

app.get('/duplicate', () => {
  const err = new Error('Duplicate key');
  err.code = 11000;
  throw err;
});

app.get('/generic', () => {
  throw new Error('Some unexpected generic error');
});

// Attach the error handler
app.use(errorHandler);

describe('Error Handler Middleware', () => {
  it('should format ZodError as 400 Bad Request with details', async () => {
    const res = await request(app).get('/zod');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors[0].field).toBe('testField');
  });

  it('should format Mongoose ValidationError as 400 with details', async () => {
    const res = await request(app).get('/mongoose-val');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid input data');
    expect(res.body.errors[0].field).toBe('testField');
  });

  it('should format Mongoose duplicate key error (code 11000) as 400', async () => {
    const res = await request(app).get('/duplicate');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Duplicate field value entered');
  });

  it('should format generic errors as 500', async () => {
    const res = await request(app).get('/generic');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Some unexpected generic error');
  });
});
