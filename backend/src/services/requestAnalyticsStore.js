const MAX_RECENT = 50;
const MAX_DURATION_SAMPLES = 3000;
const RETENTION_DAYS = Math.max(7, Number(process.env.ANALYTICS_RETENTION_DAYS || 30));
const MAX_UNIQUE_SET_SIZE = Math.max(
  1000,
  Number(process.env.ANALYTICS_MAX_UNIQUE_SET_SIZE || 200000)
);
const MAX_BUCKET_SET_SIZE = Math.max(
  500,
  Number(process.env.ANALYTICS_MAX_BUCKET_SET_SIZE || 20000)
);
const PRUNE_EVERY_N_REQUESTS = 250;

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
    other: 0,
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
    other: 0,
  },
  uniqueUsers: new Set(),
  uniqueIps: new Set(),
  dailyUniqueIps: {},
  dailyRequests: {},
  recent: [],
  bySection: { portal: 0, studyMaterial: 0, admin: 0, auth: 0, other: 0 },
  sectionIps: {
    portal: new Set(),
    studyMaterial: new Set(),
    admin: new Set(),
    auth: new Set(),
    other: new Set(),
  },
  dailyBySection: {},
  dailySectionIps: {},
  hourlyVisitors: {},
  /* ── Real page-view tracking ── */
  pageViews: {
    total: 0,
    uniqueIps: new Set(),
    dailyViews: {},
    dailyUniqueIps: {},
    byPage: {},
    bySection: { portal: 0, studyMaterial: 0, admin: 0, superadmin: 0, home: 0, other: 0 },
    sectionIps: {
      portal: new Set(),
      studyMaterial: new Set(),
      admin: new Set(),
      superadmin: new Set(),
      home: new Set(),
      other: new Set(),
    },
    dailySectionIps: {},
    byDevice: { desktop: 0, mobile: 0, tablet: 0, bot: 0, other: 0 },
    byBrowser: {},
    byOs: {},
    byReferrer: {},
    hourlyViews: {},
    hourlyIps: {},
  },
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

const addToCappedSet = (targetSet, value, maxSize = MAX_UNIQUE_SET_SIZE) => {
  if (!(targetSet instanceof Set)) return;
  if (value === undefined || value === null || value === '') return;
  if (targetSet.has(value)) return;
  if (targetSet.size >= maxSize) {
    const oldest = targetSet.values().next().value;
    if (oldest !== undefined) {
      targetSet.delete(oldest);
    }
  }
  targetSet.add(value);
};

const pruneRetention = () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffKey = dateKey(cutoff);

  const pruneObjectByDateKey = (obj) => {
    for (const key of Object.keys(obj || {})) {
      if (key < cutoffKey) {
        delete obj[key];
      }
    }
  };

  pruneObjectByDateKey(state.dailyRequests);
  pruneObjectByDateKey(state.dailyUniqueIps);
  pruneObjectByDateKey(state.dailyBySection);
  pruneObjectByDateKey(state.dailySectionIps);
  pruneObjectByDateKey(state.pageViews.dailyViews);
  pruneObjectByDateKey(state.pageViews.dailyUniqueIps);
  pruneObjectByDateKey(state.pageViews.dailySectionIps);

  for (const key of Object.keys(state.hourlyVisitors || {})) {
    const dayKey = String(key).split('_')[0] || '';
    if (dayKey && dayKey < cutoffKey) {
      delete state.hourlyVisitors[key];
    }
  }

  for (const key of Object.keys(state.pageViews.hourlyIps || {})) {
    const dayKey = String(key).split('_')[0] || '';
    if (dayKey && dayKey < cutoffKey) {
      delete state.pageViews.hourlyIps[key];
      delete state.pageViews.hourlyViews[key];
    }
  }
};

const statusFamily = (statusCode) => {
  const code = Number(statusCode);
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'other';
};

const trackRequest = ({
  method,
  route,
  statusCode,
  durationMs,
  userId,
  ip,
  userAgent,
  referrer,
  at = new Date(),
}) => {
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
  state.routePerf[route].avgDurationMs = Number(
    (state.routePerf[route].totalDurationMs / state.routePerf[route].count).toFixed(2)
  );
  state.routePerf[route].maxDurationMs = Math.max(state.routePerf[route].maxDurationMs, duration);

  const family = statusFamily(statusCode);
  state.byStatusFamily[family] = (state.byStatusFamily[family] || 0) + 1;

  if (Number(statusCode) >= 400) {
    state.routeErrors[route] = (state.routeErrors[route] || 0) + 1;
  }

  if (userId) {
    addToCappedSet(state.uniqueUsers, String(userId).toLowerCase(), MAX_UNIQUE_SET_SIZE);
  }

  if (normalizedIp) {
    addToCappedSet(state.uniqueIps, normalizedIp, MAX_UNIQUE_SET_SIZE);
  }

  const day = dateKey(at);
  state.dailyRequests[day] = (state.dailyRequests[day] || 0) + 1;
  if (!state.dailyUniqueIps[day]) {
    state.dailyUniqueIps[day] = new Set();
  }
  if (normalizedIp) {
    addToCappedSet(state.dailyUniqueIps[day], normalizedIp, MAX_BUCKET_SET_SIZE);
  }

  const section = route.includes('/portal')
    ? 'portal'
    : route.includes('/material')
      ? 'studyMaterial'
      : route.includes('/admin')
        ? 'admin'
        : route.includes('/auth')
          ? 'auth'
          : 'other';
  state.bySection[section] = (state.bySection[section] || 0) + 1;
  if (normalizedIp) {
    if (!state.sectionIps[section]) state.sectionIps[section] = new Set();
    addToCappedSet(state.sectionIps[section], normalizedIp, MAX_BUCKET_SET_SIZE);
  }
  if (!state.dailyBySection[day]) state.dailyBySection[day] = {};
  state.dailyBySection[day][section] = (state.dailyBySection[day][section] || 0) + 1;
  if (!state.dailySectionIps[day]) state.dailySectionIps[day] = {};
  if (!state.dailySectionIps[day][section]) state.dailySectionIps[day][section] = new Set();
  if (normalizedIp)
    addToCappedSet(state.dailySectionIps[day][section], normalizedIp, MAX_BUCKET_SET_SIZE);

  const hKey = `${day}_${hourKey(at)}`;
  if (!state.hourlyVisitors[hKey]) state.hourlyVisitors[hKey] = new Set();
  if (normalizedIp) addToCappedSet(state.hourlyVisitors[hKey], normalizedIp, MAX_BUCKET_SET_SIZE);

  state.recent.unshift({
    at: new Date(at).toISOString(),
    method,
    route,
    statusCode,
    durationMs: duration,
    userId: userId || null,
    ip: normalizedIp || null,
    userAgent: userAgent || null,
    referrer: ref,
  });

  if (state.recent.length > MAX_RECENT) {
    state.recent.length = MAX_RECENT;
  }

  if (state.totalRequests % PRUNE_EVERY_N_REQUESTS === 0) {
    pruneRetention();
  }
};

/* ── Page-view tracking (real frontend visits) ── */
const classifyPage = (path) => {
  if (!path || path === '/') return 'home';
  if (path.startsWith('/portal')) return 'portal';
  if (path.startsWith('/study-material') || path.startsWith('/material/')) return 'studyMaterial';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/superadmin')) return 'superadmin';
  if (path.startsWith('/study-access')) return 'home';
  return 'other';
};

const trackPageView = ({ page, ip, userAgent, referrer, at = new Date() }) => {
  const normalizedIp = normalizeIp(ip);
  const device = detectDeviceType(userAgent);
  const browser = detectBrowser(userAgent);
  const os = detectOs(userAgent);
  const ref = normalizeReferrer(referrer);
  const day = dateKey(at);
  const hKey = `${day}_${hourKey(at)}`;
  const section = classifyPage(page);
  const pv = state.pageViews;

  pv.total += 1;
  if (normalizedIp) addToCappedSet(pv.uniqueIps, normalizedIp, MAX_UNIQUE_SET_SIZE);

  pv.dailyViews[day] = (pv.dailyViews[day] || 0) + 1;
  if (!pv.dailyUniqueIps[day]) pv.dailyUniqueIps[day] = new Set();
  if (normalizedIp) addToCappedSet(pv.dailyUniqueIps[day], normalizedIp, MAX_BUCKET_SET_SIZE);

  pv.byPage[page] = (pv.byPage[page] || 0) + 1;

  pv.bySection[section] = (pv.bySection[section] || 0) + 1;
  if (!pv.sectionIps[section]) pv.sectionIps[section] = new Set();
  if (normalizedIp) addToCappedSet(pv.sectionIps[section], normalizedIp, MAX_BUCKET_SET_SIZE);

  if (!pv.dailySectionIps[day]) pv.dailySectionIps[day] = {};
  if (!pv.dailySectionIps[day][section]) pv.dailySectionIps[day][section] = new Set();
  if (normalizedIp)
    addToCappedSet(pv.dailySectionIps[day][section], normalizedIp, MAX_BUCKET_SET_SIZE);

  pv.byDevice[device] = (pv.byDevice[device] || 0) + 1;
  pv.byBrowser[browser] = (pv.byBrowser[browser] || 0) + 1;
  pv.byOs[os] = (pv.byOs[os] || 0) + 1;
  pv.byReferrer[ref] = (pv.byReferrer[ref] || 0) + 1;

  pv.hourlyViews[hKey] = (pv.hourlyViews[hKey] || 0) + 1;
  if (!pv.hourlyIps[hKey]) pv.hourlyIps[hKey] = new Set();
  if (normalizedIp) addToCappedSet(pv.hourlyIps[hKey], normalizedIp, MAX_BUCKET_SET_SIZE);

  if (state.totalRequests % PRUNE_EVERY_N_REQUESTS === 0) {
    pruneRetention();
  }
};

const getSnapshot = () => {
  const avgDurationMs = state.totalRequests
    ? Number((state.totalDurationMs / state.totalRequests).toFixed(2))
    : 0;
  const sortedDurations = [...state.durationSamples].sort((a, b) => a - b);
  const p95DurationMs = sortedDurations.length
    ? sortedDurations[
        Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * 0.95))
      ]
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
      uniqueVisitors: state.dailyUniqueIps[key]?.size || 0,
    });
  }

  const last30Days = [];
  for (let i = 29; i >= 0; i -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = dateKey(day);
    const sectionDay = state.dailyBySection[key] || {};
    const sectionIps = state.dailySectionIps[key] || {};
    last30Days.push({
      date: key,
      count: state.dailyRequests[key] || 0,
      uniqueVisitors: state.dailyUniqueIps[key]?.size || 0,
      portal: sectionDay.portal || 0,
      studyMaterial: sectionDay.studyMaterial || 0,
      portalVisitors: sectionIps.portal?.size || 0,
      studyMaterialVisitors: sectionIps.studyMaterial?.size || 0,
    });
  }

  const last24Hours = [];
  for (let i = 23; i >= 0; i -= 1) {
    const slot = new Date();
    slot.setHours(slot.getHours() - i);
    const key = hourKey(slot);
    const daySlot = dateKey(slot);
    const hKey = `${daySlot}_${key}`;
    last24Hours.push({
      hour: key,
      count: state.byHour[key] || 0,
      visitors: state.hourlyVisitors[hKey]?.size || 0,
    });
  }

  const sectionVisitors = {};
  for (const [sec, ipSet] of Object.entries(state.sectionIps)) {
    sectionVisitors[sec] = ipSet.size;
  }

  /* ── Page-view snapshot ── */
  const pv = state.pageViews;

  const pvLast30Days = [];
  for (let i = 29; i >= 0; i -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = dateKey(day);
    const sectionIps = pv.dailySectionIps[key] || {};
    pvLast30Days.push({
      date: key,
      views: pv.dailyViews[key] || 0,
      visitors: pv.dailyUniqueIps[key]?.size || 0,
      portalVisitors: sectionIps.portal?.size || 0,
      studyMaterialVisitors: sectionIps.studyMaterial?.size || 0,
    });
  }

  const pvLast24Hours = [];
  for (let i = 23; i >= 0; i -= 1) {
    const slot = new Date();
    slot.setHours(slot.getHours() - i);
    const key = hourKey(slot);
    const daySlot = dateKey(slot);
    const hKey = `${daySlot}_${key}`;
    pvLast24Hours.push({
      hour: key,
      views: pv.hourlyViews[hKey] || 0,
      visitors: pv.hourlyIps[hKey]?.size || 0,
    });
  }

  const pvSectionVisitors = {};
  for (const [sec, ipSet] of Object.entries(pv.sectionIps)) {
    pvSectionVisitors[sec] = ipSet.size;
  }

  const pvTopBrowsers = Object.entries(pv.byBrowser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const pvTopOs = Object.entries(pv.byOs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const pvTopReferrers = Object.entries(pv.byReferrer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count }));

  const pvTopPages = Object.entries(pv.byPage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([page, count]) => ({ page, count }));

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
    visitsLast30Days: last30Days,
    bySection: state.bySection,
    sectionVisitors,
    requestsLast24Hours: last24Hours,
    recentRequests: state.recent,
    /* ── Real page-view data ── */
    pv: {
      totalViews: pv.total,
      totalVisitors: pv.uniqueIps.size,
      sectionVisitors: pvSectionVisitors,
      last30Days: pvLast30Days,
      last24Hours: pvLast24Hours,
      byDevice: pv.byDevice,
      topBrowsers: pvTopBrowsers,
      topOs: pvTopOs,
      topReferrers: pvTopReferrers,
      topPages: pvTopPages,
    },
  };
};

module.exports = {
  trackRequest,
  trackPageView,
  getSnapshot,
};
