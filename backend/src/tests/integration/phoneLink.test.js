const request = require('supertest');
const app = require('../../app');
const LinkCode = require('../../models/LinkCode');

const ENROLLMENT = '9921103888';

const portalReply = (response) =>
  new Response(JSON.stringify({ status: { responseStatus: 'Success' }, response }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const signInOnComputer = async () => {
  const google = await request(app)
    .post('/api/v1/auth/portal-google')
    .send({
      response: {
        token: 'phone-link-portal-token',
        value: 'JAYPEE',
        label: 'JIIT',
        clientid: 'JAYPEE',
        enrollmentno: ENROLLMENT,
        userid: ENROLLMENT,
        name: 'A Student',
        membertype: 'S',
      },
    });
  const { token, relaySessionId } = google.body.data;
  await request(app)
    .post('/api/v1/portal/sdk/login')
    .set('Authorization', `Bearer ${token}`)
    .send({ userId: ENROLLMENT, relaySessionId });
  return token;
};

const createCode = (token) =>
  request(app).post('/api/v1/auth/link-code').set('Authorization', `Bearer ${token}`);

const redeem = (code) => request(app).post('/api/v1/auth/link-code/redeem').send({ code });

describe('linking a phone with a QR code', () => {
  beforeEach(() => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url) =>
        String(url).includes('getstudent-personalinformation')
          ? portalReply({ generalinformation: { registrationno: ENROLLMENT } })
          : portalReply({})
      );
  });

  afterEach(() => jest.restoreAllMocks());

  it('signs the phone in to the same portal session as the computer', async () => {
    const computerToken = await signInOnComputer();
    const { code } = (await createCode(computerToken)).body.data;

    const phone = await redeem(code);
    const session = await request(app)
      .get('/api/v1/portal/sdk/session')
      .set('Authorization', `Bearer ${phone.body.data.token}`);

    expect(phone.status).toBe(200);
    expect(phone.body.data.user.userId).toBe(ENROLLMENT);
    expect(session.status).toBe(200);
    expect(session.body.data.userId).toBe(ENROLLMENT);
  });

  it('accepts each code only once', async () => {
    const { code } = (await createCode(await signInOnComputer())).body.data;

    await redeem(code);
    const second = await redeem(code);

    expect(second.status).toBe(400);
  });

  it('rejects an expired code', async () => {
    const { code } = (await createCode(await signInOnComputer())).body.data;
    await LinkCode.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    const res = await redeem(code);

    expect(res.status).toBe(400);
  });

  it('only gives codes to students signed in to the portal', async () => {
    const demo = await request(app).post('/api/v1/auth/demo-login').send({});

    const res = await createCode(demo.body.data.token);

    expect(res.status).toBe(403);
  });
});
