const MAX_RECENT = 50;
const MAX_DURATION_SAMPLES = 3000;

const state = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  totalDurationMs: 0,
  durationSamples: [],
  byMethod: {},
  byRoute: {},
  byHour: {},
  byReferrer: {},
  byDevice: {
    desktop: 0,
    mobile: 0,
    tablet: 0,
    bot: 0,
    other: 0
  },
  byBrowser: {},
  byOs: {},
  routePerf: {},
  routeErrors: {},
  byStatusFamily: {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
    other: 0
  },
  uniqueUsers: new Set(),
  uniqueIps: new Set(),
  dailyUniqueIps: {},
  dailyRequests: {},
  recent: []
};

const normalizeIp = (ip) => {
  const text = String(ip || '').trim();
  if (!text) return null;
  if (text === '::1') return '127.0.0.1';
  return text.startsWith('::ffff:') ? text.slice(7) : text;
};

const normalizeReferrer = (referrer) => {
  const value = String(referrer || '').trim();
  if (!value) return 'direct';
  try {
    const url = new URL(value);
    return url.hostname || 'direct';
  } catch (_error) {
    return 'direct';
  }
};

const detectDeviceType = (userAgent) => {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'other';
  if (/bot|crawler|spider|slurp|bingpreview|preview/.test(ua)) return 'bot';
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua)) return 'mobile';
  if (/windows|macintosh|linux|x11/.test(ua)) return 'desktop';
  return 'other';
};

const detectBrowser = (userAgent) => {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'Unknown';
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('chrome/') && !ua.includes('edg/') && !ua.includes('opr/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  if (ua.includes('postmanruntime')) return 'Postman';
  if (ua.includes('node-fetch') || ua.includes('undici')) return 'NodeClient';
  return 'Other';
};

const detectOs = (userAgent) => {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'Unknown';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'iOS';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  return 'Other';
};

const dateKey = (value = new Date()) => {
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const hourKey = (value = new Date()) => {
  const date = new Date(value);
  return String(date.getHours()).padStart(2, '0');
};

const statusFamily = (statusCode) => {
  const code = Number(statusCode);
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'other';
};

const trackRequest = ({ method, route, statusCode, durationMs, userId, ip, userAgent, referrer, at = new Date() }) => {
  const duration = Number(durationMs) || 0;
  const device = detectDeviceType(userAgent);
  const browser = detectBrowser(userAgent);
  const os = detectOs(userAgent);
  const ref = normalizeReferrer(referrer);
  const normalizedIp = normalizeIp(ip);

  state.totalRequests += 1;
  state.totalDurationMs += duration;
  state.durationSamples.push(duration);
  if (state.durationSamples.length > MAX_DURATION_SAMPLES) {
    state.durationSamples.shift();
  }

  state.byMethod[method] = (state.byMethod[method] || 0) + 1;
  state.byRoute[route] = (state.byRoute[route] || 0) + 1;
  state.byHour[hourKey(at)] = (state.byHour[hourKey(at)] || 0) + 1;
  state.byReferrer[ref] = (state.byReferrer[ref] || 0) + 1;
  state.byDevice[device] = (state.byDevice[device] || 0) + 1;
  state.byBrowser[browser] = (state.byBrowser[browser] || 0) + 1;
  state.byOs[os] = (state.byOs[os] || 0) + 1;

  if (!state.routePerf[route]) {
    state.routePerf[route] = { count: 0, totalDurationMs: 0, avgDurationMs: 0, maxDurationMs: 0 };
  }
  state.routePerf[route].count += 1;
  state.routePerf[route].totalDurationMs += duration;
  state.routePerf[route].avgDurationMs = Number((state.routePerf[route].totalDurationMs / state.routePerf[route].count).toFixed(2));
  state.routePerf[route].maxDurationMs = Math.max(state.routePerf[route].maxDurationMs, duration);

  const family = statusFamily(statusCode);
  state.byStatusFamily[family] = (state.byStatusFamily[family] || 0) + 1;

  if (Number(statusCode) >= 400) {
    state.routeErrors[route] = (state.routeErrors[route] || 0) + 1;
  }

  if (userId) {
    state.uniqueUsers.add(String(userId).toLowerCase());
  }

  if (normalizedIp) {
    state.uniqueIps.add(normalizedIp);
  }

  const day = dateKey(at);
  state.dailyRequests[day] = (state.dailyRequests[day] || 0) + 1;
  if (!state.dailyUniqueIps[day]) {
    state.dailyUniqueIps[day] = new Set();
  }
  if (normalizedIp) {
    state.dailyUniqueIps[day].add(normalizedIp);
  }

  state.recent.unshift({
    at: new Date(at).toISOString(),
    method,
    route,
    statusCode,
    durationMs: duration,
    userId: userId || null,
    ip: normalizedIp || null,
    userAgent: userAgent || null,
    referrer: ref
  });

  if (state.recent.length > MAX_RECENT) {
    state.recent.length = MAX_RECENT;
  }
};

const getSnapshot = () => {
  const avgDurationMs = state.totalRequests ? Number((state.totalDurationMs / state.totalRequests).toFixed(2)) : 0;
  const sortedDurations = [...state.durationSamples].sort((a, b) => a - b);
  const p95DurationMs = sortedDurations.length
    ? sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * 0.95))]
    : 0;

  const sortedRoutes = Object.entries(state.byRoute)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([route, count]) => ({ route, count }));

  const topReferrers = Object.entries(state.byReferrer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count }));

  const topBrowsers = Object.entries(state.byBrowser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const topOperatingSystems = Object.entries(state.byOs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const topErrorRoutes = Object.entries(state.routeErrors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([route, errors]) => ({ route, errors }));

  const slowestRoutes = Object.entries(state.routePerf)
    .map(([route, perf]) => ({ route, ...perf }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 10);

  const last7Days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = dateKey(day);
    last7Days.push({
      date: key,
      count: state.dailyRequests[key] || 0,
      uniqueVisitors: state.dailyUniqueIps[key]?.size || 0
    });
  }

  const last24Hours = [];
  for (let i = 23; i >= 0; i -= 1) {
    const slot = new Date();
    slot.setHours(slot.getHours() - i);
    const key = hourKey(slot);
    last24Hours.push({ hour: key, count: state.byHour[key] || 0 });
  }

  return {
    startedAt: state.startedAt,
    totalRequests: state.totalRequests,
    avgResponseTimeMs: avgDurationMs,
    p95ResponseTimeMs: p95DurationMs,
    uniqueVisitors: state.uniqueUsers.size,
    uniqueIps: state.uniqueIps.size,
    byMethod: state.byMethod,
    byStatusFamily: state.byStatusFamily,
    byDevice: state.byDevice,
    topRoutes: sortedRoutes,
    topReferrers,
    topBrowsers,
    topOperatingSystems,
    topErrorRoutes,
    slowestRoutes,
    visitsLast7Days: last7Days,
    requestsLast24Hours: last24Hours,
    recentRequests: state.recent
  };
};

module.exports = {
  trackRequest,
  getSnapshot
};
