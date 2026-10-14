const { fetchAttendanceMeta } = require('../../services/portalAttendanceService');
const env = require('../../config/env');

const portalReply = (response) =>
  new Response(JSON.stringify({ status: { responseStatus: 'Success' }, response }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('portal refresh freshness', () => {
  let now;
  let portalCalls;

  beforeEach(() => {
    now = 1_000_000;
    portalCalls = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      portalCalls += 1;
      return portalReply({
        semlist: [{ registrationid: 'R26', registrationcode: '2026ODDSEM' }],
        headerlist: [{ stynumber: '7' }],
      });
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const askForMeta = (userid, forceRefresh) =>
    fetchAttendanceMeta(
      { cookies: {} },
      { token: `token-${userid}`, instituteid: 'JAYPEE', userid },
      { forceRefresh }
    );

  it('serves a refresh from cache while the data is younger than the sync interval', async () => {
    await askForMeta('student-a', false);
    const afterFirstLoad = portalCalls;

    now += env.portalRealtimeMinSyncIntervalMs - 1;
    const meta = await askForMeta('student-a', true);

    expect(portalCalls).toBe(afterFirstLoad);
    expect(meta.latestStynumber).toBe('7');
  });

  it('goes back to the portal once the data is older than the sync interval', async () => {
    await askForMeta('student-b', false);
    const afterFirstLoad = portalCalls;

    now += env.portalRealtimeMinSyncIntervalMs + 1;
    await askForMeta('student-b', true);

    expect(portalCalls).toBe(afterFirstLoad * 2);
  });
});
