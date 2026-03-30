/**
 * In-memory store for study material Google-auth access analytics.
 * Resets on server restart. Add DB persistence later if needed.
 */

const store = {
  totalSignIns: 0,
  uniqueEmails: new Set(),
  /** @type {Record<string, number>} YYYY-MM-DD → count */
  dailySignIns: {},
  /** @type {Array<{email: string, at: string}>} */
  recentSignIns: [],
  startedAt: new Date().toISOString()
};

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

export function trackStudySignIn(email) {
  if (!email) return;
  store.totalSignIns += 1;
  store.uniqueEmails.add(email.toLowerCase());

  const today = new Date().toISOString().slice(0, 10);
  store.dailySignIns[today] = (store.dailySignIns[today] || 0) + 1;

  store.recentSignIns.unshift({ email: maskEmail(email), at: new Date().toISOString() });
  if (store.recentSignIns.length > 100) store.recentSignIns.pop();
}

export function getStudySnapshot() {
  const last7 = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7.push({ date: key, count: store.dailySignIns[key] || 0 });
  }

  return {
    totalSignIns: store.totalSignIns,
    uniqueUsers: store.uniqueEmails.size,
    last7Days: last7,
    recentSignIns: store.recentSignIns.slice(0, 20),
    startedAt: store.startedAt
  };
}
