const request = require('supertest');
const crypto = require('crypto');
const app = require('../../app');

// Generate the hash for our 'test-hash' to match 'password123'
// In authController: crypto.createHash('sha256').update(password).digest('hex')
const testPassword = 'password123';
const testHash = crypto.createHash('sha256').update(testPassword).digest('hex');

describe('Auth Integration Tests', () => {
  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ userId: 'student1', password: testPassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ userId: 'student1', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('should return 403 for disallowed user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ userId: 'hacker', password: testPassword });

      expect(res.status).toBe(403);
    });

    it('no longer hands out a portal session for any enrollment number and password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ userId: '9921103001', password: 'anything', portalMode: true });

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe('POST /api/v1/auth/demo-login', () => {
    it('should return a demo token', async () => {
      const res = await request(app).post('/api/v1/auth/demo-login').send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.demo).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/portal-google', () => {
    const portalResponse = {
      token: 'portal-token',
      value: 'JAYPEE',
      label: 'JIIT',
      clientid: 'JAYPEE',
      enrollmentno: '9921103001',
      userid: '9921103001',
      membertype: 'S',
      name: 'A Student',
    };

    // The portal's personal-information record for whoever owns the token.
    const portalRecordFor = (enrollment) =>
      new Response(
        JSON.stringify({
          status: { responseStatus: 'Success' },
          response: { generalinformation: { registrationno: enrollment } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    afterEach(() => jest.restoreAllMocks());

    it('signs the student in once the portal confirms the token is theirs', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(portalRecordFor('9921103001'));

      const res = await request(app)
        .post('/api/v1/auth/portal-google')
        .send({ response: portalResponse });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toEqual({
        userId: '9921103001',
        name: 'A Student',
        role: 'portal-pending',
        portalMode: true,
      });
      expect(res.body.data.relaySessionId).toMatch(/^[0-9a-f-]{36}$/);

      const me = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.data.token}`);
      expect(me.body.data.user.userId).toBe('9921103001');
    });

    it("rejects a real token used with another student's enrollment number", async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(portalRecordFor('9921103999'));

      const res = await request(app)
        .post('/api/v1/auth/portal-google')
        .send({ response: portalResponse });

      expect(res.status).toBe(401);
    });

    it('ignores the enrollment number when it only appears outside the identity fields', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            status: { responseStatus: 'Success' },
            response: {
              generalinformation: { registrationno: '9921103999', parenttelephoneno: '9921103001' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await request(app)
        .post('/api/v1/auth/portal-google')
        .send({ response: portalResponse });

      expect(res.status).toBe(401);
    });

    it('rejects a token the portal does not accept', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } })
        );

      const res = await request(app)
        .post('/api/v1/auth/portal-google')
        .send({ response: { ...portalResponse, token: 'junk' } });

      expect(res.status).toBe(401);
    });

    it('says so when the portal cannot be reached', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      const res = await request(app)
        .post('/api/v1/auth/portal-google')
        .send({ response: portalResponse });

      expect(res.status).toBe(502);
    });

    it('rejects a response without a portal token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/portal-google')
        .send({ response: { ...portalResponse, token: '' } });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should block unauthorized requests', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return user data for valid token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ userId: 'student1', password: testPassword });

      const { token } = loginRes.body.data;

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.userId).toBe('student1');
    });
  });
});
