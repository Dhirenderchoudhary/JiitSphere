const { isAwakeTime, startKeepAwake } = require('../../services/keepAwake');

// Times are UTC; IST is UTC+05:30.
const at = (utc) => new Date(`2026-10-18T${utc}:00Z`);

describe('keep-awake window (06:30 to 01:20 IST)', () => {
  it.each([
    ['01:00', true],
    ['12:00', true],
    ['19:49', true],
    ['19:50', false],
    ['23:00', false],
    ['00:59', false],
  ])('at %s UTC the backend is kept awake: %s', (utc, expected) => {
    expect(isAwakeTime(at(utc))).toBe(expected);
  });
});

describe('keep-awake pings', () => {
  let timer;

  afterEach(() => {
    clearInterval(timer);
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.KEEP_AWAKE_URL;
  });

  const runTenMinutesFrom = (utc) => {
    jest.useFakeTimers({ now: at(utc) });
    process.env.KEEP_AWAKE_URL = 'https://backend.example/health';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('ok'));
    timer = startKeepAwake();
    jest.advanceTimersByTime(10 * 60 * 1000);
    return fetchMock;
  };

  it('pings its own health URL every ten minutes during the day', () => {
    expect(runTenMinutesFrom('06:00')).toHaveBeenCalledWith('https://backend.example/health');
  });

  it('lets the backend sleep at night', () => {
    expect(runTenMinutesFrom('22:00')).not.toHaveBeenCalled();
  });
});
