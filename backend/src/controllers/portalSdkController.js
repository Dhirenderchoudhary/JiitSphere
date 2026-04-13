// SPDX-License-Identifier: GPL-3.0-or-later
const { createOrUpdateSession, getSessionByOwner } = require('../services/ownPortalSdk');
const env = require('../config/env');
const { ensureOwnedSession, buildCookieHeader } = require('../services/portalRelayService');
const { encryptPortalPayload } = require('../utils/portalCrypto');

const PORTAL_TIME_ZONE = 'Asia/Kolkata';

const ownerKey = (req) => req.user?.userId || req.user?.email || 'unknown';

const portalOrigin = new URL(env.portalRelayBaseUrl).origin;

const toPortalUrl = (path) => new URL(path, portalOrigin).toString();

const parseRelayBody = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (_error) {
      return null;
    }
  }

  const text = await response.text();
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return text;
    }
  }
  return text;
};

const dateCode = (date = new Date(), timeZone = PORTAL_TIME_ZONE) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });

  const parts = formatter.formatToParts(date);
  const partValue = (type) => parts.find((item) => item.type === type)?.value || '';
  const weekdayLabel = partValue('weekday').toLowerCase();
  const weekdayMap = { sun: '0', mon: '1', tue: '2', wed: '3', thu: '4', fri: '5', sat: '6' };

  const dd = String(partValue('day')).padStart(2, '0');
  const mm = String(partValue('month')).padStart(2, '0');
  const yy = String(partValue('year')).slice(2);
  const dow = weekdayMap[weekdayLabel] || String(date.getDay());

  return `${dd.charAt(0)}${mm.charAt(0)}${yy.charAt(0)}${dow}${dd.charAt(1)}${mm.charAt(1)}${yy.charAt(1)}`;
};

const buildLocalNameHeader = (tokenDate = new Date().toString()) => {
  const head = String(tokenDate).substring(0, 4);
  const tail = String(tokenDate).substring(4, 9);
  return encryptPortalPayload(`${head}${dateCode(new Date(), PORTAL_TIME_ZONE)}${tail}`, new Date(), PORTAL_TIME_ZONE);
};

const looksLikeJsonParseError = (payload) => {
  const msg = String(payload?.status?.errors || payload?.message || '').toLowerCase();
  return msg.includes('json parse error') || msg.includes('unrecognized token');
};

const looksLikeUnsupportedContentType = (payload) => {
  const msg = String(payload?.status?.errors || payload?.message || '').toLowerCase();
  return msg.includes('content type') && msg.includes('not supported');
};

const buildCommonHeaders = (relaySession, authContext, contentType) => {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': contentType,
    Origin: 'https://webportal.jiit.ac.in:6011',
    Referer: 'https://webportal.jiit.ac.in:6011/studentportal/#/',
    'X-Requested-With': 'XMLHttpRequest'
  };

  const cookieHeader = buildCookieHeader(relaySession);
  if (cookieHeader) headers.Cookie = cookieHeader;

  if (authContext?.token) {
    headers.Authorization = `Bearer ${authContext.token}`;
    headers.LocalName = buildLocalNameHeader(authContext.tokenDate);
  }

  return headers;
};

const buildPortalNetworkErrorPayload = (path, error) => {
  const timeoutMs = Number(env.portalRequestTimeoutMs || 12000);
  const code = error?.cause?.code || error?.code || error?.name || 'PORTAL_FETCH_ERROR';
  const isAbortError = String(error?.name || '').toLowerCase() === 'aborterror' || String(code) === 'ABORT_ERR';
  const message = isAbortError
    ? `Portal request timed out after ${timeoutMs}ms`
    : error?.cause?.message || error?.message || 'Portal request failed';

  return {
    status: {
      responseStatus: 'FAILED',
      errors: [message]
    },
    meta: {
      networkError: true,
      code: String(code),
      path
    }
  };
};

const timedPortalFetch = async (url, init) => {
  const timeoutMs = Number(env.portalRequestTimeoutMs || 12000);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    return { response };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const postPortal = async (relaySession, authContext, path, payload, options = {}) => {
  const { encrypted = true } = options;
  const url = toPortalUrl(path);
  const networkFailure = (error) => ({
    ok: false,
    status: 0,
    data: buildPortalNetworkErrorPayload(path, error)
  });

  const postPlainJson = async () => {
    const plainBody = JSON.stringify(payload || {});
    const { response, error } = await timedPortalFetch(url, {
      method: 'POST',
      headers: buildCommonHeaders(relaySession, authContext, 'application/json'),
      body: plainBody
    });
    if (error) return networkFailure(error);
    const data = await parseRelayBody(response);
    return { ok: response.ok, status: response.status, data };
  };

  if (!encrypted) {
    return postPlainJson();
  }

  const encryptedBody = encryptPortalPayload(JSON.stringify(payload || {}), new Date(), PORTAL_TIME_ZONE);

  const encryptedAttempts = [
    {
      contentType: 'application/json',
      body: encryptedBody
    },
    {
      contentType: 'text/plain;charset=UTF-8',
      body: encryptedBody
    },
    {
      contentType: 'application/json',
      body: JSON.stringify(encryptedBody)
    }
  ];

  let last = { ok: false, status: 500, data: null };
  for (const attempt of encryptedAttempts) {
    const { response, error } = await timedPortalFetch(url, {
      method: 'POST',
      headers: buildCommonHeaders(relaySession, authContext, attempt.contentType),
      body: attempt.body
    });
    if (error) {
      last = networkFailure(error);
      break;
    }
    const data = await parseRelayBody(response);
    last = { ok: response.ok, status: response.status, data };

    if (response.ok && statusSuccess(data)) {
      return last;
    }

    if (!(response.status >= 400 && looksLikeJsonParseError(data))) {
      return last;
    }
  }

  if (last.status === 0) return last;

  if (last.status === 415 || looksLikeUnsupportedContentType(last.data)) {
    return postPlainJson();
  }

  return last;
};

const statusSuccess = (payload) => {
  const normalized = String(payload?.status?.responseStatus || payload?.responseStatus || '').toLowerCase();
  return normalized === 'success' || normalized === 'ok';
};

const extractStatusMessage = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const errors = payload?.status?.errors;
  if (Array.isArray(errors) && errors.length) return String(errors[0]);
  if (typeof errors === 'string' && errors) return errors;
  return String(payload?.message || payload?.status?.identifier || payload?.status?.responseStatus || '').trim();
};

const firstRegistration = (payload) => {
  const rows = payload?.response?.registrations || payload?.response?.semesterCodeinfo?.semestercode || [];
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0];
};

const numberOr = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const findNumericByRegex = (row = {}, regex) => {
  for (const [key, value] of Object.entries(row || {})) {
    if (!regex.test(String(key))) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const extractRatioCounts = (row = {}) => {
  for (const value of Object.values(row || {})) {
    if (typeof value !== 'string') continue;
    const match = value.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) continue;

    const attended = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(attended) || !Number.isFinite(total)) continue;
    if (total <= 0 || attended < 0 || attended > total) continue;

    return { attended, total };
  }
  return null;
};

const normalizeAttendancePair = ({ attended = 0, total = 0, percent = 0 }) => {
  const safeTotal = Number(total);
  const safeAttended = Number(attended);
  const safePercent = Number(percent);

  if (!Number.isFinite(safeTotal) || safeTotal <= 0 || safeTotal > 1000) {
    return { attended: 0, total: 0 };
  }

  if (!Number.isFinite(safeAttended) || safeAttended < 0) {
    return { attended: 0, total: 0 };
  }

  const boundedAttended = Math.min(safeAttended, safeTotal);

  if (safePercent > 0) {
    const computedPercent = (boundedAttended / safeTotal) * 100;
    // Reject obviously mismatched pairs (usually parsed from unrelated fields).
    if (Math.abs(computedPercent - safePercent) > 12) {
      return { attended: 0, total: 0 };
    }
  }

  return { attended: Math.round(boundedAttended), total: Math.round(safeTotal) };
};

const normalizeSemesters = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      registration_id: row?.registrationid || row?.registration_id || row?.value || null,
      registration_code:
        row?.registrationcode ||
        row?.registration_code ||
        row?.registrationdesc ||
        row?.label ||
        (row?.registrationid ? String(row.registrationid) : null),
      stynumber: row?.stynumber || row?.sty_number || null
    }))
    .filter((row) => row.registration_id && row.registration_code);
};

const semesterSortScore = (registrationCode = '', registrationId = '') => {
  const text = String(registrationCode || '').toUpperCase();
  const yearMatch = text.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  const term = text.includes('ODD') ? 2 : text.includes('EVE') || text.includes('EVEN') ? 1 : 0;
  const tie = String(registrationId || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return year * 100000 + term * 1000 + tie;
};

const sortSemestersDesc = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => {
    const scoreA = semesterSortScore(a?.registration_code, a?.registration_id);
    const scoreB = semesterSortScore(b?.registration_code, b?.registration_id);
    return scoreB - scoreA;
  });
};

const normalizeGradeRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    registration_id: row?.registrationid || row?.registration_id || null,
    registration_code:
      row?.registrationcode || row?.registration_code || row?.registrationdesc || row?.semestercode || 'Semester',
    sgpa: numberOr(
      row?.sgpa ?? row?.semestergpa ?? row?.semestersgpa ?? row?.sgpaobtained,
      0
    ),
    cgpa: numberOr(
      row?.cgpa ?? row?.cumulativecgpa ?? row?.overallcgpa ?? row?.semestercgpa ?? row?.sgpa,
      0
    ),
    raw: row
  }));
};

const normalizeSgpaCgpaRows = (rows = [], semesters = []) => {
  if (!Array.isArray(rows)) return [];

  return rows.map((row, index) => {
    const semLabel =
      pickFirst(row, ['registrationcode', 'registration_code', 'registrationdesc', 'semestercode', 'semestername']) ||
      semesters[index]?.registration_code ||
      `Semester ${index + 1}`;

    return {
      registration_id: pickFirst(row, ['registrationid', 'registration_id']) || semesters[index]?.registration_id || `sem-${index + 1}`,
      registration_code: semLabel,
      sgpa: numberOr(pickFirst(row, ['sgpa', 'semestersgpa', 'semestergpa', 'sgpaobtained']), 0),
      cgpa: numberOr(pickFirst(row, ['cgpa', 'cumulativecgpa', 'overallcgpa']), 0),
      raw: row
    };
  });
};

const mergeGradeSummaries = (primaryRows = [], fallbackRows = []) => {
  const bySem = new Map();

  const upsert = (row, preferIncoming = true) => {
    if (!row?.registration_id && !row?.registration_code) return;
    const key = String(row.registration_id || row.registration_code);
    const existing = bySem.get(key);

    if (!existing) {
      bySem.set(key, {
        registration_id: row.registration_id || key,
        registration_code: row.registration_code || 'Semester',
        sgpa: numberOr(row.sgpa, 0),
        cgpa: numberOr(row.cgpa, 0),
        raw: row.raw || null
      });
      return;
    }

    const incomingSgpa = numberOr(row.sgpa, 0);
    const incomingCgpa = numberOr(row.cgpa, 0);
    const currentSgpa = numberOr(existing.sgpa, 0);
    const currentCgpa = numberOr(existing.cgpa, 0);

    existing.registration_code = row.registration_code || existing.registration_code;
    if (preferIncoming) {
      existing.sgpa = incomingSgpa > 0 || currentSgpa <= 0 ? incomingSgpa : currentSgpa;
      existing.cgpa = incomingCgpa > 0 || currentCgpa <= 0 ? incomingCgpa : currentCgpa;
    } else {
      existing.sgpa = currentSgpa > 0 ? currentSgpa : incomingSgpa;
      existing.cgpa = currentCgpa > 0 ? currentCgpa : incomingCgpa;
    }
  };

  fallbackRows.forEach((row) => upsert(row, false));
  primaryRows.forEach((row) => upsert(row, true));

  return [...bySem.values()].sort((a, b) => {
    const scoreA = semesterSortScore(a.registration_code, a.registration_id);
    const scoreB = semesterSortScore(b.registration_code, b.registration_id);
    return scoreB - scoreA;
  });
};

const normalizeGradeCardRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      registrationid: pickFirst(row, ['registrationid', 'registration_id']),
      studentid: pickFirst(row, ['studentid', 'student_id', 'memberid']),
      branchid: pickFirst(row, ['branchid', 'branch_id']),
      programid: pickFirst(row, ['programid', 'program_id']),
      gradeid: pickFirst(row, ['gradeid', 'grade_id', 'grademasterid']),
      subjectid: pickFirst(row, ['subjectid', 'subject_id']),
      subjectcode: pickFirst(row, ['subjectcode', 'individualsubjectcode']) || null,
      subjectdesc: pickFirst(row, ['subjectdesc', 'subjectname']) || 'Subject',
      credit: numberOr(pickFirst(row, ['credit', 'credits', 'subjectcredit']), 0),
      marksobtained: pickFirst(row, [
        'marksobtained',
        'obtainedmarks',
        'totalobtainedmarks',
        'internalmarksobtained',
        'externalmarksobtained',
        'obtained',
        'marks'
      ]),
      totalmarks: pickFirst(row, ['totalmarks', 'maxmarks', 'maximummarks', 'outofmarks', 'maximum']),
      grade: pickFirst(row, ['grade', 'lettergrade']) || '-',
      gradepoint: pickFirst(row, ['gradepoint', 'grpoint', 'point']),
      raw: row
    }))
    .filter((row) => row.subjectdesc);
};

const normalizeSubjectDailyRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const presentRaw = pickFirst(row, ['present', 'attendance', 'status', 'attendancestatus', 'ispresent']);
    let present = String(presentRaw || '').trim();
    if (!present) present = 'Unknown';
    if (/^(p|present|1|true)$/i.test(present)) present = 'Present';
    if (/^(a|absent|0|false)$/i.test(present)) present = 'Absent';

    return {
      datetime: pickFirst(row, ['datetime', 'attendancedate', 'date', 'classdate', 'dateofclass']) || '-',
      present,
      topic: pickFirst(row, ['topic', 'lecturedetail', 'description']) || null,
      raw: row
    };
  });
};

const normalizeAttendanceRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const ltPercentage = numberOr(
      row?.LTpercantage ?? row?.LTpercentage ?? row?.ltpercentage ?? row?.totalpercentage,
      0
    );

    const attendedDirect = numberOr(
      pickFirst(row, [
        'ltattended',
        'LTattended',
        'Lattended',
        'tattended',
        'pattended',
        'attendedclass',
        'attendedclasses',
        'presentcount',
        'presentclasses'
      ]),
      0
    );

    const totalDirect = numberOr(
      pickFirst(row, [
        'lttotal',
        'LTtotal',
        'Ltotal',
        'ttotal',
        'ptotal',
        'totalclass',
        'totalclasses',
        'totalcount',
        'conductedclass',
        'heldclasses',
        'totalheldclasses'
      ]),
      0
    );

    const attendedRegex = numberOr(findNumericByRegex(row, /(lt.*attend|attend.*lt|attended.?class|present.?class|classattend|attendcount)/i), 0);
    const totalRegex = numberOr(findNumericByRegex(row, /(lt.*total|total.*class|class.?total|conducted|held.?class|delivered)/i), 0);

    const rawRatio = extractRatioCounts(row);

    let attendedclasses = attendedDirect > 0 ? attendedDirect : attendedRegex;
    let totalclasses = totalDirect > 0 ? totalDirect : totalRegex;

    if (!(attendedclasses > 0 && totalclasses > 0) && rawRatio) {
      attendedclasses = rawRatio.attended;
      totalclasses = rawRatio.total;
    }

    const reliablePair = normalizeAttendancePair({
      attended: attendedclasses,
      total: totalclasses,
      percent: ltPercentage
    });

    return {
      subjectcode: row?.subjectcode || row?.individualsubjectcode || row?.subjectdesc || 'SUBJECT',
      subjectdesc: row?.subjectdesc || row?.subjectname || row?.subjectcode || 'Subject',
      subjectid: row?.subjectid || null,
      individualsubjectcode: row?.individualsubjectcode || row?.subjectcode || null,
      Lsubjectcomponentid: row?.Lsubjectcomponentid || row?.lsubjectcomponentid || null,
      Tsubjectcomponentid: row?.Tsubjectcomponentid || row?.tsubjectcomponentid || null,
      Psubjectcomponentid: row?.Psubjectcomponentid || row?.psubjectcomponentid || null,
      Lpercentage: numberOr(row?.Lpercentage ?? row?.lpercentage ?? row?.lecturepercentage, 0),
      Tpercentage: numberOr(row?.Tpercentage ?? row?.tpercentage ?? row?.tutorialpercentage, 0),
      Ppercentage: numberOr(row?.Ppercentage ?? row?.ppercentage ?? row?.practicalpercentage, 0),
      LTpercantage: ltPercentage,
      attendedclasses: reliablePair.attended,
      totalclasses: reliablePair.total,
      canmissclasses: numberOr(pickFirst(row, ['canmiss', 'canmissclass', 'canmissclasses', 'canmisscount']), 0),
      needattendclasses: numberOr(pickFirst(row, ['needattend', 'needtoattend', 'requiredclasses', 'mustattend']), 0),
      raw: row
    };
  });
};

const normalizeRegisteredSubjects = (payload) => {
  const extractCandidateSubjectRows = (source = {}) => {
    const response = source?.response || source || {};
    const nodes = collectObjectNodes(response, 0, 4);
    const tokens = ['subject', 'faculty', 'employee', 'registration', 'credit', 'component'];

    let bestRows = [];
    let bestScore = 0;

    for (const node of nodes) {
      for (const value of Object.values(node || {})) {
        if (!Array.isArray(value) || !value.length || typeof value[0] !== 'object') continue;
        const localScore = value.reduce((acc, row) => {
          const rowKeys = Object.keys(row || {}).map((key) => normalizeKey(key));
          const rowSignal = tokens.some((token) => rowKeys.some((key) => key.includes(token))) ? 1 : 0;
          return acc + rowSignal;
        }, 0);
        if (localScore > bestScore) {
          bestRows = value;
          bestScore = localScore;
        }
      }
    }

    return bestRows;
  };

  const response = payload?.response;
  const directRows = response?.registrations || response?.registrationlist || response?.subjectlist || response?.subjects || response;
  const rows = Array.isArray(directRows) ? directRows : extractCandidateSubjectRows(payload);
  if (!Array.isArray(rows)) return { registered: [], faculties: [] };

  const registered = rows
    .map((row) => row?.subjectdesc || row?.subjectdescription || row?.subjectname || row?.coursename || row?.subjecttitle || row?.subjectcode)
    .filter(Boolean);
  const faculties = rows.map((row) => row?.employeename || row?.facultyname || row?.facultydesc || row?.employeecode || 'Faculty');

  const details = rows.map((row) => ({
    registrationid: row?.registrationid || row?.registration_id || null,
    studentid: row?.studentid || row?.student_id || row?.memberid || null,
    branchid: row?.branchid || row?.branch_id || null,
    programid: row?.programid || row?.program_id || null,
    facultyid: row?.employeeid || row?.employeecode || row?.facultyid || null,
    subjectid: row?.subjectid || row?.subject_id || null,
    subjectcode:
      row?.subjectcode ||
      row?.individualsubjectcode ||
      row?.subject_code ||
      row?.subcode ||
      null,
    subjectdesc:
      row?.subjectdesc ||
      row?.subjectdescription ||
      row?.subjectname ||
      row?.coursename ||
      row?.subjecttitle ||
      row?.name ||
      row?.subjectcode ||
      'Subject',
    credits: row?.credit ?? row?.credits ?? row?.subjectcredit ?? null,
    component: row?.subjectcomponent || row?.component || row?.subtype || null,
    section: row?.sectioncode || row?.section || null,
    faculty: row?.employeename || row?.facultyname || row?.facultydesc || row?.employeecode || 'Faculty',
    raw: row
  }));

  return { registered, faculties, details };
};

const pickFirst = (obj, keys = []) => {
  const lowerKeyMap = Object.keys(obj || {}).reduce((acc, key) => {
    acc[String(key).toLowerCase()] = key;
    return acc;
  }, {});

  for (const key of keys) {
    const directValue = obj?.[key];
    const resolvedKey =
      directValue !== undefined
        ? key
        : lowerKeyMap[String(key).toLowerCase()] || null;
    const value = resolvedKey ? obj?.[resolvedKey] : undefined;

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
};

const extractScalarFields = (obj = {}, blockedKeys = []) => {
  const blocked = new Set(blockedKeys.map((key) => String(key).toLowerCase()));
  const out = {};

  for (const [key, value] of Object.entries(obj || {})) {
    if (blocked.has(String(key).toLowerCase())) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    if (String(value).trim() === '') continue;
    out[key] = value;
  }

  return out;
};

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const collectObjectNodes = (source, depth = 0, maxDepth = 4) => {
  if (!source || depth > maxDepth) return [];
  if (Array.isArray(source)) {
    return source.flatMap((item) => collectObjectNodes(item, depth + 1, maxDepth));
  }
  if (typeof source !== 'object') return [];

  const children = Object.values(source).flatMap((value) => collectObjectNodes(value, depth + 1, maxDepth));
  return [source, ...children];
};

const pickByKeyContains = (obj = {}, tokens = []) => {
  const normalizedTokens = tokens.map((token) => normalizeKey(token)).filter(Boolean);
  for (const [key, value] of Object.entries(obj || {})) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    if (typeof value === 'object') continue;
    const keyNorm = normalizeKey(key);
    if (normalizedTokens.some((token) => keyNorm.includes(token))) {
      return value;
    }
  }
  return null;
};

const extractBestProfileSource = (payload = {}) => {
  const response = payload?.response || payload || {};
  const nodes = collectObjectNodes(response);
  if (!nodes.length) return null;

  const profileSignals = [
    'studentname',
    'name',
    'enrollment',
    'program',
    'branch',
    'semester',
    'email',
    'mobile',
    'phone',
    'gender',
    'dob',
    'birth',
    'address'
  ];

  let best = null;
  let bestScore = -1;

  for (const node of nodes) {
    const keys = Object.keys(node || {}).map((key) => normalizeKey(key));
    const score = profileSignals.reduce((acc, signal) => {
      const normalizedSignal = normalizeKey(signal);
      return acc + (keys.some((key) => key.includes(normalizedSignal)) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }

  return bestScore >= 2 ? best : null;
};

const pickAcrossNodesByKeys = (nodes = [], keys = []) => {
  for (const node of nodes) {
    const value = pickFirst(node || {}, keys);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
};

const pickAcrossNodesByContains = (nodes = [], tokens = []) => {
  for (const node of nodes) {
    const value = pickByKeyContains(node || {}, tokens);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
};

const pickProfileField = (nodes = [], keys = [], contains = []) => {
  return pickAcrossNodesByKeys(nodes, keys) || pickAcrossNodesByContains(nodes, contains);
};

const extractCandidateFeeRows = (payload = {}) => {
  const response = payload?.response || payload || {};
  const nodes = collectObjectNodes(response);
  const tokenSet = ['fee', 'demand', 'paid', 'due', 'outstanding', 'amount', 'balance', 'fine'];

  let bestRows = [];
  let bestScore = 0;

  for (const node of nodes) {
    for (const value of Object.values(node || {})) {
      if (!Array.isArray(value) || !value.length || typeof value[0] !== 'object') continue;
      const localScore = value.reduce((acc, row) => {
        const rowKeys = Object.keys(row || {}).map((key) => normalizeKey(key));
        const rowSignal = tokenSet.some((token) => rowKeys.some((key) => key.includes(token))) ? 1 : 0;
        return acc + rowSignal;
      }, 0);

      if (localScore > bestScore) {
        bestScore = localScore;
        bestRows = value;
      }
    }
  }

  return bestRows;
};

const mapProfile = (studentInfo = {}) => {
  const source = Array.isArray(studentInfo) ? studentInfo[0] || {} : studentInfo;
  const nodes = collectObjectNodes(source, 0, 5);
  const pick = (keys = [], contains = []) => pickProfileField(nodes, keys, contains);

  const normalized = {
    studentname: pick(['studentname', 'name', 'student_name'], ['student name', 'name']),
    enrollmentno: pick(['enrollmentno', 'enrollment', 'enrollno', 'enrollmentnumber'], ['enrollment']),
    apaarid: pick(['apaarid', 'apaar_id', 'abcid'], ['apaar', 'abc id']),
    program: pick(['program', 'programdesc', 'programname', 'programcode'], ['program', 'course', 'degree']),
    programdesc: pick(['programdesc', 'programdescription'], ['program desc', 'program description']),
    semester: pick(['semester', 'currentsemester', 'stynumber', 'stymax', 'semestercode'], ['semester', 'term']),
    sectioncode: pick(['sectioncode', 'section', 'sec', 'sectionname'], ['section']),
    batch: pick(['batch', 'batchyear', 'admissionbatch'], ['batch']),
    academicyear: pick(['academicyear', 'academic_year'], ['academic year']),
    admissionyear: pick(['admissionyear', 'yearofadmission'], ['admission year']),
    instituteemail: pick(['instituteemail', 'studentemail', 'studentemailid'], ['institute email', 'student email']),
    personalemail: pick(['personalemail', 'personal_email', 'alt_email', 'studentpersonalemailid', 'parentemailid'], ['personal email', 'parent email']),
    fathername: pick(['fathername', 'father_name', 'fathersname'], ['father name']),
    mothername: pick(['mothername', 'mother_name', 'mothersname'], ['mother name']),
    gender: pick(['gender'], ['gender']),
    dateofbirth: pick(['dateofbirth', 'dob', 'birthdate', 'studentdob'], ['date of birth', 'dob']),
    mobile: pick(['mobileno', 'mobile', 'phone', 'studentmobile', 'studentcellno'], ['mobile', 'phone', 'cell']),
    alternatecontact: pick(['alternatecontact', 'altmobile', 'alternate_mobile', 'parentcellno', 'parenttelephoneno'], ['alternate contact', 'guardian mobile', 'parent mobile']),
    bloodgroup: pick(['bloodgroup', 'blood_group'], ['blood group']),
    category: pick(['category'], ['category']),
    nationality: pick(['nationality'], ['nationality']),
    designation: pick(['designation'], ['designation']),
    studentid: pick(['studentid', 'student_id'], ['student id']),
    memberid: pick(['memberid', 'member_id'], ['member id']),
    branchid: pick(['branchid', 'branch_id'], ['branch id']),
    branchcode: pick(['branchcode', 'branch_code'], ['branch code']),
    branchdesc: pick(['branchdesc', 'branchdescription'], ['branch desc', 'branch description']),
    programid: pick(['programid', 'program_id'], ['program id']),
    instituteid: pick(['instituteid', 'institute_id'], ['institute id']),
    clientid: pick(['clientid', 'client_id'], ['client id']),
    userid: pick(['userid', 'user_id'], ['user id']),
    registrationno: pick(['registrationno', 'registration_no'], ['registration no']),
    institutecode: pick(['institutecode', 'institute_code'], ['institute code']),
    address: pick(['address', 'currentaddress', 'caddress'], ['address', 'current address']),
    permanentaddress: pick(['permanentaddress', 'permanent_address', 'paddress'], ['permanent address']),
    city: pick(['city', 'cityname', 'ccityname', 'pcityname'], ['city']),
    state: pick(['state', 'statename', 'cstate', 'cstatename', 'pstatename'], ['state']),
    pincode: pick(['pincode', 'zip', 'postalcode', 'cpostalcode', 'ppostalcode'], ['postal code', 'pincode', 'zip']),
    cdistrict: pick(['cdistrict'], ['district']),
    studentphoto: pick(['studentphoto', 'studentimage', 'profilephoto', 'photo', 'photobase64'], ['profile photo', 'student photo', 'photo base64'])
  };

  return {
    ...normalized,
    ...extractScalarFields(source, Object.keys(normalized))
  };
};

const mapAttendanceHeaderToProfile = (header = {}, latestSemesterCode = null) => ({
  studentname: pickFirst(header, ['name', 'studentname']),
  enrollmentno: pickFirst(header, ['enrollmentno', 'enrollment']),
  program: pickFirst(header, ['programdesc', 'program', 'branchdesc']),
  semester: latestSemesterCode || null,
  studentid: pickFirst(header, ['studentid', 'student_id', 'memberid']),
  branchid: pickFirst(header, ['branchid', 'branch_id']),
  programid: pickFirst(header, ['programid', 'program_id'])
});

const getSemesterById = (semesters = [], registrationId) =>
  semesters.find((sem) => String(sem.registration_id) === String(registrationId)) || null;

const normalizeGradeCardSummaries = (semesters = [], gradeCards = {}) => {
  const semesterIds = Object.keys(gradeCards || {});
  if (!semesterIds.length) return [];

  const entries = semesterIds
    .map((registrationId) => {
      const rows = Array.isArray(gradeCards[registrationId]) ? gradeCards[registrationId] : [];
      const sem = getSemesterById(semesters, registrationId);

      let weightedPoints = 0;
      let totalCredits = 0;
      let plainPoints = 0;
      let plainCount = 0;

      rows.forEach((row) => {
        const gp = numberOr(row?.gradepoint, NaN);
        const credit = numberOr(row?.credit, 0);
        if (Number.isFinite(gp)) {
          plainPoints += gp;
          plainCount += 1;
          if (credit > 0) {
            weightedPoints += gp * credit;
            totalCredits += credit;
          }
        }
      });

      const sgpa = totalCredits > 0 ? weightedPoints / totalCredits : plainCount > 0 ? plainPoints / plainCount : 0;

      return {
        registration_id: registrationId,
        registration_code: sem?.registration_code || registrationId,
        credits: totalCredits,
        sgpa,
        cgpa: 0
      };
    })
    .sort((a, b) => semesterSortScore(a.registration_code, a.registration_id) - semesterSortScore(b.registration_code, b.registration_id));

  let cumulativePoints = 0;
  let cumulativeCredits = 0;

  entries.forEach((row) => {
    if (row.credits > 0) {
      cumulativePoints += row.sgpa * row.credits;
      cumulativeCredits += row.credits;
    }
    row.cgpa = cumulativeCredits > 0 ? cumulativePoints / cumulativeCredits : row.sgpa;
  });

  return entries
    .map((row) => ({
      registration_id: row.registration_id,
      registration_code: row.registration_code,
      sgpa: numberOr(row.sgpa, 0),
      cgpa: numberOr(row.cgpa, 0)
    }))
    .sort((a, b) => semesterSortScore(b.registration_code, b.registration_id) - semesterSortScore(a.registration_code, a.registration_id));
};

const buildAuthContextFromRelaySession = (relaySession) => {
  const regdata = relaySession?.authContext?.regdata || {};
  return {
    token: regdata?.token || null,
    clientid: regdata?.clientid || null,
    instituteid: regdata?.institutelist?.[0]?.value || regdata?.instituteid || null,
    tokenDate: relaySession?.authContext?.tokenDate || new Date().toString(),
    name: regdata?.name || null,
    enrollmentno: regdata?.enrollmentno || null,
    userid: regdata?.userid || null,
    memberid: regdata?.memberid || null,
    membertype: regdata?.membertype || null
  };
};

const extractCandidateExamRows = (payload = {}) => {
  const response = payload?.response || payload || {};
  const nodes = collectObjectNodes(response, 0, 4);
  const tokens = ['exam', 'subject', 'slot', 'date', 'room', 'event', 'schedule', 'time'];

  let bestRows = [];
  let bestScore = 0;

  for (const node of nodes) {
    for (const value of Object.values(node || {})) {
      if (!Array.isArray(value) || !value.length || typeof value[0] !== 'object') continue;
      const localScore = value.reduce((acc, row) => {
        const rowKeys = Object.keys(row || {}).map((key) => normalizeKey(key));
        const rowSignal = tokens.some((token) => rowKeys.some((key) => key.includes(token))) ? 1 : 0;
        return acc + rowSignal;
      }, 0);
      if (localScore > bestScore) {
        bestRows = value;
        bestScore = localScore;
      }
    }
  }

  return bestRows;
};

const pad2 = (value) => String(value).padStart(2, '0');

const formatExamDateToken = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)}`;
};

const extractDateAndTimeFromString = (input = '') => {
  const text = String(input || '').trim();
  if (!text) return { date: '-', time: '-' };

  const dateFirst = text.match(/^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(.+)$/);
  if (dateFirst) {
    return { date: dateFirst[1], time: dateFirst[2] };
  }

  const isoFirst = text.match(/^(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})(?:[T\s]+(.+))?$/);
  if (isoFirst) {
    return { date: isoFirst[1], time: isoFirst[2] || '-' };
  }

  return { date: text, time: '-' };
};

const parseDateCandidateToDate = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  const dotNetTicks = text.match(/\/Date\((\d{10,14})\)\//i);
  if (dotNetTicks) {
    const millis = Number(dotNetTicks[1]);
    if (Number.isFinite(millis)) {
      const date = new Date(millis);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  if (/^\d{13}$/.test(text)) {
    const date = new Date(Number(text));
    if (!Number.isNaN(date.getTime())) return date;
  }

  if (/^\d{10}$/.test(text)) {
    const date = new Date(Number(text) * 1000);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const ddmmyy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (ddmmyy) {
    const dd = Number(ddmmyy[1]);
    const mm = Number(ddmmyy[2]);
    const yyRaw = Number(ddmmyy[3]);
    const yyyy = ddmmyy[3].length === 2 ? (yyRaw >= 70 ? 1900 + yyRaw : 2000 + yyRaw) : yyRaw;
    const date = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const yyyymmdd = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (yyyymmdd) {
    const yyyy = Number(yyyymmdd[1]);
    const mm = Number(yyyymmdd[2]);
    const dd = Number(yyyymmdd[3]);
    const date = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const generic = new Date(text);
  if (!Number.isNaN(generic.getTime())) return generic;
  return null;
};

const formatExamDateValue = (value) => {
  const parsed = parseDateCandidateToDate(value);
  if (!parsed) return '-';
  return formatExamDateToken(parsed);
};

const formatExamTimeValue = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return '-';
  const text = String(value).trim();
  if (!text) return '-';

  const fromTimestamp = parseDateCandidateToDate(text);
  if (fromTimestamp && /^\d{10,13}$/.test(text)) {
    return fromTimestamp.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  const simpleTime = text.match(/(\d{1,2}:\d{2})(?::\d{2})?\s*([AP]M)?/i);
  if (simpleTime) {
    const time = simpleTime[1];
    const period = (simpleTime[2] || '').toUpperCase();
    return `${time}${period ? ` ${period}` : ''}`;
  }

  return text;
};

const extractTimeRangeFromText = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;

  const rangeMatch = text.match(
    /(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:-|to|–|—)\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
  );
  if (!rangeMatch) return null;
  const left = rangeMatch[1].replace(/\s+/g, ' ').trim();
  const right = rangeMatch[2].replace(/\s+/g, ' ').trim();
  return `${left} - ${right}`.toUpperCase();
};

const hasMeaningfulExamValue = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === '-') return false;
  if (text.includes('pending')) return false;
  if (text === 'tba' || text === 'na' || text === 'n/a') return false;
  return true;
};

const shouldDropUnknownExamRow = (row = {}) => {
  const subjectText = String(row?.subject || '').trim().toLowerCase();
  const unknownSubject = !subjectText || subjectText === 'subject' || subjectText === 'exam event' || subjectText === 'unknown';
  if (!unknownSubject) return false;

  const hasSignals =
    hasMeaningfulExamValue(row?.date) ||
    hasMeaningfulExamValue(row?.slot) ||
    hasMeaningfulExamValue(row?.time) ||
    hasMeaningfulExamValue(row?.room);

  return !hasSignals;
};

const normalizeExamRows = (payload) => {
  const response = payload?.response || {};
  const candidates = [
    response?.subjectinfo,
    response?.examSchedule,
    response?.examdetails,
    response?.examlist,
    response?.timetable,
    Array.isArray(response) ? response : null,
    extractCandidateExamRows(payload)
  ];

  const rawRows = candidates
    .filter((rows) => Array.isArray(rows) && rows.length)
    .flat();

  const mapped = rawRows.map((row) => {
    const firstMeaningful = (...values) => values.find((value) => hasMeaningfulExamValue(value)) || null;
    const dynamicDateValue = pickByKeyContains(row, ['exam date', 'schedule date', 'date', 'exam on', 'paper date']);
    const dynamicSlotValue = pickByKeyContains(row, ['slot', 'shift', 'session', 'period', 'window']);
    const dynamicTimeValue = pickByKeyContains(row, ['exam time', 'time', 'timing', 'slot time', 'from time', 'to time']);
    const dynamicRoomValue = pickByKeyContains(row, ['room', 'hall', 'center', 'venue', 'block', 'building']);
    const dynamicSeatValue = pickByKeyContains(row, ['seat', 'roll']);

    const examDateTime =
      row?.examdatetime ||
      row?.examdateandtime ||
      null;

    const slotStart =
      row?.datetimefrom ||
      row?.timefrom ||
      row?.starttime ||
      row?.fromtime ||
      row?.from_time ||
      row?.examstarttime ||
      row?.exam_start_time ||
      row?.slotstarttime ||
      row?.slot_start_time ||
      row?.slotfrom ||
      null;
    const slotEnd =
      row?.datetimeupto ||
      row?.timeto ||
      row?.endtime ||
      row?.totime ||
      row?.to_time ||
      row?.examendtime ||
      row?.exam_end_time ||
      row?.slotendtime ||
      row?.slot_end_time ||
      row?.slotto ||
      null;
    const combinedSlot = slotStart && slotEnd ? `${slotStart} - ${slotEnd}` : null;
    const parsedDateFromDateTime =
      typeof examDateTime === 'string' && examDateTime.trim() && examDateTime.includes(' ')
        ? examDateTime.split(' ')[0]
        : null;
    const parsedTimeFromDateTime =
      typeof examDateTime === 'string' && examDateTime.trim()
        ? extractDateAndTimeFromString(examDateTime).time
        : null;
    const parsedDateAndTime = extractDateAndTimeFromString(examDateTime || '');
    const rawDateValue =
      row?.datetime ||
      row?.date ||
      row?.examdate ||
      row?.exam_date ||
      row?.scheduledate ||
      row?.paperdate ||
      row?.examon ||
      row?.examdt ||
      row?.dateofexam ||
      parsedDateFromDateTime ||
      parsedDateAndTime.date ||
      row?.eventdate ||
      row?.slotdate ||
      row?.examfrom ||
      row?.eventfrom ||
      row?.examtimestamp ||
      row?.examdatetimeinmillis ||
      row?.examdatemillis ||
      row?.dateinmillis ||
      dynamicDateValue ||
      '-';
    const rawTimeValue =
      combinedSlot ||
      row?.time ||
      row?.timing ||
      row?.examtime ||
      row?.exam_time ||
      row?.examtiming ||
      row?.paperstarttime ||
      row?.paperendtime ||
      row?.start_time ||
      row?.end_time ||
      row?.time_slot ||
      parsedTimeFromDateTime ||
      (parsedDateAndTime.time !== '-' ? parsedDateAndTime.time : null) ||
      extractTimeRangeFromText(row?.slot || '') ||
      extractTimeRangeFromText(row?.slotdesc || '') ||
      row?.datetimefrom ||
      row?.timefrom ||
      row?.fromtime ||
      dynamicTimeValue ||
      '-';

    return {
      exameventid: row?.exameventid || row?.exam_event_id || null,
      studentid: row?.studentid || row?.student_id || row?.memberid || null,
      subjectid: row?.subjectid || row?.subject_id || null,
      subject:
        row?.subject ||
        row?.subjectdesc ||
        row?.subjectname ||
        row?.papername ||
        row?.papersubject ||
        row?.subjecttitle ||
        row?.coursename ||
        row?.course ||
        row?.subjectcode ||
        'Subject',
      date: formatExamDateValue(rawDateValue),
      slot:
        firstMeaningful(
          row?.slot,
          row?.slotcode,
          row?.slotlabel,
          row?.slotname,
          row?.examslot,
          row?.examshift,
          row?.shift,
          row?.shiftname,
          row?.sessionname,
          row?.slotdesc,
          row?.session,
          row?.examtype,
          combinedSlot,
          dynamicSlotValue
        ) || '-',
      time: formatExamTimeValue(rawTimeValue),
      room:
        firstMeaningful(
          row?.roomcode,
          row?.room,
          row?.roomno,
          row?.roomnumber,
          row?.examroom,
          row?.hall,
          row?.hallno,
          row?.hallname,
          row?.building,
          row?.buildingname,
          row?.center,
          row?.centrename,
          row?.examcenter,
          row?.block,
          row?.venue,
          row?.venuedesc,
          dynamicRoomValue
        ) || '-',
      registration_id: row?.registrationid || row?.registration_id || null,
      registration_code: row?.registrationcode || row?.registration_code || null,
      seat_number:
        firstMeaningful(
          row?.seatno,
          row?.seatnumber,
          row?.seat,
          row?.seat_no,
          row?.rollno,
          row?.rollnumber,
          row?.seating,
          row?.seatalloted,
          dynamicSeatValue
        ) || null,
      raw: row
    };
  });

  const deduped = [];
  const seen = new Set();
  for (const row of mapped) {
    const key = [
      row.registration_id || '',
      row.exameventid || '',
      String(row.subject || '').toLowerCase(),
      String(row.date || '').toLowerCase(),
      String(row.time || '').toLowerCase(),
      String(row.slot || '').toLowerCase(),
      String(row.room || '').toLowerCase()
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped.filter((row) => !shouldDropUnknownExamRow(row));
};

const normalizeExamEvents = (payload) => {
  const rows = payload?.response?.eventcode?.examevent || [];
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => ({
    exameventid: row?.exameventid || null,
    studentid: row?.studentid || row?.student_id || row?.memberid || null,
    subject: row?.exameventdesc || row?.exameventcode || 'Exam Event',
    date: formatExamDateValue(row?.eventfrom || row?.examfrom || row?.eventdate || row?.eventdatetime || '-'),
    slot: row?.slot || row?.slotdesc || row?.eventslot || row?.exameventcode || '-',
    time: formatExamTimeValue(row?.eventtime || row?.timing || row?.eventto || row?.eventdatetime || '-'),
    room: row?.venue || row?.hall || row?.examcenter || row?.centrename || 'TBA',
    seat_number: row?.seatno || row?.seatnumber || row?.seat || row?.seat_no || row?.rollno || row?.rollnumber || null,
    registration_id: row?.registrationid || null,
    registration_code: row?.registrationcode || row?.registrationdesc || null,
    raw: row
  }));
};

const normalizeFeeStatus = (rawStatus, totalDemand, paidAmount, dueAmount) => {
  const statusText = String(rawStatus || '').trim().toLowerCase();

  if (dueAmount <= 0 && paidAmount > 0) return 'Paid';
  if (paidAmount > 0 && dueAmount > 0) return 'Partially Paid';
  if (totalDemand > 0 && paidAmount <= 0 && dueAmount > 0) return 'Unpaid';
  if (totalDemand > 0 && paidAmount <= 0 && dueAmount <= 0) return 'Unpaid';

  if (statusText.includes('partial')) return 'Partially Paid';
  if (statusText.includes('pending') || statusText.includes('due') || statusText.includes('unpaid')) return 'Unpaid';
  if (statusText.includes('paid') || statusText.includes('clear') || statusText.includes('settled')) return 'Paid';

  if (dueAmount > 0) return 'Unpaid';
  if (paidAmount > 0) return 'Paid';
  return 'Unknown';
};

const parseOptionalAmount = (value) => {
  if (value === null || value === undefined) return NaN;
  const text = String(value).trim();
  if (!text || text === '-' || text === '--') return NaN;
  const parsed = Number(text.replace(/,/g, '').replace(/₹/g, '').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const normalizeFeeRows = (payload = {}, semesters = []) => {
  const response = payload?.response || {};
  const candidates = [
    response?.feeHeads,
    response?.feeheads,
    response?.feestatus,
    response?.feelist,
    response?.feepaymentlist,
    response?.studentfeelist,
    response?.demandlist,
    response?.semesterfees,
    Array.isArray(response) ? response : null
  ];

  const explicitRows = candidates
    .filter((arr) => Array.isArray(arr) && arr.length)
    .flat();
  const rows = explicitRows.length ? explicitRows : extractCandidateFeeRows(response);

  const semesterCodeById = new Map(
    (semesters || []).map((sem) => [String(sem?.registration_id || ''), sem?.registration_code || null])
  );

  const normalizedRows = rows.map((row, idx) => {
    const totalDemandRaw =
      pickFirst(row, ['feeamount', 'totaldemand', 'demandamount', 'demand', 'totalfee', 'feesamount', 'netdemand']) ||
      pickByKeyContains(row, ['fee amount', 'total demand', 'demand', 'total fee']);
    const dueAmountRaw =
      pickFirst(row, ['dueamount', 'pendingamount', 'dues', 'outstanding', 'balanceamount']) ||
      pickByKeyContains(row, ['due amount', 'pending', 'outstanding', 'balance']) ||
      null;
    const paidAmountRaw =
      pickFirst(row, ['paidamount', 'amountpaid', 'paid', 'totalpaid', 'paidfeeamount', 'receivedamount', 'receiveamount', 'depositamount', 'transactionamount', 'paidtotal']) ||
      pickByKeyContains(row, ['paid amount', 'amount paid', 'paid', 'payment amount', 'received amount', 'deposit amount', 'transaction amount']);

    const totalDemand = Number.isFinite(parseOptionalAmount(totalDemandRaw))
      ? parseOptionalAmount(totalDemandRaw)
      : numberOr(totalDemandRaw, 0);
    const dueAmount = parseOptionalAmount(dueAmountRaw);
    const paidAmountDirect = parseOptionalAmount(paidAmountRaw);
    const paidAmount = Number.isFinite(paidAmountDirect)
      ? paidAmountDirect
      : Number.isFinite(dueAmount)
        ? Math.max(0, totalDemand - dueAmount)
        : 0;
    const resolvedDueAmount = Number.isFinite(dueAmount)
      ? dueAmount
      : Math.max(0, totalDemand - paidAmount);
    const registrationId = pickFirst(row, ['registrationid', 'registration_id']) || semesters[idx]?.registration_id || null;
    const registrationCodeRaw =
      pickFirst(row, ['registrationcode', 'registration_code', 'registrationdesc', 'semester', 'semestercode']) ||
      pickByKeyContains(row, ['registration code', 'registration', 'semester', 'term']) ||
      null;
    const semesterLabel =
      pickFirst(row, ['registrationdesc', 'semestername', 'semestertitle', 'termname']) ||
      null;
    const registrationCode =
      registrationCodeRaw ||
      semesterCodeById.get(String(registrationId || '')) ||
      semesters[idx]?.registration_code ||
      `Semester ${idx + 1}`;
    const rawStatus = pickFirst(row, ['status', 'feestatus', 'paymentstatus']);

    return {
      registration_id: registrationId,
      registration_code: registrationCode,
      semester_label: semesterLabel,
      total_demand: totalDemand,
      paid_amount: paidAmount,
      due_amount: resolvedDueAmount,
      fine_amount: numberOr(pickFirst(row, ['fineamount', 'fine', 'latefee', 'latefeeamount']) || pickByKeyContains(row, ['fine', 'late fee', 'penalty']), 0),
      status: normalizeFeeStatus(rawStatus, totalDemand, paidAmount, resolvedDueAmount),
      payment_date: pickFirst(row, ['paymentdate', 'lastpaymentdate', 'transactiondate', 'updatedon']) || null,
      raw: row
    };
  });

  const filteredRows = normalizedRows.filter((row) => {
    return Number(row.total_demand || 0) > 0 || Number(row.paid_amount || 0) > 0 || Number(row.due_amount || 0) > 0;
  });

  if (filteredRows.length) return filteredRows;

  const scalarTotalRaw = pickFirst(response, ['totaldemand', 'demandamount', 'totalfee']) || pickByKeyContains(response, ['total demand', 'demand', 'total fee', 'fee amount']);
  const scalarPaidRaw = pickFirst(response, ['paidamount', 'amountpaid', 'totalpaid', 'receivedamount', 'receiveamount', 'depositamount', 'transactionamount', 'paidtotal']) || pickByKeyContains(response, ['paid amount', 'amount paid', 'paid', 'received amount', 'deposit amount', 'transaction amount']);
  const scalarDueRaw = pickFirst(response, ['dueamount', 'pendingamount', 'outstanding']) || pickByKeyContains(response, ['due amount', 'pending', 'outstanding', 'balance']);

  const scalarTotal = Number.isFinite(parseOptionalAmount(scalarTotalRaw))
    ? parseOptionalAmount(scalarTotalRaw)
    : numberOr(scalarTotalRaw, 0);
  const scalarPaidParsed = parseOptionalAmount(scalarPaidRaw);
  const scalarDueParsed = parseOptionalAmount(scalarDueRaw);
  const scalarPaid = Number.isFinite(scalarPaidParsed)
    ? scalarPaidParsed
    : Number.isFinite(scalarDueParsed)
      ? Math.max(0, scalarTotal - scalarDueParsed)
      : 0;
  const scalarDue = Number.isFinite(scalarDueParsed)
    ? scalarDueParsed
    : Math.max(0, scalarTotal - scalarPaid);

  const scalarSummary = {
    total_demand: scalarTotal,
    paid_amount: scalarPaid,
    due_amount: scalarDue,
    fine_amount: numberOr(pickFirst(response, ['fineamount', 'fine', 'latefee']) || pickByKeyContains(response, ['fine', 'late fee', 'penalty']), 0)
  };

  if (scalarSummary.total_demand || scalarSummary.paid_amount || scalarSummary.due_amount || scalarSummary.fine_amount) {
    return [{ registration_id: null, registration_code: 'Overall', ...scalarSummary, status: null, payment_date: null, raw: response }];
  }

  return [];
};

const consolidateFeeRows = (rows = []) => {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];

  const semesterRows = list.filter((row) => row?.registration_id || row?.registration_code || row?.semester_label);
  const source = semesterRows.length ? semesterRows : list;
  const grouped = new Map();

  for (const row of source) {
    const key = [
      String(row?.registration_id || '').trim().toLowerCase(),
      String(row?.registration_code || '').trim().toLowerCase(),
      String(row?.semester_label || '').trim().toLowerCase()
    ].join('|');

    const current = grouped.get(key) || {
      registration_id: row?.registration_id || null,
      registration_code: row?.registration_code || null,
      semester_label: row?.semester_label || null,
      total_demand: 0,
      paid_amount: 0,
      due_amount: 0,
      fine_amount: 0,
      status: row?.status || null,
      payment_date: row?.payment_date || null,
      raw: row?.raw || null
    };

    current.total_demand = Math.max(Number(current.total_demand || 0), Number(row?.total_demand || 0));
    current.paid_amount = Math.max(Number(current.paid_amount || 0), Number(row?.paid_amount || 0));
    current.due_amount = Math.max(Number(current.due_amount || 0), Number(row?.due_amount || 0));
    current.fine_amount = Math.max(Number(current.fine_amount || 0), Number(row?.fine_amount || 0));

    if (!current.payment_date && row?.payment_date) current.payment_date = row.payment_date;
    if (!current.registration_id && row?.registration_id) current.registration_id = row.registration_id;
    if (!current.registration_code && row?.registration_code) current.registration_code = row.registration_code;
    if (!current.semester_label && row?.semester_label) current.semester_label = row.semester_label;
    if (!current.status && row?.status) current.status = row.status;

    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((row) => {
      const total = Number(row?.total_demand || 0);
      let paid = Number(row?.paid_amount || 0);
      let due = Number(row?.due_amount || 0);

      if (total > 0 && paid <= 0 && due <= 0) {
        due = total;
      } else if (total > 0) {
        if (paid < 0) paid = 0;
        if (due < 0) due = 0;
        if (paid > total) paid = total;
        const minDue = Math.max(0, total - paid);
        if (due < minDue) due = minDue;
        if (due > total) due = total;
      }

      return {
        ...row,
        paid_amount: paid,
        due_amount: due,
        status: normalizeFeeStatus(row?.status, total, paid, due)
      };
    })
    .filter((row) => Number(row.total_demand || 0) > 0 || Number(row.paid_amount || 0) > 0 || Number(row.due_amount || 0) > 0);
};

const buildFeePayloadCandidatesForEndpoint = (endpoint, authContext, semesters = []) => {
  const all = [
    {
      instituteid: authContext.instituteid,
      studentid: authContext.memberid,
      memberid: authContext.memberid,
      userid: authContext.userid,
      enrollmentno: authContext.enrollmentno,
      clientid: authContext.clientid
    },
    {
      instituteid: authContext.instituteid,
      studentid: authContext.memberid,
      memberid: authContext.memberid,
      userid: authContext.userid,
      enrollmentno: authContext.enrollmentno,
      clientid: authContext.clientid,
      registrationid: semesters[0]?.registration_id,
      registrationcode: semesters[0]?.registration_code
    }
  ];

  for (const sem of semesters) {
    all.push({
      instituteid: authContext.instituteid,
      studentid: authContext.memberid,
      memberid: authContext.memberid,
      userid: authContext.userid,
      enrollmentno: authContext.enrollmentno,
      clientid: authContext.clientid,
      registrationid: sem?.registration_id,
      registrationcode: sem?.registration_code
    });
  }

  // Known working payload contracts from jsjiit implementation.
  if (endpoint === '/StudentPortalAPI/studentfeeledger/loadfeesummary') {
    return [
      { instituteid: authContext.instituteid },
      { instituteid: authContext.instituteid, studentid: authContext.memberid },
      { instituteid: authContext.instituteid, studentid: authContext.memberid, clientid: authContext.clientid }
    ];
  }

  if (endpoint === '/StudentPortalAPI/collectionpendingpayments/getpendingpaymentsdata') {
    return [
      { instituteid: authContext.instituteid, studentid: authContext.memberid },
      { instituteid: authContext.instituteid, studentid: authContext.memberid, memberid: authContext.memberid },
      { instituteid: authContext.instituteid, studentid: authContext.memberid, clientid: authContext.clientid }
    ];
  }

  return all.filter((payload) =>
    Object.values(payload).some((value) => value !== undefined && value !== null && value !== '')
  );
};

const shouldUsePlainFeePayload = (endpoint) =>
  [
    '/StudentPortalAPI/studentfeeledger/loadfeesummary',
    '/StudentPortalAPI/collectionpendingpayments/getpendingpaymentsdata',
    '/StudentPortalAPI/studentfeemgmt/getstudentfeelist',
    '/StudentPortalAPI/studentfeemgmt/getstudent-feedetails',
    '/StudentPortalAPI/studentfeemgmt/getstudentfee-details',
    '/StudentPortalAPI/studentfeemgmt/getstudentfeepaymentdetail',
    '/StudentPortalAPI/studentfeemgmt/getsemesterwisefeedetails'
  ].includes(endpoint);

const bootstrapDatasetFromPortal = async (relaySession, authContext) => {
  const diagnostics = {
    overall: 'not-started',
    reason: '',
    generatedAt: new Date().toISOString(),
    steps: {}
  };

  const dataset = {
    mode: 'direct-relay',
    relaySessionId: relaySession?.sessionId || null,
    realData: false,
    semesters: [],
    attendanceData: {},
    subjectDailyData: {},
    grades: [],
    gradeCards: {},
    exams: [],
    fees: [],
    profile: authContext?.name || authContext?.enrollmentno
      ? {
          studentname: authContext.name || null,
          enrollmentno: authContext.enrollmentno || authContext.userid || null,
          instituteemail: authContext.userid?.includes('@') ? authContext.userid : null,
          studentid: authContext.memberid || null,
          memberid: authContext.memberid || null,
          userid: authContext.userid || null,
          instituteid: authContext.instituteid || null,
          clientid: authContext.clientid || null,
          program: null,
          semester: null,
          sectioncode: null,
          batch: null,
          source: 'login-auth-context'
        }
      : null,
    subjects: {},
    diagnostics
  };

  const setStep = (key, info) => {
    diagnostics.steps[key] = {
      status: info.status,
      endpoint: info.endpoint,
      httpStatus: info.httpStatus,
      responseStatus: info.responseStatus,
      message: info.message || '',
      at: new Date().toISOString()
    };
  };

  if (!relaySession || !authContext?.instituteid) {
    diagnostics.overall = 'failed';
    diagnostics.reason = 'Missing verified relay session or institute context';
    return dataset;
  }

  const safe = (promise) => promise.catch((_err) => null);

  try {
    // ── PHASE 1: Fire all independent initial requests in parallel ──
    const [profileRes, gradeStudentInfoRes, gradeRegRes, attendanceMetaRes, semEventRes, feeSummaryRes] =
      await Promise.all([
        safe(postPortal(relaySession, authContext,
          '/StudentPortalAPI/studentpersinfo/getstudent-personalinformation',
          { clinetid: authContext.clientid || 'SOAU', instituteid: authContext.instituteid },
          { encrypted: false })),
        safe(postPortal(relaySession, authContext,
          '/StudentPortalAPI/studentgradecard/getstudentinfo',
          { instituteid: authContext.instituteid })),
        safe(postPortal(relaySession, authContext,
          '/StudentPortalAPI/studentgradecard/getregistrationList',
          { instituteid: authContext.instituteid })),
        safe(postPortal(relaySession, authContext,
          '/StudentPortalAPI/StudentClassAttendance/getstudentInforegistrationforattendence',
          { clientid: authContext.clientid, instituteid: authContext.instituteid, membertype: authContext.membertype || 'S' },
          { encrypted: false })),
        safe(postPortal(relaySession, authContext,
          '/StudentPortalAPI/studentcommonsontroller/getsemestercode-withstudentexamevents',
          { clientid: authContext.clientid, instituteid: authContext.instituteid })),
        safe(postPortal(relaySession, authContext,
          '/StudentPortalAPI/studentfeeledger/loadfeesummary',
          { instituteid: authContext.instituteid },
          { encrypted: false }))
      ]);

    // ── Process profile ──
    if (profileRes?.ok && statusSuccess(profileRes.data)) {
      setStep('profile', { status: 'ok', endpoint: '/StudentPortalAPI/studentpersinfo/getstudent-personalinformation', httpStatus: profileRes.status, responseStatus: profileRes.data?.status?.responseStatus || '' });
      const studentInfo = profileRes.data?.response?.studentpersonalinformation || profileRes.data?.response?.studentinfo || extractBestProfileSource(profileRes.data);
      if (studentInfo) {
        dataset.profile = { ...(dataset.profile || {}), ...mapProfile(studentInfo) };
        dataset.realData = true;
      }
    } else {
      setStep('profile', { status: 'failed', endpoint: '/StudentPortalAPI/studentpersinfo/getstudent-personalinformation', httpStatus: profileRes?.status, responseStatus: profileRes?.data?.status?.responseStatus || '', message: extractStatusMessage(profileRes?.data) });
    }

    // ── Process grades metadata & semesters ──
    const gradeStudentInfo = gradeStudentInfoRes?.ok && statusSuccess(gradeStudentInfoRes.data) ? gradeStudentInfoRes.data?.response?.studentinfo : null;
    const gradeRegistrations = gradeRegRes?.ok && statusSuccess(gradeRegRes.data) ? normalizeSemesters(gradeRegRes.data?.response?.registrations || []) : [];
    const registration = gradeRegRes?.data ? firstRegistration(gradeRegRes.data) : null;

    if (gradeStudentInfo && registration?.registrationid) {
      dataset.profile = { ...(dataset.profile || {}), ...mapProfile(gradeStudentInfo) };
      dataset.semesters = sortSemestersDesc(gradeRegistrations.length ? gradeRegistrations : normalizeSemesters([registration]));
    }

    // ── Process attendance meta & merge semesters ──
    const attendanceSemRows = attendanceMetaRes?.ok && statusSuccess(attendanceMetaRes.data) ? attendanceMetaRes.data?.response?.semlist || [] : [];
    const attendanceHeaderRows = attendanceMetaRes?.ok && statusSuccess(attendanceMetaRes.data) ? attendanceMetaRes.data?.response?.headerlist || [] : [];
    const normalizedAttendanceSems = normalizeSemesters(attendanceSemRows);
    if (normalizedAttendanceSems.length) {
      const merged = [...normalizedAttendanceSems];
      dataset.semesters.forEach((sem) => {
        if (!merged.find((existing) => String(existing.registration_id) === String(sem.registration_id))) merged.push(sem);
      });
      dataset.semesters = sortSemestersDesc(merged);
    }
    if (Array.isArray(attendanceHeaderRows) && attendanceHeaderRows.length) {
      dataset.profile = { ...(dataset.profile || {}), ...mapAttendanceHeaderToProfile(attendanceHeaderRows[0], dataset.semesters[0]?.registration_code || null) };
    }
    setStep('attendanceMeta', { status: attendanceMetaRes?.ok && statusSuccess(attendanceMetaRes.data) ? 'ok' : 'failed', endpoint: '/StudentPortalAPI/StudentClassAttendance/getstudentInforegistrationforattendence', httpStatus: attendanceMetaRes?.status, responseStatus: attendanceMetaRes?.data?.status?.responseStatus || '' });

    // ── Process fee summary (fast path — only loadfeesummary) ──
    if (feeSummaryRes?.ok && statusSuccess(feeSummaryRes.data)) {
      setStep('fees', { status: 'ok', endpoint: '/StudentPortalAPI/studentfeeledger/loadfeesummary', httpStatus: feeSummaryRes.status, responseStatus: feeSummaryRes.data?.status?.responseStatus || '' });
      const feeRows = normalizeFeeRows(feeSummaryRes.data, dataset.semesters);
      if (feeRows.length) {
        dataset.fees = consolidateFeeRows(feeRows);
        dataset.realData = true;
      }
    } else {
      setStep('fees', { status: 'failed', endpoint: '/StudentPortalAPI/studentfeeledger/loadfeesummary', httpStatus: feeSummaryRes?.status, responseStatus: feeSummaryRes?.data?.status?.responseStatus || '', message: extractStatusMessage(feeSummaryRes?.data) });
    }

    // ── Process exam semesters ──
    const examSemesters = semEventRes?.ok && statusSuccess(semEventRes.data) ? normalizeSemesters(semEventRes.data?.response?.semesterCodeinfo?.semestercode || []) : [];
    const semestersToProcess = examSemesters.length ? examSemesters : (semEventRes?.data ? normalizeSemesters([firstRegistration(semEventRes.data)]) : []);
    setStep('examSemesters', { status: semEventRes?.ok && statusSuccess(semEventRes.data) ? 'ok' : 'failed', endpoint: '/StudentPortalAPI/studentcommonsontroller/getsemestercode-withstudentexamevents', httpStatus: semEventRes?.status, responseStatus: semEventRes?.data?.status?.responseStatus || '' });

    // ── PHASE 2: Parallel per-semester work + exam events ──
    const latestHeader = Array.isArray(attendanceHeaderRows) && attendanceHeaderRows.length ? attendanceHeaderRows[0] : null;

    const gradeCardPromises = (gradeStudentInfo && dataset.semesters.length) ? dataset.semesters.map((sem) =>
      safe(postPortal(relaySession, authContext,
        '/StudentPortalAPI/studentgradecard/showstudentgradecard',
        { instituteid: authContext.instituteid, registrationid: sem.registration_id, branchid: gradeStudentInfo.branchid, programid: gradeStudentInfo.programid }
      ).then((res) => ({ sem, res })))
    ) : [];

    const attendancePromises = (latestHeader?.stynumber && dataset.semesters.length) ? dataset.semesters.map((sem) => {
      const stynumber = sem.stynumber || latestHeader?.stynumber;
      if (!sem?.registration_id || !sem?.registration_code || !stynumber) return null;
      return safe(Promise.all([
        postPortal(relaySession, authContext,
          '/StudentPortalAPI/StudentClassAttendance/getstudentattendancedetail',
          { clientid: authContext.clientid, instituteid: authContext.instituteid, registrationcode: sem.registration_code, registrationid: sem.registration_id, stynumber }),
        postPortal(relaySession, authContext,
          '/StudentPortalAPI/reqsubfaculty/getfaculties',
          { instituteid: authContext.instituteid, studentid: authContext.memberid, registrationid: sem.registration_id })
      ]).then(([attRes, subRes]) => ({ sem, attRes, subRes })));
    }).filter(Boolean) : [];

    const examEventPromises = semestersToProcess.filter((s) => s?.registration_id).map((semReg) =>
      safe(postPortal(relaySession, authContext,
        '/StudentPortalAPI/studentcommonsontroller/getstudentexamevents',
        { instituteid: authContext.instituteid, registationid: semReg.registration_id }
      ).then((res) => ({ semReg, res })))
    );

    const sgpaPromise = safe((async () => {
      const semesterCheckRes = await postPortal(relaySession, authContext,
        '/StudentPortalAPI/studentsgpacgpa/checkIfstudentmasterexist',
        { instituteid: authContext.instituteid, studentid: authContext.memberid, name: authContext.name, enrollmentno: authContext.enrollmentno });
      const styleNumber = semesterCheckRes?.data?.response?.studentlov?.currentsemester || semesterCheckRes?.data?.response?.currentsemester;
      if (!styleNumber || !(semesterCheckRes.ok && statusSuccess(semesterCheckRes.data))) return null;
      const sgpaRes = await postPortal(relaySession, authContext,
        '/StudentPortalAPI/studentsgpacgpa/getallsemesterdata',
        { instituteid: authContext.instituteid, studentid: authContext.memberid, stynumber: styleNumber });
      return sgpaRes;
    })());

    const [gradeCardResults, attendanceResults, examEventResults, sgpaRes] = await Promise.all([
      Promise.all(gradeCardPromises),
      Promise.all(attendancePromises),
      Promise.all(examEventPromises),
      sgpaPromise
    ]);

    // ── Process grade cards ──
    for (const result of gradeCardResults) {
      if (!result?.res?.ok || !statusSuccess(result.res.data)) continue;
      const sem = result.sem;
      const gradeRows = result.res.data?.response?.gradecard || [];
      const normalizedCardRows = normalizeGradeCardRows(gradeRows);
      if (normalizedCardRows.length) {
        dataset.gradeCards[sem.registration_id] = normalizedCardRows;
      }
      const immediateGrades = normalizeGradeRows(gradeRows).map((row) => ({
        ...row, registration_id: sem.registration_id, registration_code: sem.registration_code
      }));
      if (immediateGrades.length) {
        dataset.grades = dataset.grades.filter((existing) => String(existing.registration_id) !== String(sem.registration_id));
        dataset.grades.push(immediateGrades[0]);
      }
      const subjects = normalizedCardRows.map((row) => row.subjectdesc).filter(Boolean);
      if (subjects.length) {
        dataset.subjects[sem.registration_id] = {
          ...(dataset.subjects[sem.registration_id] || { registered: [], faculties: [] }),
          registered: subjects,
          faculties: (dataset.subjects[sem.registration_id]?.faculties || []).length ? dataset.subjects[sem.registration_id].faculties : subjects.map(() => 'Faculty')
        };
      }
    }
    dataset.realData = dataset.realData || dataset.grades.length > 0 || Object.keys(dataset.gradeCards).length > 0;
    dataset.grades = mergeGradeSummaries(dataset.grades, []);

    // ── Process SGPA/CGPA ──
    if (sgpaRes?.ok && statusSuccess(sgpaRes.data)) {
      const sgpaRows = sgpaRes.data?.response?.semesterdata || sgpaRes.data?.response?.sgpacgpalist || sgpaRes.data?.response || [];
      const normalized = normalizeSgpaCgpaRows(sgpaRows, dataset.semesters);
      if (normalized.length) {
        dataset.grades = mergeGradeSummaries(normalized, dataset.grades);
        dataset.realData = true;
      }
    }

    // ── Process attendance & subjects per semester ──
    for (const result of attendanceResults) {
      if (!result) continue;
      const sem = result.sem;
      if (result.attRes?.ok && statusSuccess(result.attRes.data)) {
        const attendanceRows = normalizeAttendanceRows(result.attRes.data?.response?.studentattendancelist || []);
        dataset.attendanceData[sem.registration_id] = { studentattendancelist: attendanceRows };
        dataset.realData = dataset.realData || attendanceRows.length > 0;
      }
      if (result.subRes?.ok && statusSuccess(result.subRes.data)) {
        dataset.subjects[sem.registration_id] = normalizeRegisteredSubjects(result.subRes.data);
      }
    }

    // ── PHASE 3: Exam schedules in parallel ──
    const allExamRows = [];
    const schedulePromises = [];
    for (const result of examEventResults) {
      if (!result?.res) continue;
      const semReg = result.semReg;
      const examEvents = normalizeExamEvents(result.res.data).map((row) => ({
        ...row, registration_id: semReg.registration_id, registration_code: semReg.registration_code
      }));
      const events = result.res.data?.response?.eventcode?.examevent || [];
      if (Array.isArray(events) && events.length) {
        for (const eventRow of events) {
          if (!eventRow?.exameventid) continue;
          schedulePromises.push(
            safe(postPortal(relaySession, authContext,
              '/StudentPortalAPI/studentsttattview/getstudent-examschedule',
              { instituteid: authContext.instituteid, exameventid: eventRow.exameventid, registrationid: semReg.registration_id }
            ).then((scheduleRes) => ({ semReg, scheduleRes, examEvents })))
          );
        }
      } else {
        allExamRows.push(...examEvents);
      }
    }

    const scheduleResults = await Promise.all(schedulePromises);
    const scheduledSems = new Set();
    for (const result of scheduleResults) {
      if (!result) continue;
      const semReg = result.semReg;
      if (result.scheduleRes?.ok && statusSuccess(result.scheduleRes.data)) {
        const rows = normalizeExamRows(result.scheduleRes.data).map((row) => ({
          ...row, registration_id: semReg.registration_id, registration_code: semReg.registration_code
        }));
        if (rows.length) {
          allExamRows.push(...rows);
          scheduledSems.add(String(semReg.registration_id));
        }
      }
      // If no schedule rows came back for this semester, use event-level rows
      if (!scheduledSems.has(String(semReg.registration_id)) && result.examEvents?.length) {
        allExamRows.push(...result.examEvents);
        scheduledSems.add(String(semReg.registration_id));
      }
    }

    dataset.exams = allExamRows;
    dataset.realData = dataset.realData || allExamRows.length > 0;

    // ── Finalize grade summaries ──
    const gradeCardSummaries = normalizeGradeCardSummaries(dataset.semesters, dataset.gradeCards);
    if (gradeCardSummaries.length) {
      dataset.grades = mergeGradeSummaries(dataset.grades, gradeCardSummaries);
      dataset.realData = true;
    }

    diagnostics.overall = dataset.realData ? 'partial-or-complete' : 'failed';
    diagnostics.reason = dataset.realData
      ? 'At least one data adapter succeeded'
      : 'All hydration adapters returned empty or failed';
  } catch (_error) {
    diagnostics.overall = 'failed';
    diagnostics.reason = 'Unhandled hydration exception';
    return dataset;
  }

  return dataset;
};

const ensureSession = (req, res) => {
  const session = getSessionByOwner(ownerKey(req));
  if (!session) {
    res.status(404).json({ success: false, message: 'Portal session not found. Please login to portal SDK first.' });
    return null;
  }
  return session;
};

const realtimeRefreshInFlightByOwner = new Map();

const parseBooleanLike = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const shouldRefreshRealtime = (req) => {
  if (req?.query?.refresh !== undefined) {
    return parseBooleanLike(req.query.refresh, false);
  }
  return env.portalRealtimeDefault;
};

const refreshDatasetRealtime = async (session, req, options = {}) => {
  const { bypassThrottle = false } = options;
  if (!shouldRefreshRealtime(req)) return false;

  const ownerId = ownerKey(req);
  const now = Date.now();
  const lastSyncAt = Number(session?.dataset?.lastRealtimeSyncAt || 0);
  const minInterval = Number(env.portalRealtimeMinSyncIntervalMs || 0);
  if (!bypassThrottle && minInterval > 0 && now - lastSyncAt < minInterval) {
    return false;
  }

  const inFlight = realtimeRefreshInFlightByOwner.get(ownerId);
  if (inFlight) {
    try {
      await inFlight;
      return true;
    } catch (_error) {
      return false;
    }
  }

  const refreshPromise = (async () => {
    const relaySessionId = session?.dataset?.relaySessionId;
    const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
    const authContext = buildAuthContextFromRelaySession(relaySession);
    if (!(relaySession && authContext?.instituteid)) return;

    const hydratedDataset = await bootstrapDatasetFromPortal(relaySession, authContext);
    session.dataset = {
      ...session.dataset,
      ...hydratedDataset,
      relaySessionId: relaySessionId || hydratedDataset?.relaySessionId || null,
      lastRealtimeSyncAt: Date.now()
    };
    session.updatedAt = Date.now();
  })();

  realtimeRefreshInFlightByOwner.set(ownerId, refreshPromise);
  try {
    await refreshPromise;
  } catch (_error) {
    return false;
  } finally {
    realtimeRefreshInFlightByOwner.delete(ownerId);
  }
  return true;
};

const loginSdk = async (req, res) => {
  const { userId, relaySessionId = null } = req.body || {};
  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  const hydratedDataset = {
    ...(await bootstrapDatasetFromPortal(relaySession, authContext)),
    lastRealtimeSyncAt: Date.now()
  };

  const session = createOrUpdateSession({
    ownerId,
    userId: String(userId).trim(),
    relaySessionId,
    dataset: hydratedDataset
  });

  return res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      mode: session.dataset.mode,
      realData: session.dataset.realData,
      userId: session.userId
    }
  });
};

const getSdkSession = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;
  await refreshDatasetRealtime(session, req);

  return res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      mode: session.dataset.mode,
      realData: session.dataset.realData,
      userId: session.userId,
      latestSemester: session.dataset.semesters[0] || null,
      semesters: session.dataset.semesters || [],
      diagnostics: session.dataset.diagnostics || null
    }
  });
};

const getAttendanceMeta = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  return res.status(200).json({
    success: true,
    data: {
      semesters: session.dataset.semesters,
      latest_semester: session.dataset.semesters[0] || null,
      latest_header: {
        generatedBy: 'direct-portal-only',
        realData: session.dataset.realData,
        message: 'Current official portal data is shown below.'
      }
    }
  });
};

const getAttendance = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const sem = req.query.semester || session.dataset.semesters[0]?.registration_id;
  if (!session.dataset.realData) {
    return res.status(200).json({
      success: true,
      data: {
        studentattendancelist: [],
        realData: false,
        message: 'No direct attendance data available yet.'
      }
    });
  }

  const direct = session.dataset.attendanceData[sem];
  if (direct?.studentattendancelist?.length) {
    return res.status(200).json({ success: true, data: direct });
  }

  const firstNonEmpty = Object.values(session.dataset.attendanceData || {}).find(
    (item) => Array.isArray(item?.studentattendancelist) && item.studentattendancelist.length > 0
  );

  if (firstNonEmpty) {
    return res.status(200).json({ success: true, data: firstNonEmpty });
  }

  return res.status(200).json({
    success: true,
    data: session.dataset.attendanceData[sem] || {
      studentattendancelist: [],
      message: 'No attendance rows were returned by current portal session.'
    }
  });
};

const getSubjectAttendance = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const sem = req.query.semester || session.dataset.semesters[0]?.registration_id;
  const subject = req.query.subject || '';
  const key = `${sem}:${subject}`;

  if (!session.dataset.realData) {
    return res.status(200).json({
      success: true,
      data: {
        studentAttdsummarylist: [],
        realData: false,
        message: 'No direct subject attendance data available yet.'
      }
    });
  }

  const cached = session.dataset.subjectDailyData[key];
  if (cached?.studentAttdsummarylist?.length) {
    return res.status(200).json({ success: true, data: cached });
  }

  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);
  const attendanceRows = session.dataset.attendanceData?.[sem]?.studentattendancelist || [];
  const subjectRow = attendanceRows.find((row) => {
    const target = String(subject || '').toLowerCase();
    return (
      String(row?.subjectcode || '').toLowerCase() === target ||
      String(row?.individualsubjectcode || '').toLowerCase() === target ||
      String(row?.subjectdesc || '').toLowerCase().includes(target)
    );
  });

  const semesterRow = (session.dataset.semesters || []).find(
    (row) => String(row.registration_id) === String(sem)
  );

  const hasFetchContext =
    relaySession &&
    authContext?.instituteid &&
    authContext?.memberid &&
    semesterRow?.registration_code &&
    subjectRow?.subjectid;

  if (hasFetchContext) {
    const cmpidkey = [
      subjectRow?.Lsubjectcomponentid,
      subjectRow?.Tsubjectcomponentid,
      subjectRow?.Psubjectcomponentid
    ]
      .filter(Boolean)
      .map((subjectcomponentid) => ({ subjectcomponentid }));

    const dayRes = await postPortal(
      relaySession,
      authContext,
      '/StudentPortalAPI/StudentClassAttendance/getstudentsubjectpersentage',
      {
        cmpidkey,
        clientid: authContext.clientid,
        instituteid: authContext.instituteid,
        registrationcode: semesterRow.registration_code,
        registrationid: semesterRow.registration_id,
        studentid: authContext.memberid,
        subjectcode: subjectRow.individualsubjectcode || subjectRow.subjectcode,
        subjectid: subjectRow.subjectid
      }
    );

    if (dayRes.ok && statusSuccess(dayRes.data)) {
      const rows = dayRes.data?.response?.studentAttdsummarylist || [];
      const payload = {
        studentAttdsummarylist: normalizeSubjectDailyRows(rows)
      };
      session.dataset.subjectDailyData[key] = payload;

      return res.status(200).json({ success: true, data: payload });
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      studentAttdsummarylist: [],
      message: 'No day-to-day attendance was returned for this subject in the current portal session.'
    }
  });
};

const getProfileOnDemand = async (session, req) => {
  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  if (!(relaySession && authContext?.instituteid)) {
    return null;
  }

  const profileEndpoints = [
    '/StudentPortalAPI/studentpersinfo/getstudent-personalinformation',
    '/StudentPortalAPI/studentpersinfo/getstudent-contactinformation',
    '/StudentPortalAPI/studentpersinfo/getstudent-academicinformation',
    '/StudentPortalAPI/studentpersinfo/getstudent-familyinformation'
  ];

  const primaryPayload = {
    clinetid: authContext.clientid || 'SOAU',
    instituteid: authContext.instituteid,
    studentid: authContext.memberid,
    memberid: authContext.memberid,
    userid: authContext.userid,
    enrollmentno: authContext.enrollmentno
  };

  // Fire all 4 endpoints in parallel with the primary payload
  const results = await Promise.all(
    profileEndpoints.map((endpoint) =>
      postPortal(relaySession, authContext, endpoint, primaryPayload, { encrypted: false }).catch(() => null)
    )
  );

  let merged = { ...(session.dataset.profile || {}) };
  let improved = false;

  for (const response of results) {
    if (!response || !(response.ok && statusSuccess(response.data))) continue;

    const responseRoot = response.data?.response || {};
    const candidates = [
      responseRoot?.studentpersonalinformation,
      responseRoot?.studentcontactinformation,
      responseRoot?.studentacademicinformation,
      responseRoot?.studentfamilyinformation,
      responseRoot?.studentinfo,
      extractBestProfileSource(response.data),
      responseRoot
    ].filter(Boolean);

    if (!candidates.length) continue;

    const nextProfile = candidates.reduce((acc, candidate) => ({ ...acc, ...mapProfile(candidate) }), {});
    if (Object.keys(nextProfile).length) {
      merged = { ...merged, ...nextProfile };
      improved = true;
    }
  }

  if (improved) {
    session.dataset.profile = merged;
    session.dataset.realData = true;
    if (session.dataset.diagnostics?.steps) {
      session.dataset.diagnostics.steps.profileOnDemand = {
        status: 'ok',
        endpoint: 'studentpersinfo/*',
        httpStatus: 200,
        responseStatus: 'SUCCESS',
        message: 'On-demand profile hydration succeeded',
        at: new Date().toISOString()
      };
    }
    return merged;
  }

  return null;
};

const getExamsOnDemand = async (session, req) => {
  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  if (!(relaySession && authContext?.instituteid)) {
    return null;
  }

  const semEventRes = await postPortal(
    relaySession,
    authContext,
    '/StudentPortalAPI/studentcommonsontroller/getsemestercode-withstudentexamevents',
    {
      clientid: authContext.clientid,
      instituteid: authContext.instituteid
    }
  );

  if (!(semEventRes.ok && statusSuccess(semEventRes.data))) {
    return null;
  }

  const examSemesters = normalizeSemesters(semEventRes.data?.response?.semesterCodeinfo?.semestercode || []);
  const semestersToProcess = examSemesters.length ? examSemesters : normalizeSemesters([firstRegistration(semEventRes.data)]);
  const allExamRows = [];
  const examEventEndpoints = [
    '/StudentPortalAPI/studentcommonsontroller/getstudentexamevents',
    '/StudentPortalAPI/studentsttattview/getstudentexamevents'
  ];
  const examScheduleEndpoints = [
    '/StudentPortalAPI/studentsttattview/getstudent-examschedule',
    '/StudentPortalAPI/studentcommonsontroller/getstudent-examschedule'
  ];

  const buildEventPayloads = (semReg) => [
    {
      clientid: authContext.clientid,
      instituteid: authContext.instituteid,
      registrationcode: semReg.registration_code,
      registationid: semReg.registration_id,
      registrationid: semReg.registration_id,
      studentid: authContext.memberid,
      memberid: authContext.memberid,
      membertype: authContext.membertype || 'S'
    },
    {
      instituteid: authContext.instituteid,
      registrationid: semReg.registration_id
    },
    {
      clientid: authContext.clientid,
      instituteid: authContext.instituteid,
      registrationcode: semReg.registration_code,
      registrationid: semReg.registration_id
    }
  ];

  const buildSchedulePayloads = (semReg, exameventid) => [
    {
      clientid: authContext.clientid,
      instituteid: authContext.instituteid,
      exameventid,
      registrationcode: semReg.registration_code,
      registrationid: semReg.registration_id,
      registationid: semReg.registration_id,
      studentid: authContext.memberid,
      memberid: authContext.memberid,
      membertype: authContext.membertype || 'S'
    },
    {
      instituteid: authContext.instituteid,
      exameventid,
      registrationid: semReg.registration_id
    },
    {
      clientid: authContext.clientid,
      instituteid: authContext.instituteid,
      exameventid,
      registrationcode: semReg.registration_code,
      registrationid: semReg.registration_id
    }
  ];

  // Process all semesters in parallel
  const semResults = await Promise.all(semestersToProcess.map(async (semRegistration) => {
    if (!semRegistration?.registration_id) return [];
    const semScheduleRows = [];

    // Fire all event endpoint+payload combos in parallel, pick best
    const eventCombos = examEventEndpoints.flatMap((ep) =>
      buildEventPayloads(semRegistration).map((p) => ({ endpoint: ep, payload: p }))
    );
    const eventResults = await Promise.all(eventCombos.map(({ endpoint, payload }) =>
      postPortal(relaySession, authContext, endpoint, payload).catch(() => ({ ok: false }))
    ));

    let eventPayload = null;
    let eventPayloadScore = -1;
    for (const eventRes of eventResults) {
      if (!(eventRes.ok && statusSuccess(eventRes.data))) continue;
      const candidateEvents = Array.isArray(eventRes.data?.response?.eventcode?.examevent)
        ? eventRes.data.response.eventcode.examevent.length
        : 0;
      const candidateDirectRows = normalizeExamRows(eventRes.data).length;
      const candidateScore = candidateEvents * 10 + candidateDirectRows;
      if (candidateScore > eventPayloadScore) {
        eventPayload = eventRes.data;
        eventPayloadScore = candidateScore;
      }
    }

    if (!eventPayload) return [];

    const examEvents = normalizeExamEvents(eventPayload).map((row) => ({
      ...row,
      registration_id: semRegistration.registration_id,
      registration_code: semRegistration.registration_code
    }));
    const directRowsFromEventPayload = normalizeExamRows(eventPayload).map((row) => ({
      ...row,
      registration_id: row.registration_id || semRegistration.registration_id,
      registration_code: row.registration_code || semRegistration.registration_code
    }));
    if (directRowsFromEventPayload.length) {
      semScheduleRows.push(...directRowsFromEventPayload);
    }

    // Fire all schedule requests for all events in parallel
    const events = eventPayload?.response?.eventcode?.examevent || [];
    if (Array.isArray(events) && events.length) {
      const scheduleWork = events.filter((e) => e?.exameventid).map(async (eventRow) => {
        const scheduleCombos = examScheduleEndpoints.flatMap((ep) =>
          buildSchedulePayloads(semRegistration, eventRow.exameventid).map((p) => ({ endpoint: ep, payload: p }))
        );
        const scheduleResults = await Promise.all(scheduleCombos.map(({ endpoint, payload }) =>
          postPortal(relaySession, authContext, endpoint, payload).catch(() => ({ ok: false }))
        ));

        let bestData = null;
        let bestScore = -1;
        for (const scheduleRes of scheduleResults) {
          if (!(scheduleRes.ok && statusSuccess(scheduleRes.data))) continue;
          const candidateRows = normalizeExamRows(scheduleRes.data).length;
          if (candidateRows > bestScore) {
            bestData = scheduleRes.data;
            bestScore = candidateRows;
          }
        }
        if (!bestData) return [];
        return normalizeExamRows(bestData).map((row) => ({
          ...row,
          registration_id: row.registration_id || semRegistration.registration_id,
          registration_code: row.registration_code || semRegistration.registration_code
        }));
      });
      const allScheduleRows = await Promise.all(scheduleWork);
      for (const rows of allScheduleRows) {
        if (rows.length) semScheduleRows.push(...rows);
      }
    }

    // Fallback: if no detailed schedule, try schedule endpoints without event ID
    const hasDetailedSchedule = semScheduleRows.some(
      (row) =>
        (row?.time && row.time !== '-') ||
        (row?.slot && row.slot !== '-') ||
        (row?.room && row.room !== '-')
    );

    if (!hasDetailedSchedule) {
      const fallbackCombos = examScheduleEndpoints.flatMap((ep) => [
        {
          endpoint: ep,
          payload: {
            clientid: authContext.clientid,
            instituteid: authContext.instituteid,
            registrationcode: semRegistration.registration_code,
            registrationid: semRegistration.registration_id,
            registationid: semRegistration.registration_id,
            studentid: authContext.memberid,
            memberid: authContext.memberid,
            membertype: authContext.membertype || 'S'
          }
        },
        {
          endpoint: ep,
          payload: {
            instituteid: authContext.instituteid,
            registrationid: semRegistration.registration_id
          }
        }
      ]);
      const fallbackResults = await Promise.all(fallbackCombos.map(({ endpoint, payload }) =>
        postPortal(relaySession, authContext, endpoint, payload).catch(() => ({ ok: false }))
      ));
      for (const scheduleRes of fallbackResults) {
        if (!(scheduleRes.ok && statusSuccess(scheduleRes.data))) continue;
        const rows = normalizeExamRows(scheduleRes.data).map((row) => ({
          ...row,
          registration_id: row.registration_id || semRegistration.registration_id,
          registration_code: row.registration_code || semRegistration.registration_code
        }));
        if (rows.length) semScheduleRows.push(...rows);
      }
    }

    if (!semScheduleRows.length && examEvents.length) {
      return examEvents;
    }
    return semScheduleRows;
  }));

  for (const rows of semResults) {
    allExamRows.push(...rows);
  }

  const dedupedRows = [];
  const seenRows = new Set();
  for (const row of allExamRows) {
    const key = [
      row.registration_id || '',
      row.exameventid || '',
      String(row.subject || '').toLowerCase(),
      String(row.date || '').toLowerCase(),
      String(row.time || '').toLowerCase(),
      String(row.slot || '').toLowerCase(),
      String(row.room || '').toLowerCase()
    ].join('|');
    if (seenRows.has(key)) continue;
    seenRows.add(key);
    dedupedRows.push(row);
  }

  const cleanedRows = dedupedRows.filter((row) => !shouldDropUnknownExamRow(row));
  if (!cleanedRows.length) return null;

  session.dataset.exams = cleanedRows;
  session.dataset.realData = true;
  if (session.dataset.diagnostics?.steps) {
    session.dataset.diagnostics.steps.examsOnDemand = {
      status: 'ok',
      endpoint: 'parallel exam hydration',
      httpStatus: 200,
      responseStatus: 'SUCCESS',
      message: `On-demand exam hydration loaded ${cleanedRows.length} rows`,
      at: new Date().toISOString()
    };
  }

  return cleanedRows;
};

const getProfile = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;
  const forceRefresh = shouldRefreshRealtime(req);

  const profile = session.dataset.profile || {};
  const usefulProfileFields = [
    profile.studentname,
    profile.enrollmentno,
    profile.program,
    profile.semester,
    profile.sectioncode,
    profile.instituteemail,
    profile.personalemail,
    profile.mobile,
    profile.fathername,
    profile.mothername,
    profile.address
  ];
  const usefulProfileCount = usefulProfileFields.filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length;

  const hasUsefulProfile = usefulProfileCount >= 4;

  if (!hasUsefulProfile) {
    const onDemandProfile = await getProfileOnDemand(session, req);
    if (onDemandProfile) {
      return res.status(200).json({ success: true, data: onDemandProfile });
    }
  }

  return res.status(200).json({
    success: true,
    data: session.dataset.profile || {
      realData: false,
      message: 'No direct profile data available yet.'
    }
  });
};

const getGrades = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  await refreshDatasetRealtime(session, req);

  return res.status(200).json({
    success: true,
    data: {
      semesters: session.dataset.semesters || [],
      summaries: session.dataset.grades || [],
      gradeCards: session.dataset.gradeCards || {}
    }
  });
};

const getExams = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const forceRefresh = shouldRefreshRealtime(req);
  const cached = Array.isArray(session.dataset.exams) ? session.dataset.exams : [];

  if (!forceRefresh && cached.length) {
    return res.status(200).json({ success: true, data: cached });
  }

  const refreshed = await getExamsOnDemand(session, req);
  return res.status(200).json({ success: true, data: refreshed || cached || [] });
};

const getSubjects = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const sem = req.query.semester || session.dataset.semesters[0]?.registration_id;
  const direct = session.dataset.subjects[sem] || { registered: [], faculties: [], details: [] };

  const hasDirectRows =
    (Array.isArray(direct?.details) && direct.details.length > 0) ||
    (Array.isArray(direct?.registered) && direct.registered.length > 0);

  if (hasDirectRows) {
    return res.status(200).json({ success: true, data: direct });
  }

  const gradeRows = Array.isArray(session.dataset.gradeCards?.[sem]) ? session.dataset.gradeCards[sem] : [];
  const fallbackDetails = gradeRows
    .map((row) => ({
      subjectid: row?.subjectid || null,
      subjectcode: row?.subjectcode || null,
      subjectdesc: row?.subjectdesc || row?.subjectname || row?.subjectcode || 'Subject',
      credits: row?.credit ?? null,
      component: null,
      section: null,
      faculty: 'Faculty',
      raw: row
    }))
    .filter((row) => row.subjectdesc);

  if (fallbackDetails.length) {
    const fallback = {
      registered: fallbackDetails.map((row) => row.subjectdesc),
      faculties: fallbackDetails.map(() => 'Faculty'),
      details: fallbackDetails,
      source: 'gradecard-fallback'
    };

    session.dataset.subjects[sem] = fallback;
    return res.status(200).json({ success: true, data: fallback });
  }

  return res.status(200).json({
    success: true,
    data: direct
  });
};

const buildFeeDebugPreview = (payload) => {
  const response = payload?.response || payload || {};
  const nodes = collectObjectNodes(response, 0, 3);
  const arrayCandidates = [];

  for (const node of nodes) {
    for (const [key, value] of Object.entries(node || {})) {
      if (!Array.isArray(value) || !value.length) continue;
      const first = value[0];
      arrayCandidates.push({
        key,
        length: value.length,
        sampleType: typeof first,
        sampleKeys: first && typeof first === 'object' ? Object.keys(first).slice(0, 12) : []
      });
      if (arrayCandidates.length >= 8) break;
    }
    if (arrayCandidates.length >= 8) break;
  }

  return {
    topLevelKeys: Object.keys(payload || {}).slice(0, 20),
    responseKeys: Object.keys(response || {}).slice(0, 24),
    status: payload?.status || null,
    message: extractStatusMessage(payload),
    arrayCandidates,
    scalarHints: {
      demand: pickByKeyContains(response, ['demand', 'total fee', 'fee amount']),
      paid: pickByKeyContains(response, ['paid amount', 'amount paid', 'paid']),
      due: pickByKeyContains(response, ['due amount', 'outstanding', 'balance']),
      fine: pickByKeyContains(response, ['fine', 'late fee', 'penalty'])
    }
  };
};

const getFees = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const debugMode = String(req.query?.debug || '').trim() === '1';
  const forceRefresh = shouldRefreshRealtime(req);
  const debugAttempts = [];

  if (!forceRefresh && Array.isArray(session.dataset.fees) && session.dataset.fees.length) {
    return res.status(200).json(
      debugMode
        ? { success: true, data: session.dataset.fees || [], debug: { source: 'cached-session', attempts: [] } }
        : { success: true, data: session.dataset.fees || [] }
    );
  }

  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  if (relaySession && authContext?.instituteid) {
    const semesters = Array.isArray(session.dataset.semesters) ? session.dataset.semesters : [];

    // Fast path: try the known-working loadfeesummary endpoint first (parallel payloads)
    const primaryEndpoint = '/StudentPortalAPI/studentfeeledger/loadfeesummary';
    const primaryPayloads = buildFeePayloadCandidatesForEndpoint(primaryEndpoint, authContext, semesters);
    const primaryResults = await Promise.all(
      primaryPayloads.map((payload) =>
        postPortal(relaySession, authContext, primaryEndpoint, payload, { encrypted: false })
          .then((feeRes) => ({ payload, feeRes }))
          .catch(() => null)
      )
    );

    let allFeeRows = [];
    let chosenEndpoint = null;
    for (const result of primaryResults) {
      if (!result) continue;
      const { payload, feeRes } = result;
      debugAttempts.push({
        endpoint: primaryEndpoint,
        payloadKeys: Object.keys(payload || {}),
        httpStatus: feeRes.status,
        responseStatus: feeRes.data?.status?.responseStatus || feeRes.data?.responseStatus || null,
        ok: Boolean(feeRes.ok && statusSuccess(feeRes.data)),
        preview: buildFeeDebugPreview(feeRes.data)
      });
      if (!(feeRes.ok && statusSuccess(feeRes.data))) continue;
      const rows = normalizeFeeRows(feeRes.data, semesters);
      if (rows.length) {
        allFeeRows.push(...rows);
        if (!chosenEndpoint) chosenEndpoint = primaryEndpoint;
      }
    }

    // Fallback: only if primary returned nothing, try a few more endpoints in parallel
    if (!allFeeRows.length) {
      const fallbackEndpoints = [
        '/StudentPortalAPI/studentfeemgmt/getstudentfeelist',
        '/StudentPortalAPI/studentfeestatus/getfeestatus'
      ];
      const fallbackResults = await Promise.all(
        fallbackEndpoints.map((endpoint) => {
          const payload = { instituteid: authContext.instituteid, studentid: authContext.memberid, memberid: authContext.memberid };
          return postPortal(relaySession, authContext, endpoint, payload, shouldUsePlainFeePayload(endpoint) ? { encrypted: false } : undefined)
            .then((feeRes) => ({ endpoint, payload, feeRes }))
            .catch(() => null);
        })
      );
      for (const result of fallbackResults) {
        if (!result) continue;
        const { endpoint, payload, feeRes } = result;
        debugAttempts.push({
          endpoint,
          payloadKeys: Object.keys(payload || {}),
          httpStatus: feeRes.status,
          responseStatus: feeRes.data?.status?.responseStatus || feeRes.data?.responseStatus || null,
          ok: Boolean(feeRes.ok && statusSuccess(feeRes.data)),
          preview: buildFeeDebugPreview(feeRes.data)
        });
        if (!(feeRes.ok && statusSuccess(feeRes.data))) continue;
        const rows = normalizeFeeRows(feeRes.data, semesters);
        if (rows.length) {
          allFeeRows.push(...rows);
          if (!chosenEndpoint) chosenEndpoint = endpoint;
        }
      }
    }

    if (allFeeRows.length) {
      const mergedRows = consolidateFeeRows(allFeeRows);
      if (mergedRows.length) {
        session.dataset.fees = mergedRows;
        session.dataset.realData = true;
        return res.status(200).json(
          debugMode
            ? { success: true, data: session.dataset.fees, debug: { source: 'on-demand-fetch', attempts: debugAttempts, chosenEndpoint, mappedRows: mergedRows.length } }
            : { success: true, data: session.dataset.fees }
        );
      }
    }
  }

  return res.status(200).json(
    debugMode
      ? { success: true, data: session.dataset.fees || [], debug: { source: 'on-demand-fetch', attempts: debugAttempts, message: 'No fee rows mapped.' } }
      : { success: true, data: session.dataset.fees || [] }
  );
};

const downloadMarks = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const { registration_id, registration_code } = req.query;
  if (!registration_id || !registration_code) {
    return res.status(400).json({ success: false, message: 'registration_id and registration_code are required' });
  }

  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  if (!(relaySession && authContext?.instituteid)) {
    return res.status(400).json({ success: false, message: 'No active portal session' });
  }

  const safeRegId = String(registration_id).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeRegCode = String(registration_code).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeInstId = String(authContext.instituteid).replace(/[^a-zA-Z0-9_-]/g, '');

  const pdfPath = `/StudentPortalAPI/studentsexamview/printstudent-exammarks/${safeInstId}/${safeRegId}/${safeRegCode}`;
  const url = toPortalUrl(pdfPath);

  const headers = buildCommonHeaders(relaySession, authContext, 'application/json');
  delete headers['Content-Type'];
  headers.Accept = 'application/pdf, application/octet-stream, */*';

  const { response, error } = await timedPortalFetch(url, {
    method: 'GET',
    headers
  });

  if (error) {
    return res.status(502).json({ success: false, message: 'Portal request failed' });
  }

  if (!response.ok) {
    return res.status(response.status >= 400 && response.status < 500 ? response.status : 502).json({
      success: false,
      message: 'Portal returned an error'
    });
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
    return res.status(502).json({ success: false, message: 'Portal did not return a PDF' });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `marks_${safeRegCode}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  return res.send(buffer);
};

module.exports = {
  loginSdk,
  getSdkSession,
  getAttendanceMeta,
  getAttendance,
  getSubjectAttendance,
  getProfile,
  getGrades,
  getExams,
  getSubjects,
  getFees,
  downloadMarks
};
