import { LAST_PORTAL_USER_ID, ATTENDANCE_TARGET_KEY_PREFIX } from './constants';

export const stepBadgeClass = (status) => {
  if (status === 'ok') return 'bg-green-100 text-green-700 border-green-300';
  if (status === 'failed') return 'bg-red-100 text-red-700 border-red-300';
  return 'bg-slate-100 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600';
};

export const toPercent = (n) => `${Number(n || 0).toFixed(0)}%`;

export const toFixedSafe = (value, digits = 2) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : Number(0).toFixed(digits);
};

export const toDisplayNumber = (value, digits = 1) => {
  if (value === null || value === undefined || String(value).trim() === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(digits);
};

export const formatCurrency = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(num);
};

export const deriveFeeStatus = (item = {}) => {
  const totalDemand = Number(item?.total_demand || 0);
  const paidAmount = Number(item?.paid_amount || 0);
  const dueAmount = Number(item?.due_amount || 0);
  const rawStatus = String(item?.status || '').trim().toLowerCase();

  if (dueAmount <= 0 && paidAmount > 0) return 'Paid';
  if (paidAmount > 0 && dueAmount > 0) return 'Partially Paid';
  if (totalDemand > 0 && paidAmount <= 0 && dueAmount > 0) return 'Unpaid';
  if (totalDemand > 0 && paidAmount <= 0 && dueAmount <= 0) return 'Unpaid';

  if (rawStatus.includes('partial')) return 'Partially Paid';
  if (rawStatus.includes('paid') || rawStatus.includes('clear') || rawStatus.includes('settled')) return 'Paid';
  if (rawStatus.includes('pending') || rawStatus.includes('unpaid') || rawStatus.includes('due')) return 'Unpaid';
  return 'Unknown';
};

export const feeStatusBadgeClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'bg-green-100 text-green-700';
  if (normalized.includes('partial')) return 'bg-amber-100 text-amber-700';
  if (normalized === 'unpaid') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600 dark:text-slate-300';
};

export const toDisplayMarks = (obtained, total) => {
  const hasObtained = obtained !== null && obtained !== undefined && String(obtained).trim() !== '';
  const hasTotal = total !== null && total !== undefined && String(total).trim() !== '';
  if (!hasObtained && !hasTotal) return '-';
  const left = hasObtained ? String(obtained) : '-';
  const right = hasTotal ? String(total) : '-';
  return `${left}/${right}`;
};

export const getAttendanceTargetStorageKey = () => {
  try {
    const userId = window.localStorage.getItem(LAST_PORTAL_USER_ID) || 'default';
    return `${ATTENDANCE_TARGET_KEY_PREFIX}:${String(userId).toLowerCase()}`;
  } catch (_error) {
    return `${ATTENDANCE_TARGET_KEY_PREFIX}:default`;
  }
};

export const parseExamDateToTs = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const text = String(value).trim();
  if (/^\d{13}$/.test(text)) return Number(text);
  if (/^\d{10}$/.test(text)) return Number(text) * 1000;

  const ddmmyy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (ddmmyy) {
    const dd = Number(ddmmyy[1]);
    const mm = Number(ddmmyy[2]);
    const yy = Number(ddmmyy[3]);
    const yyyy = ddmmyy[3].length === 2 ? (yy >= 70 ? 1900 + yy : 2000 + yy) : yy;
    return new Date(yyyy, mm - 1, dd).getTime();
  }

  const yyyymmdd = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (yyyymmdd) {
    const yyyy = Number(yyyymmdd[1]);
    const mm = Number(yyyymmdd[2]);
    const dd = Number(yyyymmdd[3]);
    return new Date(yyyy, mm - 1, dd).getTime();
  }

  const generic = new Date(text);
  if (Number.isNaN(generic.getTime())) return 0;
  return generic.getTime();
};

export const toExamDateLabel = (value) => {
  const ts = parseExamDateToTs(value);
  if (!ts) {
    const text = String(value || '').trim();
    if (!text || text === '-') return '';
    return text;
  }
  const date = new Date(ts);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

export const hasExamSignal = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === '-') return false;
  if (text.includes('pending')) return false;
  if (text === 'tba' || text === 'na' || text === 'n/a') return false;
  return true;
};

export const extractTimeFromText = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  // Find all time patterns (e.g. 10:00 AM, 12:00, 2:30 PM, 10 am)
  const regex = /\\b(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|am|pm)|\\d{1,2}:\\d{2})\\b/gi;
  const times = [...text.matchAll(regex)].map(m => m[1].replace(/\\s+/g, ' ').toUpperCase());
  
  if (times.length >= 2) {
      // Take the first and the very last matched times in the string to avoid duplicate pairs
      return `${times[0]} - ${times[times.length - 1]}`;
  }
  if (times.length === 1) {
      return times[0];
  }
  return text;
};

export const extactCleanTimeRange = (from, to) => {
  const cleanFrom = String(from || '').trim();
  const cleanTo = String(to || '').trim();
  if (cleanFrom && cleanTo) {
    if (cleanTo.toLowerCase().includes(cleanFrom.toLowerCase())) {
        return cleanTo;
    }
    if (cleanFrom.toLowerCase().includes(cleanTo.toLowerCase())) {
        return cleanFrom;
    }
    return `${cleanFrom} - ${cleanTo}`;
  }
  return cleanFrom || cleanTo || '';
};

export const toExamTimeLabel = (exam = {}) => {
  const direct = String(exam?.time || '').trim();
  if (hasExamSignal(direct)) {
    const extracted = extractTimeFromText(direct);
    return extracted || direct;
  }
  const raw = exam?.raw || {};
  const fromTime = raw?.datetimefrom || raw?.timefrom || raw?.fromtime || raw?.starttime || '';
  const toTime = raw?.datetimeupto || raw?.timeto || raw?.totime || raw?.endtime || '';
  
  if (fromTime || toTime) {
      const combined = extactCleanTimeRange(fromTime, toTime);
      const extracted = extractTimeFromText(combined);
      return extracted || combined;
  }

  const fromSlot = extractTimeFromText(exam?.slot);
  if (fromSlot) return fromSlot;
  const fromRawSlot = extractTimeFromText(raw?.slot || raw?.slotdesc || raw?.timeslot);
  if (fromRawSlot) return fromRawSlot;
  return '';
};

export const toExamSlotLabel = (exam = {}) => {
  const direct = String(exam?.slot || '').trim();
  if (hasExamSignal(direct)) return direct;

  const raw = exam?.raw || {};
  const fromTime = raw?.datetimefrom || raw?.timefrom || '';
  const toTime = raw?.datetimeupto || raw?.timeto || '';
  if (fromTime && toTime) return `${String(fromTime).trim()} - ${String(toTime).trim()}`;

  const candidate =
    raw?.slot || raw?.slotdesc || raw?.slotname || raw?.slotcode ||
    raw?.sessionname || raw?.examshift || raw?.shift || raw?.examslot || '';

  return hasExamSignal(candidate) ? String(candidate).trim() : '';
};

export const toExamRoomLabel = (exam = {}) => {
  const direct = String(exam?.room || '').trim();
  if (hasExamSignal(direct)) return direct;

  const raw = exam?.raw || {};
  const candidate =
    raw?.roomcode || raw?.room || raw?.roomno || raw?.roomnumber ||
    raw?.hall || raw?.hallname || raw?.examcenter || raw?.centrename ||
    raw?.venue || raw?.venuedesc || '';

  return hasExamSignal(candidate) ? String(candidate).trim() : '';
};

export const toExamSeatLabel = (exam = {}) => {
  const direct = String(exam?.seat_number || '').trim();
  if (hasExamSignal(direct)) return direct;

  const raw = exam?.raw || {};
  const candidate =
    raw?.seatno || raw?.seatnumber || raw?.seat || raw?.seat_no ||
    raw?.rollno || raw?.rollnumber || raw?.seating || '';

  return hasExamSignal(candidate) ? String(candidate).trim() : '';
};

export const shouldHideUnknownExam = (exam = {}) => {
  const subject = String(exam?.subject || '').trim().toLowerCase();
  const isUnknown = !subject || subject === 'subject' || subject === 'unknown' || subject === 'exam event';
  if (!isUnknown) return false;

  return !(
    hasExamSignal(exam?.date) ||
    hasExamSignal(exam?.slot) ||
    hasExamSignal(exam?.time) ||
    hasExamSignal(exam?.room)
  );
};

export const dateScore = (value) => parseExamDateToTs(value);

export const monthKeyFromDate = (value) => {
  const text = String(value || '');
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return 'unknown';
  return `${match[3]}-${match[2]}`;
};

export const monthLabelFromKey = (key) => {
  if (!key || key === 'unknown') return 'Unknown Month';
  const [yyyy, mm] = String(key).split('-');
  const date = new Date(Number(yyyy), Number(mm) - 1, 1);
  return date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
};

export const attendanceRatioText = (presentCount, totalCount) => {
  if (!Number(totalCount)) return '0/0';
  return `${presentCount}/${totalCount}`;
};

export const missOrNeedText = (attended, total, targetPercent) => {
  const a = Number(attended || 0);
  const t = Number(total || 0);
  const p = Number(targetPercent || 0);
  if (!p) return 'Select target %';
  if (!t) return 'Need class counts';
  if (p >= 100) {
    return a >= t ? 'Can miss 0' : `Need attend ${Math.max(t - a, 0)}`;
  }

  const currentPct = (a * 100) / t;
  if (currentPct >= p) {
    const canMiss = Math.floor((a * 100) / p - t);
    return `Can miss ${Math.max(canMiss, 0)}`;
  }

  // Extra classes that must be attended (assuming all upcoming classes are attended):
  // (a + x) / (t + x) >= p / 100  =>  x >= (p*t - 100*a) / (100 - p)
  const needed = Math.ceil((p * t - 100 * a) / (100 - p));
  return `Need attend ${Math.max(needed, 0)}`;
};

export const extractRatioFromRaw = (row = {}) => {
  for (const value of Object.values(row?.raw || {})) {
    if (typeof value !== 'string') continue;
    const match = value.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      const attended = Number(match[1]);
      const total = Number(match[2]);
      if (total > 0 && attended >= 0 && attended <= total) {
        return { attended, total, source: 'raw-ratio' };
      }
    }
  }
  return null;
};

export const deriveCountsFromPercent = (row, targetPct) => {
  const percent = Number(row?.LTpercantage || 0);
  const target = Number(targetPct || 0);
  if (!percent) return null;

  const isPlausiblePair = (attended, total, expectedPercent) => {
    if (!Number.isFinite(attended) || !Number.isFinite(total)) return false;
    if (total <= 0 || total > 500) return false;
    if (attended < 0 || attended > total) return false;
    const reconstructed = (attended / total) * 100;
    return Math.abs(reconstructed - expectedPercent) <= 0.6;
  };

  if (target && percent > target && Number(row?.canmissclasses || 0) > 0) {
    const m = Number(row.canmissclasses);
    const denominator = (percent * 100) / target - 100;
    if (denominator > 0) {
      const total = Math.round((m * 100) / denominator);
      const attended = Math.round((percent * total) / 100);
      if (isPlausiblePair(attended, total, percent)) {
        return { attended, total, source: 'derived-can-miss' };
      }
    }
  }

  if (target && percent < target && Number(row?.needattendclasses || 0) > 0) {
    const n = Number(row.needattendclasses);
    const delta = target - percent;
    if (delta > 0) {
      const total = Math.round((n * 100) / delta);
      const attended = Math.round((percent * total) / 100);
      if (isPlausiblePair(attended, total, percent)) {
        return { attended, total, source: 'derived-need-attend' };
      }
    }
  }

  // Avoid fabricating counts from percentage-only data for student-critical metrics.
  // We return null unless portal gives enough deterministic hints.
  return null;
};

export const resolveAttendanceCounts = (row, targetPct, options = {}) => {
  const { allowDerived = false } = options;
  const directTotal = Number(row?.totalclasses || 0);
  const directAttended = Number(row?.attendedclasses || 0);
  if (directTotal > 0) {
    return {
      attended: Math.max(0, Math.min(directAttended, directTotal)),
      total: directTotal,
      source: 'direct'
    };
  }

  const rawRatio = extractRatioFromRaw(row);
  if (rawRatio) return rawRatio;

  if (!allowDerived) return null;
  return deriveCountsFromPercent(row, targetPct);
};

export const buildAttendanceGuidance = (row, targetPct, options = {}) => {
  const target = Number(targetPct || 0);
  if (!target) return 'Select target %';

  const resolved = resolveAttendanceCounts(row, targetPct, { allowDerived: false });
  const hasOverride = options?.attended !== undefined && options?.total !== undefined;
  const attended = hasOverride
    ? Number(options?.attended || 0)
    : Number(resolved?.attended || row?.attendedclasses || 0);
  const total = hasOverride
    ? Number(options?.total || 0)
    : Number(resolved?.total || row?.totalclasses || 0);
  if (total > 0) return missOrNeedText(attended, total, target);

  const canMiss = Number(row?.canmissclasses || 0);
  if (canMiss > 0) return `Can miss ${canMiss}`;

  const needAttend = Number(row?.needattendclasses || 0);
  if (needAttend > 0) return `Need attend ${needAttend}`;

  const currentPct = Number(row?.LTpercantage || 0);
  if (currentPct >= target) {
    return 'Can miss 0';
  }
  return 'Need attend more';
};

export const monthStatsFromRows = (rows = []) => {
  const map = {};
  for (const entry of rows) {
    const key = monthKeyFromDate(entry.datetime);
    if (!map[key]) {
      map[key] = { key, present: 0, total: 0 };
    }
    map[key].total += 1;
    if (entry.present === 'Present') map[key].present += 1;
  }

  return Object.values(map).sort((a, b) => String(b.key).localeCompare(String(a.key)));
};

export const semesterSortScore = (semesterCode = '', registrationId = '') => {
  const text = String(semesterCode || '').toUpperCase();
  const yearMatch = text.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  const termScore = text.includes('EVE') || text.includes('EVEN') ? 3
    : text.includes('ODD') ? 2
    : text.includes('SUP') ? 1
    : text.includes('SUMMER') ? 1
    : 0;
  const tieBreaker = String(registrationId || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return year * 100000 + termScore * 1000 + tieBreaker;
};

export const normalizeCsvCell = (value) => {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const toLabel = (key = '') =>
  String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (ch) => ch.toUpperCase());

export const toPrettyValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  const text = String(value).trim();
  if (!text) return '';
  if (text === '-' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
  return text;
};

export const pickRenderablePairs = (obj = {}, hiddenKeys = [], limit = 8) => {
  const blocked = new Set(hiddenKeys.map((k) => String(k).toLowerCase()));
  const pairs = [];

  for (const [key, value] of Object.entries(obj || {})) {
    if (blocked.has(String(key).toLowerCase())) continue;
    const pretty = toPrettyValue(value);
    if (!pretty) continue;
    pairs.push([toLabel(key), pretty]);
    if (pairs.length >= limit) break;
  }

  return pairs;
};

export const flattenScalarPairs = (source, prefix = '', depth = 0, maxDepth = 2) => {
  if (source === null || source === undefined || depth > maxDepth) return [];

  if (Array.isArray(source)) {
    const scalarItems = source
      .map((item) => toPrettyValue(item))
      .filter(Boolean);
    if (scalarItems.length) {
      return [[prefix || 'value', scalarItems.join(', ')]];
    }

    return source.flatMap((item, idx) => flattenScalarPairs(item, prefix ? `${prefix}.${idx + 1}` : String(idx + 1), depth + 1, maxDepth));
  }

  if (typeof source === 'object') {
    return Object.entries(source).flatMap(([key, value]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return flattenScalarPairs(value, nextPrefix, depth + 1, maxDepth);
    });
  }

  const pretty = toPrettyValue(source);
  if (!pretty) return [];
  return [[prefix || 'value', pretty]];
};

export const pickIdPairs = (obj = {}, limit = 12) => {
  const idPairs = [];
  const seen = new Set();

  for (const [key, value] of Object.entries(obj || {})) {
    const low = String(key).toLowerCase();
    if (!/(^id$|id$|_id$|code$|registration|student|member|branch|program|subject|grade|event|client|institute)/.test(low)) {
      continue;
    }
    const pretty = toPrettyValue(value);
    if (!pretty) continue;
    if (seen.has(low)) continue;
    seen.add(low);
    idPairs.push([toLabel(key), pretty]);
    if (idPairs.length >= limit) break;
  }

  return idPairs;
};

export const attendanceGuidanceClass = (text = '') => {
  const low = String(text).toLowerCase();
  if (low.startsWith('can miss')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (low.startsWith('need attend')) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 dark:border-slate-700 bg-slate-50 text-slate-600 dark:text-slate-300';
};

export const extractRelayMessage = (payload) => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  return (
    payload?.status?.errors ||
    payload?.errors ||
    payload?.message ||
    payload?.status?.identifier ||
    ''
  );
};

export const relayAttemptLooksAuthenticated = (attempt) => {
  const payload = attempt?.response;
  if (!payload || typeof payload !== 'object') return false;

  const endpoint = String(attempt?.endpoint || '').toLowerCase();
  const responseStatus = String(payload?.status?.responseStatus || payload?.responseStatus || '').toLowerCase();
  const hasAuthArtifacts = Boolean(
    payload?.response?.token ||
      payload?.response?.jwt ||
      payload?.response?.regdata?.token ||
      payload?.response?.studentDetails ||
      payload?.response?.studentProfile ||
      payload?.response?.enrollmentno
  );

  const message = extractRelayMessage(payload);
  const hasFailureSignal = /invalid|captcha|fail|error|incorrect|unauthor/i.test(String(message));

  if (endpoint.includes('generatewebtoken')) {
    return (responseStatus === 'success' || responseStatus === 'ok') && !hasFailureSignal;
  }

  return (responseStatus === 'success' || responseStatus === 'ok') && hasAuthArtifacts && !hasFailureSignal;
};

export const relayNeedsEncryptedPayload = (attempts = []) => {
  if (!attempts.length) return false;
  const alreadyTriedEncryptedFlow = attempts.some((attempt) => {
    const endpoint = String(attempt?.endpoint || '').toLowerCase();
    const contentType = String(attempt?.contentType || '').toLowerCase();
    return endpoint.includes('generatewebtoken') || (endpoint.includes('pretoken-check') && contentType.includes('text/plain'));
  });

  if (alreadyTriedEncryptedFlow) {
    return false;
  }

  return attempts.every((attempt) => {
    const payload = attempt?.response;
    if (typeof payload !== 'string') return false;
    return attempt?.status === 200 && payload.trim() === '';
  });
};
