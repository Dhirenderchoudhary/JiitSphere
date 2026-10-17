// Render's free plan sleeps the backend after 15 minutes without incoming
// requests, and waking it makes the next student wait about 20 seconds. A
// request to our own public URL goes back in through Render's router, so it
// counts as incoming. Pinging only from 06:30 to 01:20 IST keeps the backend to
// roughly 590 of the 750 free instance hours a month, which the workspace's
// other free services share.
const PING_EVERY_MS = 10 * 60 * 1000;
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const WAKE_AT = 6 * 60 + 30;
const SLEEP_AT = 1 * 60 + 20;

const isAwakeTime = (date) => {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const istMinutes = (utcMinutes + IST_OFFSET_MINUTES) % (24 * 60);
  return istMinutes >= WAKE_AT || istMinutes < SLEEP_AT;
};

const pingUrl = () =>
  process.env.KEEP_AWAKE_URL ||
  (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/health` : '');

const startKeepAwake = () => {
  const url = pingUrl();
  if (!url) return null;
  return setInterval(() => {
    if (isAwakeTime(new Date())) fetch(url).catch(() => null);
  }, PING_EVERY_MS).unref();
};

module.exports = { isAwakeTime, startKeepAwake };
