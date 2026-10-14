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
});
