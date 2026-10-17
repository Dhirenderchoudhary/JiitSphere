const request = require('supertest');
const app = require('../../app');
const PortalSession = require('../../models/PortalSession');
const { forgetSession } = require('../../services/ownPortalSdk');
const { forgetRelaySession } = require('../../services/portalRelayService');

const ENROLLMENT = '9921103777';

const portalReply = (response) =>
  new Response(JSON.stringify({ status: { responseStatus: 'Success' }, response }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const portalAcceptsToken = () =>
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (url) =>
      String(url).includes('getstudent-personalinformation')
        ? portalReply({
            generalinformation: { registrationno: ENROLLMENT, studentname: 'A Student' },
          })
        : portalReply({})
    );

const signIn = async () => {
  const google = await request(app)
    .post('/api/v1/auth/portal-google')
    .send({
      response: {
        token: 'restore-portal-token',
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
  return { token, relaySessionId };
};

const restart = (relaySessionId) => {
  forgetSession(ENROLLMENT);
  forgetRelaySession(relaySessionId);
};

describe('portal sessions across a backend restart', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps the student signed in after the server forgets the session', async () => {
    portalAcceptsToken();
    const { token, relaySessionId } = await signIn();

    restart(relaySessionId);
    const res = await request(app)
      .get('/api/v1/portal/sdk/session')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.realData).toBe(true);
  });

  it('asks for a new sign-in once the portal no longer accepts the saved token', async () => {
    portalAcceptsToken();
    const { token, relaySessionId } = await signIn();

    restart(relaySessionId);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } })
      );
    const res = await request(app)
      .get('/api/v1/portal/sdk/session')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('never stores the portal token in plain text', async () => {
    portalAcceptsToken();
    await signIn();

    const saved = await PortalSession.findById(ENROLLMENT).lean();

    expect(saved.payload).not.toContain('restore-portal-token');
  });
});
