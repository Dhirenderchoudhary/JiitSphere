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
});
