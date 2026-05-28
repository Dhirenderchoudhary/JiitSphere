const request = require('supertest');
const app = require('../../app');
const env = require('../../config/env');

describe('Rate Limiter Middleware', () => {
  // We will hit the /api/v1/auth/login endpoint which uses authLimiter
  // Default max is 30 in non-production.

  it('should block requests after exceeding the limit', async () => {
    const limit = env.authRateLimitMax || 30;

    // Fire up to the limit
    for (let i = 0; i < limit; i++) {
      await request(app).post('/api/v1/auth/login').send({ userId: 'limit-test', password: 'pwd' });
    }

    // The next one should fail with 429
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ userId: 'limit-test', password: 'pwd' });

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Too many login attempts');
  });
});
