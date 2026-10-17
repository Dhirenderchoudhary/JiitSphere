const { PortalClient } = require('../../services/portalClient');

describe('PortalClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never merges simultaneous requests made with different tokens', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      await new Promise((r) => setTimeout(r, 20));
      return new Response(
        JSON.stringify({
          status: { responseStatus: 'Success' },
          response: { owner: init.headers.Authorization },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const ask = (token) =>
      new PortalClient({ cookies: {} }, { token, instituteid: 'JAYPEE' }).post(
        '/StudentPortalAPI/studentpersinfo/getstudent-personalinformation',
        { instituteid: 'JAYPEE' },
        { encrypted: false }
      );

    const [a, b] = await Promise.all([ask('token-a'), ask('token-b')]);

    expect(a).toEqual({ owner: 'Bearer token-a' });
    expect(b).toEqual({ owner: 'Bearer token-b' });
  });

  const portalReply = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const askOnce = () =>
    new PortalClient({ cookies: {} }, { token: 'retry-token', instituteid: 'JAYPEE' }).post(
      '/StudentPortalAPI/studentgradecard/getregistrationList',
      { instituteid: 'JAYPEE' },
      { encrypted: false }
    );

  it('retries once when the portal has a momentary server error', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(portalReply(500, { message: 'No message available' }))
      .mockResolvedValueOnce(
        portalReply(200, { status: { responseStatus: 'Success' }, response: { ok: true } })
      );

    await expect(askOnce()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an answer such as no records found', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        portalReply(404, { status: { responseStatus: 'Failed', errors: ['NO Attendance Found'] } })
      );

    await expect(askOnce()).rejects.toThrow('NO Attendance Found');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('renewing the portal sign-in', () => {
    const json = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const signedIn = () => ({
      cookies: {},
      authContext: {
        regdata: { username: '9921103001' },
        tokenDate: 'Sat Oct 17 2026',
        verifiedAt: Date.now(),
      },
    });
    const ask = (relaySession, path = '/StudentPortalAPI/studentgradecard/getregistrationList') =>
      new PortalClient(relaySession, {
        token: `renew-${Math.random()}`,
        instituteid: 'JAYPEE',
      }).post(path, { instituteid: 'JAYPEE' }, { encrypted: false });
    const portal = (renewal) =>
      jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('refreshTokenRequest'))
          return json(200, { response: { msg: renewal } });
        return portal.renewed
          ? json(200, { status: { responseStatus: 'Success' }, response: { ok: true } })
          : json(401, {});
      });

    it('renews the sign-in and repeats the request when the portal answers 401', async () => {
      const relaySession = signedIn();
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
        if (String(url).includes('refreshTokenRequest')) {
          expect(JSON.parse(init.body)).toEqual({
            username: '9921103001',
            tokendate: 'Sat Oct 17 2026',
          });
          relaySession.renewedByPortal = true;
          return json(200, { response: { msg: 'Success' } });
        }
        return relaySession.renewedByPortal
          ? json(200, { status: { responseStatus: 'Success' }, response: { ok: true } })
          : json(401, {});
      });

      await expect(ask(relaySession)).resolves.toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(relaySession.signInRejected).toBeUndefined();
    });

    it('marks the sign-in rejected when the portal will not renew it', async () => {
      const relaySession = signedIn();
      portal('Error');

      await expect(ask(relaySession)).rejects.toThrow('HTTP 401');
      expect(relaySession.signInRejected).toBe(true);
    });

    it('asks for one renewal when several requests fail together', async () => {
      const relaySession = signedIn();
      const fetchMock = portal('Error');

      await Promise.allSettled([
        ask(relaySession, '/StudentPortalAPI/a'),
        ask(relaySession, '/StudentPortalAPI/b'),
        ask(relaySession, '/StudentPortalAPI/c'),
      ]);

      const renewals = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('refreshTokenRequest')
      );
      expect(renewals).toHaveLength(1);
    });
  });
});
