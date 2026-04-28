// SPDX-License-Identifier: GPL-3.0-or-later
const { createOrUpdateSession, getSessionByOwner } = require('../services/ownPortalSdk');
const env = require('../config/env');
const { ensureOwnedSession, buildCookieHeader } = require('../services/portalRelayService');
const { encryptPortalPayload } = require('../utils/portalCrypto');
const { buildPublicDemoDataset } = require('../services/demoPortalDataset');
const { PortalClient, PortalError } = require('../services/portalClient');
const { fetchOfficialGradeSummaries } = require('../services/portalGrades');
const { fetchMarks: fetchMarksFromPdf } = require('../services/portalMarks');
const attendanceService = require('../services/portalAttendanceService');

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

const isLikelyPdfBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
};

const isLikelyImageBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const sig = buffer.subarray(0, 12);
  // JPEG: FF D8 FF
  if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) return true;
  // GIF: GIF87a / GIF89a
  if (sig.subarray(0, 6).toString('ascii') === 'GIF87a' || sig.subarray(0, 6).toString('ascii') === 'GIF89a') return true;
  // WEBP: RIFF....WEBP
  if (sig.subarray(0, 4).toString('ascii') === 'RIFF' && sig.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
};

const timedPortalFetch = async (url, options = {}, timeoutMs = env.portalRequestTimeoutMs) => {
  const timeout = Math.max(1000, Number(timeoutMs) || 12000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...(options || {}), signal: controller.signal });
    return { response, error: null };
  } catch (error) {
    return { response: null, error };
  } finally {
    clearTimeout(timer);
  }
};

const normalizePortalPhotoSource = (rawSource) => {
  const source = String(rawSource || '').trim();
  if (!source) return null;

  if (source.startsWith('data:image') || source.startsWith('blob:')) return null;
  if (source.length > 2048) return null;

  const compact = source.replace(/\s+/g, '');
  if (compact.length > 80 && /^[A-Za-z0-9+/=_-]+$/.test(compact)) return null;

  try {
    if (/^https?:\/\//i.test(source)) {
      const parsed = new URL(source);
      if (parsed.origin !== portalOrigin) return null;
      return parsed.toString();
    }

    if (source.startsWith('//')) {
      const parsed = new URL(`https:${source}`);
      if (parsed.origin !== portalOrigin) return null;
      return parsed.toString();
    }

    if (source.startsWith('www.')) {
      const parsed = new URL(`https://${source}`);
      if (parsed.origin !== portalOrigin) return null;
      return parsed.toString();
    }

    if (source.startsWith('/')) {
      return toPortalUrl(source);
    }

    if (/^studentportalapi\//i.test(source) || /^studentportal\//i.test(source)) {
      return toPortalUrl(`/${source}`);
    }

    // Allow generic relative official portal paths like StudentPhoto.ashx?id=...
    // and normalize them against the official portal origin.
    if (/^[a-z0-9._~!$&'()*+,;=:@/?%\-]+$/i.test(source) && !/\s/.test(source)) {
      return toPortalUrl(`/${source.replace(/^\/+/, '')}`);
    }
  } catch (_error) {
    return null;
  }

  return null;
};

const decodeInlinePhotoSource = (rawSource) => {
  const source = String(rawSource || '').trim();
  if (!source) return null;

  let contentType = 'image/jpeg';
  let payload = source;

  const dataUrlMatch = source.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    contentType = String(dataUrlMatch[1] || 'image/jpeg').toLowerCase();
    payload = String(dataUrlMatch[2] || '');
  }

  const compact = String(payload || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (compact.length < 80 || !/^[A-Za-z0-9+/=]+$/.test(compact)) return null;

  const padded = compact.padEnd(Math.ceil(compact.length / 4) * 4, '=');
  const buffer = Buffer.from(padded, 'base64');
  if (!buffer.length || !isLikelyImageBuffer(buffer)) return null;

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    contentType = 'image/png';
  } else if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') {
    contentType = 'image/gif';
  } else if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    contentType = 'image/webp';
  } else {
    contentType = 'image/jpeg';
  }

  return { buffer, contentType };
};

const resolveProfilePhotoSourceFromSession = (profile = {}) => {
  if (!profile || typeof profile !== 'object') return '';

  const keyMap = Object.keys(profile).reduce((acc, key) => {
    acc[String(key).toLowerCase()] = key;
    return acc;
  }, {});

  const preferred = [
    'studentphoto',
    'studentimage',
    'profilephoto',
    'photo',
    'photobase64',
    'profileimgurl',
    'profileimageurl',
    'studentphotourl',
    'imageurl',
    'photourl'
  ];

  for (const key of preferred) {
    const resolved = keyMap[String(key).toLowerCase()] || key;
    const value = profile?.[resolved];
    const extracted = extractPhotoScalar(value);
    if (extracted) return String(extracted).trim();
  }

  return '';
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

const postPortal = async (relaySession, authContext, path, payload, options = {}) => {
  try {
    const client = new PortalClient(relaySession, authContext);
    const data = await client.post(path, payload, options);
    return {
      ok: true,
      status: 200,
      data: { status: { responseStatus: 'success' }, response: data }
    };
  } catch (err) {
    const httpStatus = err.details?.httpStatus || 500;
    const isNetworkError = err.type === 'FETCH_ERROR' && (!err.details?.httpStatus || err.details?.httpStatus >= 500);
    return {
      ok: false,
      status: httpStatus,
      data: {
        status: err.details?.portalStatus || { responseStatus: 'FAILED', errors: [err.message] },
        message: err.message,
        meta: { networkError: isNetworkError, code: err.details?.code || err.code || 'PORTAL_FETCH_ERROR', path }
      }
    };
  }
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

const normalizeSemesterLabelToken = (value = '') =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const findSemesterByLabel = (semesters = [], registrationLabel = '') => {
  const labelToken = normalizeSemesterLabelToken(registrationLabel);
  if (!labelToken || !Array.isArray(semesters) || !semesters.length) return null;

  const direct = semesters.find(
    (sem) => normalizeSemesterLabelToken(sem?.registration_code) === labelToken
  );
  if (direct) return direct;

  const yearMatch = labelToken.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : '';
  const odd = labelToken.includes('ODD');
  const even = labelToken.includes('EVE') || labelToken.includes('EVEN');

  return semesters.find((sem) => {
    const semToken = normalizeSemesterLabelToken(sem?.registration_code);
    if (!semToken) return false;
    if (labelToken.includes(semToken) || semToken.includes(labelToken)) return true;
    if (!year || !semToken.includes(year)) return false;
    if (odd) return semToken.includes('ODD');
    if (even) return semToken.includes('EVE') || semToken.includes('EVEN');
    return false;
  }) || null;
};

const normalizeSgpaCgpaRows = (rows = [], semesters = []) => {
  if (!Array.isArray(rows)) return [];

  const sortedSemesters = sortSemestersDesc(semesters || []);

  return rows.map((row, index) => {
    const semLabelFromRow = pickFirst(row, [
      'registrationcode',
      'registration_code',
      'registrationdesc',
      'registrationlabel',
      'semestercode',
      'semestername',
      'semester',
      'session',
      'term'
    ]) || null;

    const regIdFromRow = pickFirst(row, [
      'registrationid',
      'registration_id',
      'regid',
      'registration',
      'registrationvalue'
    ]);

    const styFromRow = pickFirst(row, [
      'stynumber',
      'sty_number',
      'sty',
      'styno',
      'sty_no',
      'semesterno',
      'semester_no',
      'semester_number',
      'currentsemester',
      'semno',
      'sem'
    ]);

    const semesterById = regIdFromRow
      ? sortedSemesters.find((sem) => String(sem?.registration_id) === String(regIdFromRow))
      : null;

    const semesterByRegIdAsLabel = semesterById || !regIdFromRow
      ? null
      : findSemesterByLabel(sortedSemesters, regIdFromRow);

    const semesterByStyle = semesterById || !styFromRow
      ? null
      : sortedSemesters.find((sem) => String(sem?.stynumber || '') === String(styFromRow));
    const semesterByLabel = (semesterById || semesterByRegIdAsLabel || semesterByStyle)
      ? null
      : findSemesterByLabel(sortedSemesters, semLabelFromRow);

    const semNumFromLabelMatch = String(semLabelFromRow || '').match(/\bSEM(?:ESTER)?\s*[-:]?\s*(\d+)\b/i);
    const semNumFromLabel = semNumFromLabelMatch ? Number(semNumFromLabelMatch[1]) : NaN;
    const plainSemNo = Number(String(semLabelFromRow || '').trim());
    const semesterBySemNo = (semesterById || semesterByRegIdAsLabel || semesterByStyle || semesterByLabel || !Number.isFinite(semNumFromLabel))
      ? null
      : sortedSemesters.find((sem) => Number(sem?.stynumber) === semNumFromLabel);

    const semesterByPlainSemNo =
      (semesterById || semesterByRegIdAsLabel || semesterByStyle || semesterByLabel || semesterBySemNo || !Number.isFinite(plainSemNo))
        ? null
        : sortedSemesters.find((sem) => Number(sem?.stynumber) === plainSemNo);

    const resolvedSemester =
      semesterById ||
      semesterByRegIdAsLabel ||
      semesterByStyle ||
      semesterByLabel ||
      semesterBySemNo ||
      semesterByPlainSemNo;

    if (!resolvedSemester) {
      return null;
    }

    const sgpa = numberOr(
      pickFirst(row, [
        'sgpa',
        'semester_sgpa',
        'semestersgpa',
        'semestergpa',
        'sgpaobtained',
        'stygpa',
        'semesterstygpa',
        'semgpa',
        'semsgpa',
        'gradepointaverage'
      ]),
      0
    );

    const cgpa = numberOr(
      pickFirst(row, [
        'cgpa',
        'cumulativecgpa',
        'cummulativecgpa',
        'overallcgpa',
        'cumulativegpa',
        'cummulativegpa',
        'overallgpa',
        'totalcgpa',
        'semestercgpa',
        'stycgpa',
        'cumulativegradepointaverage',
        'cummulativegradepointaverage',
        'overallgradepointaverage'
      ]),
      0
    );

    if (!(sgpa > 0 || cgpa > 0)) {
      return null;
    }

    return {
      registration_id: resolvedSemester.registration_id,
      registration_code: resolvedSemester.registration_code,
      sgpa,
      cgpa,
      raw: row
    };
  }).filter(Boolean);
};

const mergeGradeSummaries = (primaryRows = [], fallbackRows = []) => {
  const bySem = new Map();
  const byCodeToken = new Map();

  const upsert = (row, preferIncoming = true) => {
    if (!row?.registration_id && !row?.registration_code) return;

    const registrationId = String(row?.registration_id || '').trim();
    const codeToken = normalizeSemesterLabelToken(row?.registration_code || '');
    const defaultKey = registrationId || (codeToken ? `code:${codeToken}` : String(row.registration_code || 'Semester'));
    const codeMappedKey = codeToken ? byCodeToken.get(codeToken) : null;
    const key = codeMappedKey || defaultKey;
    const existing = bySem.get(key);

    if (!existing) {
      bySem.set(key, {
        registration_id: row.registration_id || key,
        registration_code: row.registration_code || 'Semester',
        sgpa: numberOr(row.sgpa, 0),
        cgpa: numberOr(row.cgpa, 0),
        credits: numberOr(row.credits, 0),
        earnedPoints: numberOr(row.earnedPoints, 0),
        raw: row.raw || null
      });
      if (codeToken) {
        byCodeToken.set(codeToken, key);
      }
      return;
    }

    const incomingSgpa = numberOr(row.sgpa, 0);
    const incomingCgpa = numberOr(row.cgpa, 0);
    const currentSgpa = numberOr(existing.sgpa, 0);
    const currentCgpa = numberOr(existing.cgpa, 0);

    if ((!existing.registration_id || String(existing.registration_id).startsWith('code:')) && registrationId) {
      existing.registration_id = registrationId;
    }
    existing.registration_code = row.registration_code || existing.registration_code;
    if (codeToken) {
      byCodeToken.set(codeToken, key);
    }

    if (preferIncoming) {
      existing.sgpa = incomingSgpa > 0 ? incomingSgpa : currentSgpa;
      existing.cgpa = incomingCgpa > 0 ? incomingCgpa : currentCgpa;
    } else {
      existing.sgpa = currentSgpa > 0 ? currentSgpa : incomingSgpa;
      existing.cgpa = currentCgpa > 0 ? currentCgpa : incomingCgpa;
    }

    // Preserve credits and earnedPoints (prefer higher values)
    const incomingCredits = numberOr(row.credits, 0);
    const incomingEarned = numberOr(row.earnedPoints, 0);
    if (incomingCredits > 0) existing.credits = Math.max(existing.credits || 0, incomingCredits);
    if (incomingEarned > 0) existing.earnedPoints = Math.max(existing.earnedPoints || 0, incomingEarned);
  };

  fallbackRows.forEach((row) => upsert(row, false));
  primaryRows.forEach((row) => upsert(row, true));

  const entries = [...bySem.values()].sort((a, b) => {
    return semesterSortScore(a.registration_code, a.registration_id) - semesterSortScore(b.registration_code, b.registration_id);
  });

  let cumulativePoints = 0;
  let cumulativeCredits = 0;

  entries.forEach((row) => {
    const existingCgpa = numberOr(row.cgpa, 0);
    if (row.credits > 0 && row.sgpa > 0) {
      cumulativePoints += row.sgpa * row.credits;
      cumulativeCredits += row.credits;
    }

    // Prefer official portal CGPA when present; only derive when missing.
    if (existingCgpa > 0) {
      row.cgpa = existingCgpa;
      return;
    }

    if (cumulativeCredits > 0) {
      row.cgpa = cumulativePoints / cumulativeCredits;
      return;
    }

    row.cgpa = row.sgpa > 0 ? row.sgpa : 0;
  });

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
      subjectcode: pickFirst(row, ['subjectcode', 'individualsubjectcode', 'stsubjectcode', 'subcode', 'coursecode', 'subject_code']) || null,
      subjectdesc: pickFirst(row, ['subjectdesc', 'subjectname', 'subjectdescription', 'coursename', 'subjecttitle']) || 'Subject',
      credit: numberOr(pickFirst(row, ['earnedcredit', 'coursecreditpoint', 'credit', 'credits', 'subjectcredit', 'coursecredit', 'stcredit']), 0),
      marksobtained: pickFirst(row, [
        'marksobtained',
        'obtainedmarks',
        'totalobtainedmarks',
        'weightageobtained',
        'wtobtained',
        'obtainedweightage',
        'weightagescored',
        'internalmarksobtained',
        'externalmarksobtained',
        'obtained',
        'marks'
      ]),
      totalmarks: pickFirst(row, [
        'totalmarks',
        'maxmarks',
        'maximummarks',
        'outofmarks',
        'maximum',
        'weightagetotal',
        'wttotal',
        'totalweightage',
        'maxweightage',
        'totalmaxmarks'
      ]),
      grade: pickFirst(row, ['grade', 'lettergrade', 'stgrade', 'finalgrade']) || '-',
      gradepoint: pickFirst(row, ['gradepoint', 'grpoint', 'point', 'stgradepoint', 'gpoint', 'gradepoints']),
      assessment:
        pickFirst(row, [
          'assessment',
          'assessmentname',
          'assessmentdesc',
          'gradecomponentname',
          'examname',
          'examdesc',
          'testname',
          'componentname',
          'headname',
          'assessmenttype',
          'gradecomponent',
          'eventname',
          'eventdesc',
          'assessmenthead'
        ]) || null,
      assessmentorder: numberOr(
        pickFirst(row, ['assessmentorder', 'sequence', 'srno', 'orderid', 'serialno']),
        0
      ),
      raw: row
    }))
    .filter((row) => row.subjectdesc);
};

const normalizeSubjectDailyRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];

  const normalizePresence = (value) => {
    const text = String(value || '').trim();
    if (!text) return 'Unknown';

    const compact = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!compact) return 'Unknown';

    if (
      compact === 'p' ||
      compact === 'pr' ||
      compact === 'present' ||
      compact === '1' ||
      compact === 'true' ||
      compact === 'y' ||
      compact === 'yes' ||
      compact.startsWith('present') ||
      compact.includes('attended')
    ) {
      return 'Present';
    }

    if (
      compact === 'a' ||
      compact === 'ab' ||
      compact === 'absent' ||
      compact === '0' ||
      compact === 'false' ||
      compact === 'n' ||
      compact === 'no' ||
      compact.startsWith('absent') ||
      compact.includes('missed')
    ) {
      return 'Absent';
    }

    return 'Unknown';
  };

  return rows.map((row) => {
    const presentRaw = pickFirst(row, ['present', 'attendance', 'status', 'attendancestatus', 'ispresent']);
    const present = normalizePresence(presentRaw);

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
      subjectcode:
        pickFirst(row, ['subjectcode', 'subject_code', 'individualsubjectcode', 'individual_subject_code', 'subcode']) ||
        row?.subjectdesc ||
        'SUBJECT',
      subjectdesc:
        pickFirst(row, ['subjectdesc', 'subjectdescription', 'subjectname', 'coursename', 'subjecttitle', 'name', 'subjectcode']) ||
        'Subject',
      subjectid: pickFirst(row, ['subjectid', 'subject_id', 'subjectId', 'subid', 'subjectmasterid']) || null,
      individualsubjectcode:
        pickFirst(row, ['individualsubjectcode', 'individual_subject_code', 'subjectcode', 'subject_code', 'subcode']) || null,
      Lsubjectcomponentid:
        pickFirst(row, ['Lsubjectcomponentid', 'lsubjectcomponentid', 'lsubjectcomponent_id', 'lecturecomponentid', 'lcomponentid']) || null,
      Tsubjectcomponentid:
        pickFirst(row, ['Tsubjectcomponentid', 'tsubjectcomponentid', 'tsubjectcomponent_id', 'tutorialcomponentid', 'tcomponentid']) || null,
      Psubjectcomponentid:
        pickFirst(row, ['Psubjectcomponentid', 'psubjectcomponentid', 'psubjectcomponent_id', 'practicalcomponentid', 'labcomponentid', 'pcomponentid']) || null,
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
  const normalizedKeyMap = Object.keys(obj || {}).reduce((acc, key) => {
    const normalized = normalizeKey(key);
    if (normalized && !acc[normalized]) {
      acc[normalized] = key;
    }
    return acc;
  }, {});

  const lowerKeyMap = Object.keys(obj || {}).reduce((acc, key) => {
    acc[String(key).toLowerCase()] = key;
    return acc;
  }, {});

  for (const key of keys) {
    const directValue = obj?.[key];
    const normalizedCandidate = normalizeKey(key);
    const resolvedKey =
      directValue !== undefined
        ? key
        : lowerKeyMap[String(key).toLowerCase()] || normalizedKeyMap[normalizedCandidate] || null;
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

const stripEmptyProfileValues = (record = {}) => {
  return Object.fromEntries(
    Object.entries(record || {}).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string' && String(value).trim() === '') return false;
      return true;
    })
  );
};

const findValueByNormalizedKeys = (obj = {}, keys = []) => {
  const wanted = new Set((keys || []).map((key) => normalizeKey(key)).filter(Boolean));
  if (!wanted.size) return null;

  for (const [rawKey, value] of Object.entries(obj || {})) {
    if (wanted.has(normalizeKey(rawKey))) return value;
  }
  return null;
};

const extractPhotoScalar = (value, depth = 0) => {
  if (depth > 4 || value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const text = String(value).trim();
    return text || null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractPhotoScalar(item, depth + 1);
      if (extracted) return extracted;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  const preferredKeys = [
    'studentphoto',
    'studentimage',
    'profilephoto',
    'photobase64',
    'photo',
    'profileimgurl',
    'profileimageurl',
    'studentphotourl',
    'imageurl',
    'photourl',
    'image',
    'img',
    'url',
    'base64',
    'data'
  ];

  for (const key of preferredKeys) {
    const candidate = findValueByNormalizedKeys(value, [key]);
    const extracted = extractPhotoScalar(candidate, depth + 1);
    if (extracted) return extracted;
  }

  for (const [rawKey, rawValue] of Object.entries(value || {})) {
    const normalized = normalizeKey(rawKey);

    // Some official payloads nest media fields under profile-like objects.
    const isDirectMediaKey = /(photo|image|img|base64|avatar|signature)/.test(normalized);
    const isProfileContainer = /profile/.test(normalized) && (Array.isArray(rawValue) || (rawValue && typeof rawValue === 'object'));
    if (!isDirectMediaKey && !isProfileContainer) continue;

    const extracted = extractPhotoScalar(rawValue, depth + 1);
    if (extracted) return extracted;
  }

  return null;
};

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
  const rawPhoto = pick(
    [
      'studentphoto',
      'studentimage',
      'profilephoto',
      'photo',
      'photobase64',
      'profileimgurl',
      'profileimageurl',
      'studentphotourl',
      'imageurl',
      'photourl'
    ],
    ['profile photo', 'student photo', 'photo base64', 'profile image', 'image url', 'photo url']
  );

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
    branch: pick(['branch', 'branchname', 'specialization', 'stream'], ['branch', 'specialization', 'stream']),
    branchcode: pick(['branchcode', 'branch_code', 'branchabbr', 'branchshortcode'], ['branch code', 'branch abbr']),
    branchdesc: pick(
      ['branchdesc', 'branchdescription', 'branchname', 'branch', 'specialization'],
      ['branch desc', 'branch description', 'branch name', 'specialization']
    ),
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
    studentphoto: extractPhotoScalar(rawPhoto) || extractPhotoScalar(source)
  };

  return {
    ...normalized,
    ...extractScalarFields(source, Object.keys(normalized))
  };
};

const mapAttendanceHeaderToProfile = (header = {}, latestSemesterCode = null) => ({
  studentname: pickFirst(header, ['name', 'studentname']),
  enrollmentno: pickFirst(header, ['enrollmentno', 'enrollment']),
  program: pickFirst(header, ['programdesc', 'program', 'programname']),
  programdesc: pickFirst(header, ['programdesc', 'programdescription', 'programname']),
  semester: latestSemesterCode || null,
  studentid: pickFirst(header, ['studentid', 'student_id', 'memberid']),
  branchdesc: pickFirst(header, ['branchdesc', 'branchdescription', 'branch', 'branchname']),
  branchcode: pickFirst(header, ['branchcode', 'branch_code']),
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

      // Group by subject to avoid double-counting credits from multiple assessment rows
      const subjectMap = new Map();
      rows.forEach((row) => {
        const subjectKey = String(row?.subjectcode || row?.subjectdesc || '').trim();
        if (!subjectKey) return;

        const gp = numberOr(row?.gradepoint, NaN);
        const credit = numberOr(row?.credit, 0);

        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, { gradepoint: NaN, credit: 0 });
        }

        const subject = subjectMap.get(subjectKey);
        // Use the first valid gradepoint we encounter for this subject
        if (!Number.isFinite(subject.gradepoint) && Number.isFinite(gp)) {
          subject.gradepoint = gp;
        }
        // Use the max credit value for this subject
        if (credit > 0) {
          subject.credit = Math.max(subject.credit, credit);
        }
      });

      let weightedPoints = 0;
      let totalCredits = 0;
      let plainPoints = 0;
      let plainCount = 0;

      for (const subject of subjectMap.values()) {
        const gp = subject.gradepoint;
        const credit = subject.credit;
        if (Number.isFinite(gp)) {
          plainPoints += gp;
          plainCount += 1;
          if (credit > 0) {
            weightedPoints += gp * credit;
            totalCredits += credit;
          }
        }
      }

      const sgpa = totalCredits > 0 ? weightedPoints / totalCredits : plainCount > 0 ? plainPoints / plainCount : 0;

      // Skip semesters that only have assessment rows without grade points yet.
      if (plainCount <= 0 && totalCredits <= 0) {
        return null;
      }

      return {
        registration_id: registrationId,
        registration_code: sem?.registration_code || registrationId,
        credits: totalCredits,
        earnedPoints: weightedPoints,
        sgpa,
        cgpa: 0
      };
    })
    .filter(Boolean)
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
      cgpa: numberOr(row.cgpa, 0),
      credits: row.credits,
      earnedPoints: numberOr(row.earnedPoints, 0)
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

  // Known working payload contracts implementation.
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

/**
 * Resolves the stynumber for a semester row using multiple fallback sources.
 * This is critical — if stynumber is missing, the JIIT portal attendance API returns empty data.
 */
const resolveStynumber = (sem, dataset = {}) => {
  // 1. Direct from the semester row itself
  if (sem?.stynumber) return sem.stynumber;

  // 2. From attendance headers stored during bootstrap
  const headers = dataset?.attendanceHeaders || [];
  if (Array.isArray(headers) && headers.length) {
    const headerStynumber = headers[0]?.stynumber || headers[0]?.sty_number;
    if (headerStynumber) return headerStynumber;
  }

  // 3. From profile data
  const profileStynumber = dataset?.profile?.stynumber || dataset?.profile?.semester;
  if (profileStynumber) return String(profileStynumber);

  // 4. Derive from semester position — semesters are sorted descending,
  //    so index 0 = latest. The JIIT portal numbers semesters 1-indexed.
  const semesters = dataset?.semesters || [];
  if (semesters.length) {
    const idx = semesters.findIndex(
      (row) => String(row?.registration_id) === String(sem?.registration_id)
    );
    if (idx >= 0) {
      // Latest semester = highest number = total count
      return String(semesters.length - idx);
    }
    // Absolute fallback: just use the total semester count (i.e. latest)
    return String(semesters.length);
  }

  return null;
};

const bootstrapDatasetFromPortal = async (relaySession, authContext, options = {}) => {
  const { includeExamHydration = true } = options;
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
    attendanceHeaders: [],
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
          { clientid: authContext.clientid, instituteid: authContext.instituteid, memberid: authContext.memberid })),
        safe(postPortal(relaySession, authContext,
          '/StudentPortalAPI/studentfeeledger/loadfeesummary',
          { instituteid: authContext.instituteid },
          { encrypted: false }))
      ]);

    // ── Process profile ──
    if (profileRes?.ok && statusSuccess(profileRes.data)) {
      setStep('profile', { status: 'ok', endpoint: '/StudentPortalAPI/studentpersinfo/getstudent-personalinformation', httpStatus: profileRes.status, responseStatus: profileRes.data?.status?.responseStatus || '' });
      const responseRoot = profileRes.data?.response || {};
      const studentInfo = responseRoot?.studentpersonalinformation || responseRoot?.studentinfo || extractBestProfileSource(profileRes.data);
      if (studentInfo || responseRoot) {
        const mergedProfile = {
          ...stripEmptyProfileValues(mapProfile(studentInfo || {})),
          ...stripEmptyProfileValues(mapProfile(responseRoot || {}))
        };
        dataset.profile = { ...(dataset.profile || {}), ...mergedProfile };
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
      dataset.profile = {
        ...(dataset.profile || {}),
        ...stripEmptyProfileValues(mapProfile(gradeStudentInfo))
      };
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
      dataset.attendanceHeaders = attendanceHeaderRows;
      dataset.profile = {
        ...(dataset.profile || {}),
        ...stripEmptyProfileValues(
          mapAttendanceHeaderToProfile(attendanceHeaderRows[0], dataset.semesters[0]?.registration_code || null)
        )
      };
      // Enrich semester rows with stynumber from the attendance header if missing
      const headerStynumber = attendanceHeaderRows[0]?.stynumber || attendanceHeaderRows[0]?.sty_number;
      if (headerStynumber) {
        dataset.profile.stynumber = dataset.profile.stynumber || headerStynumber;
        dataset.semesters = dataset.semesters.map((sem, idx) => ({
          ...sem,
          stynumber: sem.stynumber || (idx === 0 ? headerStynumber : null)
        }));
      }
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
    if (includeExamHydration) {
      setStep('examSemesters', { status: semEventRes?.ok && statusSuccess(semEventRes.data) ? 'ok' : 'failed', endpoint: '/StudentPortalAPI/studentcommonsontroller/getsemestercode-withstudentexamevents', httpStatus: semEventRes?.status, responseStatus: semEventRes?.data?.status?.responseStatus || '' });
    } else {
      setStep('examSemesters', { status: 'skipped', endpoint: '/StudentPortalAPI/studentcommonsontroller/getsemestercode-withstudentexamevents', httpStatus: semEventRes?.status, responseStatus: semEventRes?.data?.status?.responseStatus || '', message: 'Deferred to on-demand exams loading' });
    }

    // ── PHASE 2: Parallel per-semester work + exam events ──
    const latestHeader = Array.isArray(attendanceHeaderRows) && attendanceHeaderRows.length ? attendanceHeaderRows[0] : null;

    const gradeCardPromises = (gradeStudentInfo && dataset.semesters.length) ? dataset.semesters.map((sem) =>
      safe(postPortal(relaySession, authContext,
        '/StudentPortalAPI/studentgradecard/showstudentgradecard',
        { instituteid: authContext.instituteid, registrationid: sem.registration_id, branchid: gradeStudentInfo.branchid, programid: gradeStudentInfo.programid }
      ).then((res) => ({ sem, res })))
    ) : [];

    const maxAttendanceSemesters = Math.max(1, Number(env.portalBootstrapAttendanceSemesters || 1));
    const attendanceHydrationSemesters = Array.isArray(dataset.semesters)
      ? dataset.semesters.slice(0, maxAttendanceSemesters)
      : [];

    // Attendance hydration NO LONGER gated on latestHeader?.stynumber.
    // resolveStynumber provides resilient fallback resolution.
    const attendancePromises = attendanceHydrationSemesters.length ? attendanceHydrationSemesters.map((sem) => {
      const stynumber = resolveStynumber(sem, dataset);
      if (!sem?.registration_id || !sem?.registration_code) return null;
      // stynumber may be null — attempt the call anyway; the portal will
      // return empty rows rather than error, and we lose nothing.
      return safe(Promise.all([
        postPortal(relaySession, authContext,
          '/StudentPortalAPI/StudentClassAttendance/getstudentattendancedetail',
          { clientid: authContext.clientid, instituteid: authContext.instituteid, registrationcode: sem.registration_code, registrationid: sem.registration_id, stynumber: stynumber || '' }),
        postPortal(relaySession, authContext,
          '/StudentPortalAPI/reqsubfaculty/getfaculties',
          { instituteid: authContext.instituteid, studentid: authContext.memberid, registrationid: sem.registration_id })
      ]).then(([attRes, subRes]) => ({ sem, attRes, subRes })));
    }).filter(Boolean) : [];

    const examEventPromises = includeExamHydration
      ? semestersToProcess.filter((s) => s?.registration_id).map((semReg) =>
        safe(postPortal(relaySession, authContext,
          '/StudentPortalAPI/studentcommonsontroller/getstudentexamevents',
          { instituteid: authContext.instituteid, registationid: semReg.registration_id }
        ).then((res) => ({ semReg, res })))
      )
      : [];

    // ── SGPA/CGPA: Use the new portalGrades service (EXCLUSIVE source of truth) ──
    let portalClient = null;
    try {
      portalClient = new PortalClient(relaySession, authContext);
    } catch (_err) {
      // Fallback: will use legacy flow if PortalClient can't be constructed
    }

    const sgpaPromise = portalClient
      ? safe(fetchOfficialGradeSummaries(portalClient, dataset.semesters))
      : safe((async () => {
          // Legacy fallback: direct postPortal calls
          const semesterCheckRes = await postPortal(relaySession, authContext,
            '/StudentPortalAPI/studentsgpacgpa/checkIfstudentmasterexist',
            { instituteid: authContext.instituteid, studentid: authContext.memberid, name: authContext.name, enrollmentno: authContext.enrollmentno });
          const styleNumber = semesterCheckRes?.data?.response?.studentlov?.currentsemester || semesterCheckRes?.data?.response?.currentsemester;
          if (!styleNumber || !(semesterCheckRes.ok && statusSuccess(semesterCheckRes.data))) return [];
          const sgpaRes = await postPortal(relaySession, authContext,
            '/StudentPortalAPI/studentsgpacgpa/getallsemesterdata',
            { instituteid: authContext.instituteid, studentid: authContext.memberid, stynumber: styleNumber });
          if (!(sgpaRes?.ok && statusSuccess(sgpaRes.data))) return [];
          const sgpaRows = sgpaRes.data?.response?.semesterdata || sgpaRes.data?.response?.sgpacgpalist || sgpaRes.data?.response?.semesterList || [];
          return normalizeSgpaCgpaRows(Array.isArray(sgpaRows) ? sgpaRows : [], dataset.semesters);
        })());

    const [gradeCardResults, attendanceResults, examEventResults, officialGradeSummaries] = await Promise.all([
      Promise.all(gradeCardPromises),
      Promise.all(attendancePromises),
      Promise.all(examEventPromises),
      sgpaPromise
    ]);

    // ── Process grade cards (subjects only — NOT for SGPA/CGPA) ──
    for (const result of gradeCardResults) {
      if (!result?.res?.ok || !statusSuccess(result.res.data)) continue;
      const sem = result.sem;
      const gradeRows = result.res.data?.response?.gradecard || [];
      const normalizedCardRows = normalizeGradeCardRows(gradeRows);
      if (normalizedCardRows.length) {
        dataset.gradeCards[sem.registration_id] = normalizedCardRows;
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
    dataset.realData = dataset.realData || Object.keys(dataset.gradeCards).length > 0;

    // ── Process SGPA/CGPA: official API values are the ONLY source ──
    if (Array.isArray(officialGradeSummaries) && officialGradeSummaries.length) {
      dataset.grades = mergeGradeSummaries(officialGradeSummaries, []);
      dataset.realData = true;
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

    if (includeExamHydration) {
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
    }

    // ── Finalize grade summaries ──
    // NOTE: Grade card summaries are NO LONGER used for SGPA/CGPA computation.
    // The official getallsemesterdata API is the sole source of truth.
    // Grade cards only provide per-subject detail (grade, credits).
    // Only add credit/earned point metadata from grade cards if the official grades are empty.
    if ((!Array.isArray(dataset.grades) || !dataset.grades.length) && Object.keys(dataset.gradeCards || {}).length) {
      const gradeCardSummaries = normalizeGradeCardSummaries(dataset.semesters, dataset.gradeCards);
      if (gradeCardSummaries.length) {
        dataset.grades = mergeGradeSummaries(gradeCardSummaries, []);
        dataset.realData = true;
      }
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

const hasRenderableGradesDataset = (dataset = {}) => {
  const hasSemesters = Array.isArray(dataset?.semesters) && dataset.semesters.length > 0;
  const hasSummaries = Array.isArray(dataset?.grades) && dataset.grades.length > 0;
  const hasGradeCards = dataset?.gradeCards && Object.keys(dataset.gradeCards).length > 0;
  return hasSemesters || hasSummaries || hasGradeCards;
};

const refreshDatasetRealtime = async (session, req, options = {}) => {
  const { bypassThrottle = false } = options;
  if (String(session?.dataset?.mode || '').toLowerCase() === 'public-demo') return false;
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

    const hydratedDataset = await bootstrapDatasetFromPortal(relaySession, authContext, {
      includeExamHydration: false
    });
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

  const authUserId = String(req.user?.userId || '').trim().toLowerCase();
  const isLocalDemoUserId = authUserId.startsWith('demo.') && authUserId.endsWith('@jiitsphere.local');
  const isDemoUser =
    String(req.user?.role || '').toLowerCase() === 'demo' ||
    Boolean(req.user?.demo) ||
    String(req.user?.mode || '').toLowerCase() === 'public-demo' ||
    isLocalDemoUserId;
  if (isDemoUser) {
    const ownerId = ownerKey(req);
    const session = createOrUpdateSession({
      ownerId,
      userId: String(userId).trim(),
      relaySessionId: null,
      dataset: {
        ...buildPublicDemoDataset(String(userId).trim()),
        lastRealtimeSyncAt: Date.now()
      }
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
  }

  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  if (!(relaySession && authContext?.instituteid)) {
    return res.status(400).json({ success: false, message: 'No active portal session' });
  }

  const hydratedDataset = {
    ...(await bootstrapDatasetFromPortal(relaySession, authContext, { includeExamHydration: false })),
    lastRealtimeSyncAt: Date.now()
  };

  const session = createOrUpdateSession({
    ownerId,
    userId: String(userId).trim(),
    relaySessionId,
    dataset: hydratedDataset
  });

  const latestSemesterId = session?.dataset?.semesters?.[0]?.registration_id;
  if (latestSemesterId) {
    warmSubjectDailyCountsForSemester(session, req, latestSemesterId).catch(() => null);
  }

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

  const shouldRealtime = shouldRefreshRealtime(req);
  const hasCached = hasRenderableGradesDataset(session?.dataset);

  if (shouldRealtime && hasCached) {
    refreshDatasetRealtime(session, req).catch(() => null);
  } else {
    await refreshDatasetRealtime(session, req);
  }

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

  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  // If we have a live relay session, fetch fresh meta from portal
  if (relaySession && authContext?.instituteid) {
    try {
      const forceRefresh = parseBooleanLike(req.query?.refresh, false);
      const meta = await attendanceService.fetchAttendanceMeta(relaySession, authContext, { forceRefresh });

      // Update session dataset with fresh semesters
      if (meta.semesters.length) {
        session.dataset.semesters = meta.semesters;
        session.dataset.attendanceHeaders = meta.headers;
      }

      return res.status(200).json({
        success: true,
        data: {
          semesters: meta.semesters,
          latest_semester: meta.semesters[0] || null,
          latest_header: {
            generatedBy: 'attendance-service',
            realData: session.dataset.realData,
            stynumber: meta.latestStynumber,
            message: 'Live portal data via attendance service.'
          }
        }
      });
    } catch (_err) {
      // Fall through to cached dataset
    }
  }

  // Fallback: return cached semesters from session dataset
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

const hydrateAttendanceForSemester = async (session, req, sem) => {
  const semesterRow = (session.dataset.semesters || []).find(
    (row) => String(row?.registration_id) === String(sem)
  );
  if (!semesterRow?.registration_id || !semesterRow?.registration_code) {
    return null;
  }

  // Resilient stynumber resolution — no longer hard-gates on it
  const stynumber = resolveStynumber(semesterRow, session.dataset);

  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);
  if (!(relaySession && authContext?.instituteid && authContext?.memberid)) {
    return null;
  }

  const [attRes, subRes] = await Promise.all([
    postPortal(relaySession, authContext,
      '/StudentPortalAPI/StudentClassAttendance/getstudentattendancedetail',
      {
        clientid: authContext.clientid,
        instituteid: authContext.instituteid,
        registrationcode: semesterRow.registration_code,
        registrationid: semesterRow.registration_id,
        stynumber: stynumber || ''
      }
    ),
    postPortal(relaySession, authContext,
      '/StudentPortalAPI/reqsubfaculty/getfaculties',
      {
        instituteid: authContext.instituteid,
        studentid: authContext.memberid,
        registrationid: semesterRow.registration_id
      }
    )
  ]);

  let hydrated = null;
  if (attRes?.ok && statusSuccess(attRes.data)) {
    hydrated = {
      studentattendancelist: normalizeAttendanceRows(attRes.data?.response?.studentattendancelist || [])
    };
    session.dataset.attendanceData[sem] = hydrated;
    session.dataset.realData = session.dataset.realData || hydrated.studentattendancelist.length > 0;
  }

  if (subRes?.ok && statusSuccess(subRes.data)) {
    session.dataset.subjects[sem] = normalizeRegisteredSubjects(subRes.data);
  }

  return hydrated;
};

const subjectDailyFetchInFlightByOwnerKey = new Map();
const subjectDailyWarmupInFlightByOwnerSem = new Map();

const mapWithConcurrency = async (items = [], concurrency = 1, mapper) => {
  if (!Array.isArray(items) || !items.length) return [];

  const safeConcurrency = Math.max(1, Math.min(Number(concurrency || 1), items.length));
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const computeDailyCountSummary = (rows = []) => {
  const list = Array.isArray(rows) ? rows : [];
  const toPresence = (value) => {
    const compact = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!compact) return 'unknown';
    if (compact === 'present' || compact === 'p' || compact === '1' || compact.startsWith('present') || compact.includes('attended')) {
      return 'present';
    }
    if (compact === 'absent' || compact === 'a' || compact === '0' || compact.startsWith('absent') || compact.includes('missed')) {
      return 'absent';
    }
    return 'unknown';
  };

  const normalized = list.map((entry) => toPresence(entry?.present)).filter((value) => value === 'present' || value === 'absent');
  const total = normalized.length;
  const attended = normalized.filter((value) => value === 'present').length;
  return { attended, total };
};

const findSubjectAttendanceRow = (attendanceRows = [], subject = '') => {
  const target = String(subject || '').trim().toLowerCase();
  if (!target) return null;
  return attendanceRows.find((row) => (
    String(row?.subjectcode || '').trim().toLowerCase() === target ||
    String(row?.individualsubjectcode || '').trim().toLowerCase() === target ||
    String(row?.subjectdesc || '').trim().toLowerCase() === target ||
    String(row?.subjectdesc || '').trim().toLowerCase().includes(target)
  ));
};

const findSubjectDetailRow = (subjectDetails = [], subject = '') => {
  const target = String(subject || '').trim().toLowerCase();
  if (!target || !Array.isArray(subjectDetails)) return null;

  return subjectDetails.find((row) => {
    const code = String(row?.subjectcode || row?.individualsubjectcode || '').trim().toLowerCase();
    const desc = String(row?.subjectdesc || row?.subjectname || '').trim().toLowerCase();
    return (
      code === target ||
      desc === target ||
      (code && target.includes(code)) ||
      (desc && desc.includes(target))
    );
  });
};

const findGradeSubjectRow = (gradeRows = [], subject = '') => {
  const target = String(subject || '').trim().toLowerCase();
  if (!target || !Array.isArray(gradeRows)) return null;

  return gradeRows.find((row) => {
    const code = String(row?.subjectcode || '').trim().toLowerCase();
    const desc = String(row?.subjectdesc || row?.subjectname || '').trim().toLowerCase();
    return (
      code === target ||
      desc === target ||
      (code && target.includes(code)) ||
      (desc && desc.includes(target))
    );
  });
};

const resolveSubjectContext = (session, sem, attendanceRows = [], subject = '') => {
  const attendanceRow = findSubjectAttendanceRow(attendanceRows, subject);
  const subjectDetails = session?.dataset?.subjects?.[sem]?.details || [];
  const detailRow = findSubjectDetailRow(subjectDetails, subject);
  const gradeRows = Array.isArray(session?.dataset?.gradeCards?.[sem]) ? session.dataset.gradeCards[sem] : [];
  const gradeRow = findGradeSubjectRow(gradeRows, subject);

  const detailRaw = detailRow?.raw || {};
  const attendanceRaw = attendanceRow?.raw || {};
  const gradeRaw = gradeRow?.raw || {};

  const subjectid =
    attendanceRow?.subjectid ||
    detailRow?.subjectid ||
    gradeRow?.subjectid ||
    pickFirst(detailRaw, ['subjectid', 'subject_id', 'subjectId', 'subid']) ||
    pickFirst(attendanceRaw, ['subjectid', 'subject_id', 'subjectId', 'subid']) ||
    pickFirst(gradeRaw, ['subjectid', 'subject_id', 'subjectId', 'subid']) ||
    null;

  const subjectcode =
    attendanceRow?.subjectcode ||
    attendanceRow?.individualsubjectcode ||
    detailRow?.subjectcode ||
    gradeRow?.subjectcode ||
    String(subject || '').trim();

  const individualsubjectcode =
    attendanceRow?.individualsubjectcode ||
    detailRow?.subjectcode ||
    gradeRow?.subjectcode ||
    subjectcode;

  const Lsubjectcomponentid =
    attendanceRow?.Lsubjectcomponentid ||
    pickFirst(detailRaw, ['Lsubjectcomponentid', 'lsubjectcomponentid', 'lsubjectcomponent_id', 'lecturecomponentid', 'lcomponentid']) ||
    pickFirst(attendanceRaw, ['Lsubjectcomponentid', 'lsubjectcomponentid', 'lsubjectcomponent_id', 'lecturecomponentid', 'lcomponentid']) ||
    null;

  const Tsubjectcomponentid =
    attendanceRow?.Tsubjectcomponentid ||
    pickFirst(detailRaw, ['Tsubjectcomponentid', 'tsubjectcomponentid', 'tsubjectcomponent_id', 'tutorialcomponentid', 'tcomponentid']) ||
    pickFirst(attendanceRaw, ['Tsubjectcomponentid', 'tsubjectcomponentid', 'tsubjectcomponent_id', 'tutorialcomponentid', 'tcomponentid']) ||
    null;

  const Psubjectcomponentid =
    attendanceRow?.Psubjectcomponentid ||
    pickFirst(detailRaw, ['Psubjectcomponentid', 'psubjectcomponentid', 'psubjectcomponent_id', 'practicalcomponentid', 'labcomponentid', 'pcomponentid']) ||
    pickFirst(attendanceRaw, ['Psubjectcomponentid', 'psubjectcomponentid', 'psubjectcomponent_id', 'practicalcomponentid', 'labcomponentid', 'pcomponentid']) ||
    null;

  return {
    subjectcode,
    individualsubjectcode,
    subjectid,
    Lsubjectcomponentid,
    Tsubjectcomponentid,
    Psubjectcomponentid
  };
};

const resolveSubjectDailyPayload = async (session, req, sem, subject) => {
  const subjectCode = String(subject || '').trim();
  const key = `${sem}:${subjectCode}`;

  if (!subjectCode) {
    return {
      studentAttdsummarylist: [],
      message: 'Subject code is required.'
    };
  }

  const cached = session.dataset.subjectDailyData[key];
  if (cached && Array.isArray(cached.studentAttdsummarylist)) {
    return cached;
  }

  const ownerId = ownerKey(req);
  const inFlightKey = `${ownerId}:${key}`;
  const inFlight = subjectDailyFetchInFlightByOwnerKey.get(inFlightKey);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    const relaySessionId = session.dataset.relaySessionId;
    const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
    const authContext = buildAuthContextFromRelaySession(relaySession);

    let attendanceRows = session.dataset.attendanceData?.[sem]?.studentattendancelist || [];
    if (!attendanceRows.length) {
      await hydrateAttendanceForSemester(session, req, sem);
      attendanceRows = session.dataset.attendanceData?.[sem]?.studentattendancelist || [];
    }

    const subjectContext = resolveSubjectContext(session, sem, attendanceRows, subjectCode);
    const semesterRow = (session.dataset.semesters || []).find(
      (row) => String(row?.registration_id) === String(sem)
    );

    const hasFetchContext =
      relaySession &&
      authContext?.instituteid &&
      authContext?.memberid &&
      semesterRow?.registration_code &&
      (subjectContext?.subjectid || subjectContext?.subjectcode);

    if (hasFetchContext) {
      const cmpidkey = [
        subjectContext?.Lsubjectcomponentid,
        subjectContext?.Tsubjectcomponentid,
        subjectContext?.Psubjectcomponentid
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
          subjectcode: subjectContext?.individualsubjectcode || subjectContext?.subjectcode || subjectCode,
          subjectid: subjectContext?.subjectid || ''
        }
      );

      if (dayRes.ok && statusSuccess(dayRes.data)) {
        const rows = dayRes.data?.response?.studentAttdsummarylist || [];
        const payload = {
          studentAttdsummarylist: normalizeSubjectDailyRows(rows),
          message: dayRes.data?.message || (rows.length ? '' : 'No day-to-day attendance is available for this subject yet.')
        };
        session.dataset.subjectDailyData[key] = payload;
        return payload;
      }
    }

    const emptyPayload = {
      studentAttdsummarylist: [],
      message: 'No day-to-day attendance was returned for this subject in the current portal session.'
    };
    session.dataset.subjectDailyData[key] = emptyPayload;
    return emptyPayload;
  })();

  subjectDailyFetchInFlightByOwnerKey.set(inFlightKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    subjectDailyFetchInFlightByOwnerKey.delete(inFlightKey);
  }
};

const warmSubjectDailyCountsForSemester = async (session, req, sem) => {
  const ownerId = ownerKey(req);
  const warmKey = `${ownerId}:${sem}`;
  const existing = subjectDailyWarmupInFlightByOwnerSem.get(warmKey);
  if (existing) return existing;

  const warmPromise = (async () => {
    let attendanceRows = session.dataset.attendanceData?.[sem]?.studentattendancelist || [];
    if (!attendanceRows.length) {
      await hydrateAttendanceForSemester(session, req, sem);
      attendanceRows = session.dataset.attendanceData?.[sem]?.studentattendancelist || [];
    }

    const pending = attendanceRows
      .filter((row) => String(row?.subjectcode || '').trim())
      .filter((row) => Number(row?.totalclasses || 0) <= 0);

    await mapWithConcurrency(pending, 4, async (row) => {
      const subjectCode = row?.subjectcode || row?.individualsubjectcode || row?.subjectdesc;
      try {
        await resolveSubjectDailyPayload(session, req, sem, subjectCode);
      } catch (_error) {
        return false;
      }
      return true;
    });
  })();

  subjectDailyWarmupInFlightByOwnerSem.set(warmKey, warmPromise);
  try {
    await warmPromise;
  } finally {
    subjectDailyWarmupInFlightByOwnerSem.delete(warmKey);
  }
};

const getAttendance = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const sem = req.query.semester || session.dataset.semesters[0]?.registration_id;
  const forceRefresh = parseBooleanLike(req.query?.refresh, false);

  // Check session cache first (fast path)
  if (!forceRefresh) {
    const direct = session.dataset.attendanceData[sem];
    if (direct && Array.isArray(direct.studentattendancelist) && direct.studentattendancelist.length) {
      return res.status(200).json({ success: true, data: direct });
    }
  }

  // Use clean attendance service for on-demand fetch
  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  if (relaySession && authContext?.instituteid) {
    try {
      const result = await attendanceService.fetchAttendance(relaySession, authContext, sem, { forceRefresh });
      if (result.studentattendancelist.length) {
        // Update session cache
        session.dataset.attendanceData[sem] = result;
        session.dataset.realData = true;
        if (result.subjects) session.dataset.subjects[sem] = result.subjects;
        return res.status(200).json({ success: true, data: result });
      }
    } catch (_err) {
      // Fall through to legacy hydration
    }
  }

  // Legacy fallback: try existing hydrateAttendanceForSemester
  const hydrated = await hydrateAttendanceForSemester(session, req, sem);
  if (hydrated && Array.isArray(hydrated.studentattendancelist)) {
    return res.status(200).json({ success: true, data: hydrated });
  }

  return res.status(200).json({
    success: true,
    data: session.dataset.attendanceData[sem] || {
      studentattendancelist: [],
      message: 'No attendance rows were returned by current portal session.'
    }
  });
};

const getAttendanceCounts = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const sem = req.query.semester || session.dataset.semesters[0]?.registration_id;
  let attendanceRows = session.dataset.attendanceData?.[sem]?.studentattendancelist || [];
  if (!attendanceRows.length) {
    await hydrateAttendanceForSemester(session, req, sem);
    attendanceRows = session.dataset.attendanceData?.[sem]?.studentattendancelist || [];
  }

  const counts = {};
  const pendingRows = [];

  for (const row of attendanceRows) {
    const subjectCode = String(row?.subjectcode || row?.individualsubjectcode || '').trim();
    if (!subjectCode) continue;

    const directTotal = Number(row?.totalclasses || 0);
    const directAttendedRaw = Number(row?.attendedclasses || 0);
    const directAttended = Number.isFinite(directAttendedRaw) ? directAttendedRaw : 0;
    if (directTotal > 0) {
      counts[subjectCode] = {
        attended: Math.max(0, Math.min(directAttended, directTotal)),
        total: directTotal,
        source: 'direct'
      };
      continue;
    }

    pendingRows.push({ subjectCode });
  }

  await mapWithConcurrency(pendingRows, 4, async ({ subjectCode }) => {
    try {
      const relaySessionId = session.dataset.relaySessionId;
      const ownerId = ownerKey(req);
      const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
      const authContext = buildAuthContextFromRelaySession(relaySession);

      let payload = null;
      if (relaySession && authContext?.instituteid) {
        payload = await attendanceService.fetchSubjectDailyAttendance(relaySession, authContext, sem, subjectCode);
      } else {
        payload = await resolveSubjectDailyPayload(session, req, sem, subjectCode);
      }

      const summary = computeDailyCountSummary(payload?.studentAttdsummarylist || []);
      counts[subjectCode] = {
        attended: summary.attended,
        total: summary.total,
        source: 'daily',
        message: payload?.message || ''
      };
    } catch (error) {
      counts[subjectCode] = {
        attended: 0,
        total: 0,
        source: 'daily',
        message: error?.message || 'Unable to load day-to-day attendance for this subject.'
      };
    }
    return true;
  });

  return res.status(200).json({
    success: true,
    data: {
      semester: sem,
      counts
    }
  });
};

const getSubjectAttendance = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const sem = req.query.semester || session.dataset.semesters[0]?.registration_id;
  const subject = req.query.subject || '';

  // Try clean service first
  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  if (relaySession && authContext?.instituteid) {
    try {
      const result = await attendanceService.fetchSubjectDailyAttendance(
        relaySession, authContext, sem, subject
      );
      if (result.studentAttdsummarylist.length) {
        return res.status(200).json({ success: true, data: result });
      }
    } catch (_err) {
      // Fall through to legacy
    }
  }

  // Legacy fallback
  const payload = await resolveSubjectDailyPayload(session, req, sem, subject);
  return res.status(200).json({
    success: true,
    data: payload
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

    const nextProfile = candidates.reduce(
      (acc, candidate) => ({ ...acc, ...stripEmptyProfileValues(mapProfile(candidate)) }),
      {}
    );
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
      instituteid: authContext.instituteid,
      memberid: authContext.memberid
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

  const photoValue = profile.studentphoto;
  const hasProfilePhoto =
    photoValue !== null &&
    photoValue !== undefined &&
    String(photoValue).trim() !== '' &&
    String(photoValue).trim() !== '-' &&
    String(photoValue).trim().toLowerCase() !== 'null';

  const hasUsefulProfile = usefulProfileCount >= 4;
  const hasAnyProfile = Object.keys(profile || {}).length > 0;

  if (!hasUsefulProfile || !hasProfilePhoto) {
    if (!forceRefresh && hasAnyProfile) {
      getProfileOnDemand(session, req).catch(() => null);
      return res.status(200).json({ success: true, data: profile, refreshing: true });
    }

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

const getProfilePhoto = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;
  const debug = parseBooleanLike(req?.query?.debug, false);

  const buildDebugPayload = (base = {}) => ({
    success: false,
    message: 'Official portal photo proxy failed',
    debug: {
      sourcePreview: String(req?.query?.source || '').slice(0, 160),
      ...base
    }
  });

  const source = String(req?.query?.source || '').trim() || resolveProfilePhotoSourceFromSession(session?.dataset?.profile || {});
  const inlinePhoto = decodeInlinePhotoSource(source);
  if (inlinePhoto?.buffer?.length) {
    if (debug) {
      return res.status(200).json({
        success: true,
        message: 'Official portal photo proxy debug',
        debug: {
          code: 'INLINE_BASE64_IMAGE',
          contentType: inlinePhoto.contentType,
          byteLength: inlinePhoto.buffer.length
        }
      });
    }

    res.setHeader('Content-Type', inlinePhoto.contentType || 'image/jpeg');
    res.setHeader('Content-Length', inlinePhoto.buffer.length);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(inlinePhoto.buffer);
  }

  const photoUrl = normalizePortalPhotoSource(source);
  if (!photoUrl) {
    return res.status(400).json(
      debug ? buildDebugPayload({ code: 'INVALID_SOURCE' }) : { success: false, message: 'Invalid profile photo source' }
    );
  }

  const relaySessionId = session?.dataset?.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  if (!relaySession) {
    return res.status(400).json(
      debug
        ? buildDebugPayload({ code: 'NO_RELAY_SESSION', normalizedUrl: photoUrl })
        : { success: false, message: 'No active portal relay session' }
    );
  }

  const headers = {
    Accept: 'image/*,*/*;q=0.8',
    Referer: 'https://webportal.jiit.ac.in:6011/studentportal/#/',
    Origin: 'https://webportal.jiit.ac.in:6011'
  };

  const cookieHeader = buildCookieHeader(relaySession);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const { response, error } = await timedPortalFetch(photoUrl, { method: 'GET', headers }, 15000);
  if (error || !response?.ok) {
    const debugMeta = {
      code: 'UPSTREAM_FETCH_FAILED',
      normalizedUrl: photoUrl,
      upstreamStatus: response?.status || 0,
      upstreamStatusText: response?.statusText || '',
      errorName: error?.name || '',
      errorMessage: error?.message || ''
    };
    console.warn('[profile-photo-proxy] upstream fetch failed', debugMeta);
    return res.status(502).json(debug ? buildDebugPayload(debugMeta) : { success: false, message: 'Failed to fetch official portal photo' });
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  const looksLikeImage = contentType.startsWith('image/') || isLikelyImageBuffer(buffer);
  if (!looksLikeImage || !buffer.length) {
    const textPreview = buffer.subarray(0, 256).toString('utf8').replace(/\s+/g, ' ').trim();
    const debugMeta = {
      code: 'UPSTREAM_NOT_IMAGE',
      normalizedUrl: photoUrl,
      upstreamStatus: response.status,
      contentType,
      byteLength: buffer.length,
      preview: textPreview
    };
    console.warn('[profile-photo-proxy] upstream returned non-image payload', debugMeta);
    return res.status(502).json(
      debug ? buildDebugPayload(debugMeta) : { success: false, message: 'Official portal did not return a valid image' }
    );
  }

  if (debug) {
    return res.status(200).json({
      success: true,
      message: 'Official portal photo proxy debug',
      debug: {
        normalizedUrl: photoUrl,
        upstreamStatus: response.status,
        contentType,
        byteLength: buffer.length
      }
    });
  }

  res.setHeader('Content-Type', contentType.startsWith('image/') ? contentType : 'image/jpeg');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(buffer);
};

const getGrades = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const shouldRealtime = shouldRefreshRealtime(req);
  const forceRealtime = parseBooleanLike(req?.query?.refresh, false);
  const hasCached = hasRenderableGradesDataset(session?.dataset);

  if (shouldRealtime && hasCached) {
    refreshDatasetRealtime(session, req, { bypassThrottle: forceRealtime }).catch(() => null);
  } else {
    await refreshDatasetRealtime(session, req, { bypassThrottle: forceRealtime });
  }

  return res.status(200).json({
    success: true,
    data: {
      semesters: session.dataset.semesters || [],
      summaries: session.dataset.grades || [],
      gradeCards: session.dataset.gradeCards || {}
    }
  });
};

const getMarksSemesters = async (req, res) => {
  const session = ensureSession(req, res);
  if (!session) return undefined;

  const ownerId = ownerKey(req);
  const relaySessionId = session?.dataset?.relaySessionId;
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  let marksSemesters = Array.isArray(session?.dataset?.marksSemesters) ? session.dataset.marksSemesters : [];
  const fallbackSemesters = sortSemestersDesc(Array.isArray(session?.dataset?.semesters) ? session.dataset.semesters : []);
  const forceRefresh = parseBooleanLike(req?.query?.refresh, false);

  const mergedMarksSemesterOptions = () => {
    const byId = new Map();
    const byCode = new Map();

    const upsert = (row) => {
      if (!row || typeof row !== 'object') return;

      const registrationId = String(row?.registration_id || '').trim();
      const registrationCode = String(row?.registration_code || '').trim();
      const codeToken = normalizeSemesterLabelToken(registrationCode);

      if (!registrationId && !registrationCode) return;

      const existingById = registrationId ? byId.get(registrationId) : null;
      const existingByCode = codeToken ? byCode.get(codeToken) : null;
      const existing = existingById || existingByCode || null;

      const merged = {
        ...(existing || {}),
        ...row,
        registration_id: registrationId || existing?.registration_id || null,
        registration_code: registrationCode || existing?.registration_code || null,
        stynumber: row?.stynumber || existing?.stynumber || null
      };

      if (merged.registration_id) {
        byId.set(String(merged.registration_id), merged);
      }

      const mergedCodeToken = normalizeSemesterLabelToken(merged.registration_code);
      if (mergedCodeToken) {
        byCode.set(mergedCodeToken, merged);
      }
    };

    (marksSemesters || []).forEach(upsert);
    (fallbackSemesters || []).forEach(upsert);

    const mergedRows = [...byId.values()];
    for (const row of byCode.values()) {
      const idKey = String(row?.registration_id || '').trim();
      if (idKey && byId.has(idKey)) continue;
      mergedRows.push(row);
    }

    return sortSemestersDesc(mergedRows);
  };

  const fetchAndStoreMarksSemesters = async () => {
    if (!(relaySession && authContext?.instituteid)) {
      return marksSemesters;
    }

    const marksSemRes = await postPortal(
      relaySession,
      authContext,
      '/StudentPortalAPI/studentcommonsontroller/getsemestercode-exammarks',
      {
        instituteid: authContext.instituteid,
        studentid: authContext.memberid
      }
    );

    if (!(marksSemRes?.ok && statusSuccess(marksSemRes.data))) {
      return marksSemesters;
    }

    const rawRows = marksSemRes.data?.response?.semestercode || marksSemRes.data?.response?.semesterCodeinfo?.semestercode || [];
    const normalizedRows = sortSemestersDesc(normalizeSemesters(rawRows));

    if (!normalizedRows.length) {
      return marksSemesters;
    }

    marksSemesters = normalizedRows;
    session.dataset.marksSemesters = normalizedRows;

    const merged = [...(Array.isArray(session.dataset.semesters) ? session.dataset.semesters : [])];
    const byId = new Map(
      merged
        .filter((row) => row?.registration_id)
        .map((row) => [String(row.registration_id), row])
    );

    for (const sem of normalizedRows) {
      const key = String(sem?.registration_id || '');
      if (!key) continue;

      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, sem);
        continue;
      }

      byId.set(key, {
        ...existing,
        registration_code: existing.registration_code || sem.registration_code,
        stynumber: existing.stynumber || sem.stynumber || null
      });
    }

    session.dataset.semesters = sortSemestersDesc([...byId.values()]);
    session.updatedAt = Date.now();

    return marksSemesters;
  };

  if (!forceRefresh && (marksSemesters.length || fallbackSemesters.length)) {
    fetchAndStoreMarksSemesters().catch(() => null);
    const fastRows = mergedMarksSemesterOptions();
    return res.status(200).json({ success: true, data: fastRows, refreshing: true });
  }

  await fetchAndStoreMarksSemesters();

  const finalRows = mergedMarksSemesterOptions();
  session.dataset.marksSemesters = finalRows;
  session.updatedAt = Date.now();

  return res.status(200).json({ success: true, data: finalRows });
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

  await hydrateAttendanceForSemester(session, req, sem);
  const hydratedSubjects = session.dataset.subjects[sem] || { registered: [], faculties: [], details: [] };
  const hasHydratedRows =
    (Array.isArray(hydratedSubjects?.details) && hydratedSubjects.details.length > 0) ||
    (Array.isArray(hydratedSubjects?.registered) && hydratedSubjects.registered.length > 0);

  if (hasHydratedRows) {
    return res.status(200).json({ success: true, data: hydratedSubjects });
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

  const rawRegId = String(registration_id || '').trim();
  const rawRegCode = String(registration_code || '').trim();
  const rawInstituteId = String(authContext.instituteid || '').trim();

  if (!rawRegId || !rawRegCode || !rawInstituteId) {
    return res.status(400).json({ success: false, message: 'Invalid marks semester payload' });
  }

  const regIdSegment = encodeURIComponent(rawRegId);
  const regCodeSegment = encodeURIComponent(rawRegCode);
  const instituteSegment = encodeURIComponent(rawInstituteId);

  const pdfPath = `/StudentPortalAPI/studentsexamview/printstudent-exammarks/${instituteSegment}/${regIdSegment}/${regCodeSegment}`;
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

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  const looksLikePdfMime = contentType.includes('pdf') || contentType.includes('octet-stream');

  if (!looksLikePdfMime && !isLikelyPdfBuffer(buffer)) {
    return res.status(502).json({ success: false, message: 'Portal did not return a PDF' });
  }

  if (!buffer.length) {
    return res.status(502).json({ success: false, message: 'Portal returned an empty PDF' });
  }

  const safeFilenameSem = rawRegCode.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'semester';
  const filename = `marks_${safeFilenameSem}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(buffer);
};

const finiteNumberOrNull = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const mergeMarksExamEntry = (base = {}, incoming = {}) => {
  const merged = { ...(base || {}) };
  const candidate = incoming && typeof incoming === 'object' ? incoming : {};

  ['obtainedWeightage', 'totalWeightage', 'obtainedMarks', 'fullMarks'].forEach((key) => {
    const current = finiteNumberOrNull(merged[key]);
    if (current !== null) return;
    const next = finiteNumberOrNull(candidate[key]);
    if (next !== null) merged[key] = next;
  });

  if (!merged.remarks && candidate.remarks) {
    merged.remarks = candidate.remarks;
  }

  return merged;
};

const mergeParsedMarksChunks = (chunks = []) => {
  const merged = { courses: [], exams: [], studentInfo: {} };
  const byCourse = new Map();
  const examsSet = new Set();

  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object') continue;

    const info = chunk.studentInfo && typeof chunk.studentInfo === 'object' ? chunk.studentInfo : {};
    for (const [key, value] of Object.entries(info)) {
      if (value === null || value === undefined || String(value).trim() === '') continue;
      if (!merged.studentInfo[key]) merged.studentInfo[key] = value;
    }

    const examNames = Array.isArray(chunk.exams) ? chunk.exams : [];
    for (const examName of examNames) {
      const text = String(examName || '').trim();
      if (text) examsSet.add(text);
    }

    const courses = Array.isArray(chunk.courses) ? chunk.courses : [];
    for (const course of courses) {
      const code = String(course?.code || '').trim();
      const name = String(course?.name || '').trim();
      const key = code
        ? `C:${code.toUpperCase()}`
        : `N:${String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
      if (!key) continue;

      if (!byCourse.has(key)) {
        byCourse.set(key, {
          name: name || code || 'SUBJECT',
          code,
          totalObtained: finiteNumberOrNull(course?.totalObtained),
          totalFull: finiteNumberOrNull(course?.totalFull),
          exams: {}
        });
      }

      const existing = byCourse.get(key);
      if (!existing.name && name) existing.name = name;
      if (!existing.code && code) existing.code = code;

      const incomingTotal = finiteNumberOrNull(course?.totalFull);
      const incomingObtained = finiteNumberOrNull(course?.totalObtained);

      if (existing.totalFull === null && incomingTotal !== null) {
        existing.totalFull = incomingTotal;
      } else if (existing.totalFull !== null && incomingTotal !== null) {
        existing.totalFull = Math.max(existing.totalFull, incomingTotal);
      }

      if (existing.totalObtained === null && incomingObtained !== null) {
        existing.totalObtained = incomingObtained;
      } else if (existing.totalObtained !== null && incomingObtained !== null) {
        existing.totalObtained = Math.max(existing.totalObtained, incomingObtained);
      }

      const exams = course?.exams && typeof course.exams === 'object' ? course.exams : {};
      for (const [examName, marks] of Object.entries(exams)) {
        const examKey = String(examName || '').trim();
        if (!examKey) continue;
        examsSet.add(examKey);
        existing.exams[examKey] = mergeMarksExamEntry(existing.exams[examKey], marks);
      }
    }
  }

  merged.courses = [...byCourse.values()].map((course) => {
    let totalFull = finiteNumberOrNull(course.totalFull);
    let totalObtained = finiteNumberOrNull(course.totalObtained);

    if (!(totalFull > 0)) {
      let derivedFull = 0;
      let derivedObtained = 0;
      for (const marks of Object.values(course.exams || {})) {
        const total = finiteNumberOrNull(marks?.totalWeightage) ?? finiteNumberOrNull(marks?.fullMarks);
        const obtained = finiteNumberOrNull(marks?.obtainedWeightage) ?? finiteNumberOrNull(marks?.obtainedMarks);
        if (!(total > 0)) continue;
        derivedFull += total;
        derivedObtained += obtained !== null ? Math.max(0, Math.min(obtained, total)) : 0;
      }

      if (derivedFull > 0) {
        totalFull = derivedFull;
        totalObtained = derivedObtained;
      }
    }

    return {
      ...course,
      totalObtained: totalObtained !== null ? totalObtained : 0,
      totalFull: totalFull !== null ? totalFull : 0
    };
  }).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

  merged.exams = [...examsSet];
  if (!merged.exams.length) {
    merged.exams = [...new Set(merged.courses.flatMap((course) => Object.keys(course?.exams || {})))];
  }

  return merged;
};

// ── Marks PDF parsing ──
const getMarksData = async (req, res) => {
  const session = getSessionByOwner(ownerKey(req));
  if (!session?.dataset) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const { registration_id, registration_code } = req.query;
  if (!registration_id || !registration_code) {
    return res.status(400).json({ success: false, message: 'registration_id and registration_code are required' });
  }

  if (String(session?.dataset?.mode || '').toLowerCase() === 'public-demo') {
    const rawRegId = String(registration_id || '').trim();
    const rawRegCode = String(registration_code || '').trim();
    const cacheKey = `${rawRegId}__${rawRegCode}`;
    const marksCache = session.dataset?.marksParsedData && typeof session.dataset.marksParsedData === 'object'
      ? session.dataset.marksParsedData
      : {};

    const direct = marksCache[cacheKey] || null;
    const bySemesterId = direct || Object.entries(marksCache).find(([key]) => key.startsWith(`${rawRegId}__`))?.[1] || null;

    return res.json({
      success: true,
      data: bySemesterId || { courses: [], exams: [], error: 'No demo marks available for this semester' },
      cached: true,
      demo: true
    });
  }

  const relaySessionId = session.dataset.relaySessionId;
  const ownerId = ownerKey(req);
  const relaySession = relaySessionId ? ensureOwnedSession(relaySessionId, ownerId) : null;
  const authContext = buildAuthContextFromRelaySession(relaySession);

  if (!(relaySession && authContext?.instituteid)) {
    return res.status(400).json({ success: false, message: 'No active portal session' });
  }

  const rawRegId = String(registration_id || '').trim();
  const rawRegCode = String(registration_code || '').trim();
  const rawInstituteId = String(authContext.instituteid || '').trim();

  if (!rawRegId || !rawRegCode || !rawInstituteId) {
    return res.status(400).json({ success: false, message: 'Invalid marks semester payload' });
  }

  const cacheKey = `${rawRegId}__${rawRegCode}`;
  const forceRefresh = parseBooleanLike(req?.query?.refresh, false);
  const marksCache = session.dataset?.marksParsedData && typeof session.dataset.marksParsedData === 'object'
    ? session.dataset.marksParsedData
    : {};

  if (!forceRefresh && marksCache[cacheKey]) {
    return res.json({ success: true, data: marksCache[cacheKey], cached: true });
  }

  try {
    let portalClient = null;
    try {
      portalClient = new PortalClient(relaySession, authContext);
    } catch (_clientErr) {
      // Fall through to legacy fetch
    }

    let parsed;

    if (portalClient) {
      // Use the new portalMarks service
      parsed = await fetchMarksFromPdf(portalClient, rawRegId, rawRegCode);
    } else {
      // Legacy fallback: inline fetch + parse (keeps old behavior)
      const regIdSegment = encodeURIComponent(rawRegId);
      const regCodeSegment = encodeURIComponent(rawRegCode);
      const instituteSegment = encodeURIComponent(String(authContext.instituteid).trim());

      const pdfPath = `/StudentPortalAPI/studentsexamview/printstudent-exammarks/${instituteSegment}/${regIdSegment}/${regCodeSegment}`;
      const url = toPortalUrl(pdfPath);

      const headers = buildCommonHeaders(relaySession, authContext, 'application/json');
      delete headers['Content-Type'];
      headers.Accept = 'application/pdf, application/octet-stream, */*';

      const { response, error } = await timedPortalFetch(url, { method: 'GET', headers });

      if (error || !response?.ok) {
        return res.status(502).json({
          success: false,
          code: 'MARKS_PDF_UNAVAILABLE',
          message: 'No marks PDF available for this semester'
        });
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const looksLikePdfMime = contentType.includes('pdf') || contentType.includes('octet-stream');

      if (!looksLikePdfMime && !isLikelyPdfBuffer(buffer)) {
        return res.status(502).json({
          success: false,
          code: 'MARKS_INVALID_PDF',
          message: 'Portal did not return a PDF'
        });
      }

      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });

      try {
        const [textResult, tableResult] = await Promise.all([
          parser.getText().catch(() => null),
          parser.getTable().catch(() => null)
        ]);

        const tableChunks = [];
        if (Array.isArray(tableResult?.pages)) {
          for (const page of tableResult.pages) {
            const pageTables = Array.isArray(page?.tables) ? page.tables : [];
            if (!pageTables.length) continue;
            const chunk = parseMarksTables(pageTables);
            if (Array.isArray(chunk?.courses) && chunk.courses.length) {
              tableChunks.push(chunk);
            }
          }
        }

        const textChunks = [];
        const pageTexts = Array.isArray(textResult?.pages)
          ? textResult.pages.map((page) => String(page?.text || '')).filter((text) => text.trim())
          : [];

        if (pageTexts.length) {
          textChunks.push(
            ...pageTexts
              .map((text) => parseMarksText(text))
              .filter((chunk) => Array.isArray(chunk?.courses) && chunk.courses.length)
          );
        } else {
          const fallbackText = String(textResult?.text || '');
          if (fallbackText.trim()) {
            const chunk = parseMarksText(fallbackText);
            if (Array.isArray(chunk?.courses) && chunk.courses.length) {
              textChunks.push(chunk);
            }
          }
        }

        const mergedChunks = [...tableChunks, ...textChunks];
        if (mergedChunks.length) {
          parsed = mergeParsedMarksChunks(mergedChunks);
        }

        if (!parsed || !Array.isArray(parsed.courses) || !parsed.courses.length) {
          const rawText = Array.isArray(textResult?.pages)
            ? textResult.pages.map((page) => String(page?.text || '')).join('\n')
            : String(textResult?.text || '');
          parsed = parseMarksText(rawText);
        }
      } finally {
        await parser.destroy().catch(() => null);
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      parsed = { courses: [], exams: [], studentInfo: {} };
    }

    session.dataset.marksParsedData = {
      ...marksCache,
      [cacheKey]: parsed
    };
    session.updatedAt = Date.now();

    return res.json({ success: true, data: parsed });
  } catch (err) {
    return res.status(502).json({
      success: false,
      code: err.type || 'PARSE_ERROR',
      message: 'Failed to parse marks PDF'
    });
  }
};

/**
 * Parse structured table data extracted from the marks PDF.
 * Mimics the Python jiit_marks extractor (parse_report).
 * Supports both shapes below:
 *   - pdf-parse `getTable()` output: `string[][]`
 *   - legacy shape: `{ rows: string[][] }`
 */
function parseMarksTables(tables) {
  const result = { courses: [], exams: [], studentInfo: {} };

  const tableRows = Array.isArray(tables)
    ? tables
        .map((table) => {
          if (Array.isArray(table)) return table;
          if (table && Array.isArray(table.rows)) return table.rows;
          return [];
        })
        .filter((rows) => rows.length)
    : [];

  if (!tableRows.length) {
    return result;
  }

  // Table 0: Student info
  const infoRows = tableRows[0] || [];
  if (infoRows.length) {
    for (const row of infoRows) {
      for (const cell of Array.isArray(row) ? row : []) {
        const text = String(cell || '').trim();
        if (text.includes(': ')) {
          const [key, ...rest] = text.split(': ');
          result.studentInfo[key.trim().toLowerCase().replace(/\s+/g, '_')] = rest.join(': ').trim();
        }
      }
    }
  }

  const parseExamNamesFromHeader = (row = []) => {
    const names = [];
    for (let j = 1; j < row.length; j++) {
      const cell = String(row[j] || '').trim();
      if (!cell) continue;
      if (names[names.length - 1] === cell) continue;
      names.push(cell);
    }
    return names;
  };

  const parseRatio = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;

    const match = text.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;

    const num = Number(match[1]);
    const den = Number(match[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den)) return null;

    return { num, den };
  };

  const globalExamNames = [];

  for (const marksRows of tableRows) {
    if (!Array.isArray(marksRows) || !marksRows.length) continue;

    let headerIndex = marksRows.findIndex((row) =>
      /^subject\b/i.test(String((Array.isArray(row) ? row[0] : '') || '').trim())
    );

    let activeExamNames = globalExamNames;
    let startRow = 0;

    if (headerIndex >= 0) {
      const headerRow = Array.isArray(marksRows[headerIndex]) ? marksRows[headerIndex] : [];
      const headerExamNames = parseExamNamesFromHeader(headerRow);
      if (headerExamNames.length) {
        activeExamNames = headerExamNames;
        if (!globalExamNames.length) {
          globalExamNames.push(...headerExamNames);
        } else {
          const union = [...new Set([...globalExamNames, ...headerExamNames])];
          globalExamNames.splice(0, globalExamNames.length, ...union);
        }
      }

      startRow = headerIndex + 1;
      const subHeader = Array.isArray(marksRows[startRow]) ? marksRows[startRow] : [];
      const subHeaderText = subHeader.map((cell) => String(cell || '').trim()).join(' ').toUpperCase();
      if (/(OM|FM|OW|WT|OBTAINED|WEIGHTAGE|TOTAL)/.test(subHeaderText)) {
        startRow += 1;
      }
    }

    if (!activeExamNames.length) continue;

    for (let r = startRow; r < marksRows.length; r++) {
      const row = Array.isArray(marksRows[r]) ? marksRows[r] : [];
      if (!row?.length) continue;

      const maybeHeader = String(row[0] || '').trim();
      if (/^subject\b/i.test(maybeHeader)) {
        const headerExamNames = parseExamNamesFromHeader(row);
        if (headerExamNames.length) {
          activeExamNames = headerExamNames;
          const union = [...new Set([...globalExamNames, ...headerExamNames])];
          globalExamNames.splice(0, globalExamNames.length, ...union);
        }
        continue;
      }

      // First cell: subject name (code)
      const nameCell = String(row[0] || '').trim();
      if (!nameCell) continue;
      if (/^(legend|result|overall|grand\s*total|sgpa|cgpa|gpa|total)$/i.test(nameCell)) continue;

      // Parse: "SUBJECT NAME\n(CODE)" or "SUBJECT NAME\nCODE"
      const nameParts = nameCell.split('\n');
      const bracketCode = nameCell.match(/\(([A-Za-z0-9_-]+)\)\s*$/);
      let code = bracketCode ? String(bracketCode[1] || '').trim() : '';
      let name = bracketCode ? nameCell.replace(/\([A-Za-z0-9_-]+\)\s*$/, '').trim() : nameCell;

      if (!code && nameParts.length > 1) {
        const tail = String(nameParts[nameParts.length - 1] || '').trim().replace(/[()]/g, '');
        if (/^[A-Za-z0-9_-]{4,}$/.test(tail)) {
          code = tail;
          name = nameParts.slice(0, -1).join(' ').trim() || tail;
        }
      }

      const course = {
        name: String(name || code || 'SUBJECT').toUpperCase(),
        code,
        totalObtained: 0,
        totalFull: 0,
        exams: {}
      };

      // Parse marks cells (pairs: marks, weightage for each exam)
      const marksCells = row.slice(1).map((cell) => String(cell || '').trim());
      let examIdx = 0;
      let cellIdx = 0;

      while (cellIdx < marksCells.length && examIdx < activeExamNames.length) {
        const cell = marksCells[cellIdx] || '';

        if (!cell) {
          cellIdx += 1;
          continue;
        }

        if (cell === '-') {
          // No marks for this exam, skip 2 cells (marks + weightage)
          course.exams[activeExamNames[examIdx]] = { remarks: 'not_published' };
          examIdx++;
          cellIdx += 2;
          continue;
        }

        const marks = {};

        // Cell should be "obtained/ total" for marks
        if (cell === 'A') {
          marks.remarks = 'absent';
        } else {
          const marksMatch = parseRatio(cell);
          if (marksMatch) {
            marks.obtainedMarks = marksMatch.num;
            marks.fullMarks = marksMatch.den;
          }
        }

        // Next cell: weightage "obtained/total"
        cellIdx++;
        if (cellIdx < marksCells.length) {
          const weightCell = marksCells[cellIdx] || '';
          const weightMatch = weightCell && weightCell !== '-' ? parseRatio(weightCell) : null;
          if (weightMatch) {
            marks.obtainedWeightage = weightMatch.num;
            marks.totalWeightage = weightMatch.den;
            course.totalObtained += marks.obtainedWeightage;
            course.totalFull += marks.totalWeightage;
          }
        }

        if (Object.keys(marks).length) {
          course.exams[activeExamNames[examIdx]] = marks;
        }

        examIdx++;
        cellIdx++;
      }

      if (Object.keys(course.exams).length) {
        result.courses.push(course);
      }
    }
  }

  result.exams = [...globalExamNames];

  return result;
}

function parseMarksText(text) {
  const result = { courses: [], exams: [], studentInfo: {} };

  // The PDF may contain multiple pages. Each page has exam data for one semester.
  // We parse the raw text treating each page independently.
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract student info
  for (const line of lines) {
    const nameMatch = line.match(/Name:\s*(.+?)(?:\s+Enrollment|$)/);
    if (nameMatch && !result.studentInfo.name) result.studentInfo.name = nameMatch[1].trim();
    const enrollMatch = line.match(/Enrollment No:\s*(\S+)/);
    if (enrollMatch) result.studentInfo.enrollment_no = enrollMatch[1].trim();
    const regMatch = line.match(/Registration Code:\s*(\S+)/);
    if (regMatch) result.studentInfo.registration_code = regMatch[1].trim();
  }

  // Find the subject code header line to extract exam names
  // Format: "Subject Code EXAM1 EXAM2 EXAM3..."
  let examNames = [];
  let headerIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^Subject\s+Code\b/i.test(lines[i])) {
      const after = lines[i].replace(/^Subject\s+Code\s*/i, '');
      // Split exam names on 2+ spaces
      examNames = after.split(/\s{2,}/).filter(Boolean).map(e => e.trim());
      headerIdx = i;
      break; // Use first occurrence only
    }
  }

  if (!examNames.length || headerIdx < 0) return result;
  result.exams = examNames;

  // Skip OM/FM OW/WT sub-header line
  const startIdx = headerIdx + 2;

  // Now we must accumulate subject entries.
  // A subject entry looks like:
  //   SUBJECT NAME LINE 1        (maybe multi-line)
  //   SUBJECT NAME LINE 2        (optional continuation)
  //   (CODE) marks...             OR
  //   (CODE)
  //   marks on next line...
  //
  // Marks are tokens like "9.0/ 20.0" (OM/FM) "9.0/20.0" (OW/WT) or "-" for absent.
  // Each exam event has 2 token-pairs (OM/FM + OW/WT) or 2 dashes.

  // Gather all remaining lines from startIdx to "Legend"
  const dataLines = [];
  for (let i = startIdx; i < lines.length; i++) {
    if (/^Legend\b/i.test(lines[i])) break;
    if (/^Page \d+/i.test(lines[i])) break;
    if (/^Jaypee Institute/i.test(lines[i])) break;
    dataLines.push(lines[i]);
  }

  // Join all data into one string and split by subject code pattern
  const joinedData = dataLines.join('\n');

  // Match pattern: subject name(s) followed by (CODE) followed by marks
  // Code pattern: parenthesized alphanumeric code like (15B11EC411)
  const subjectPattern = /\((\d{2}[A-Za-z]\w+)\)/g;
  let match;
  const codePositions = [];

  while ((match = subjectPattern.exec(joinedData)) !== null) {
    codePositions.push({ code: match[1], index: match.index, endIndex: match.index + match[0].length });
  }

  for (let s = 0; s < codePositions.length; s++) {
    const { code, index, endIndex } = codePositions[s];

    // Name is everything before this code, after the previous code's marks end
    const prevEnd = s > 0 ? codePositions[s - 1].endIndex : 0;
    const namePart = joinedData.substring(prevEnd, index).trim();

    // Clean up the name: remove marks data from previous entry that might leak in
    // Take only the trailing non-numeric text lines
    const nameChunks = namePart.split('\n');
    const nameLinesCleaned = [];
    for (let k = nameChunks.length - 1; k >= 0; k--) {
      const chunk = nameChunks[k].trim();
      if (!chunk) continue;
      // If this chunk has marks data (fractions or just dashes), it's from prev entry
      if (/^\s*[\d\.\s\/\-]+\s*$/.test(chunk)) break;
      nameLinesCleaned.unshift(chunk);
    }
    const name = nameLinesCleaned.join(' ').trim() || code;

    // Marks are everything after (CODE) until the next subject name starts
    const nextNameStart = s < codePositions.length - 1
      ? codePositions[s + 1].index
      : joinedData.length;

    // But we need to stop at the next subject name, not the next code
    // The marks data is right after the code, possibly on the same line
    let marksStr = joinedData.substring(endIndex, nextNameStart).trim();

    // Remove any trailing subject name lines (text-only lines at the end)
    const marksLines = marksStr.split('\n');
    const cleanedMarksLines = [];
    for (const ml of marksLines) {
      const trimmed = ml.trim();
      if (!trimmed) continue;
      // If this is purely text (no digits or slashes), it's part of next subject name
      if (/^[A-Za-z][A-Za-z\s&\-\/\.,]+$/.test(trimmed) && !trimmed.includes('/') && !/\d/.test(trimmed)) {
        break;
      }
      cleanedMarksLines.push(trimmed);
    }
    marksStr = cleanedMarksLines.join(' ');

    // Tokenize marks: split by whitespace
    const tokens = marksStr.split(/\s+/).filter(Boolean);
    const course = { name: name.toUpperCase(), code, totalObtained: 0, totalFull: 0, exams: {} };

    let examIdx = 0;
    let tokenIdx = 0;

    while (tokenIdx < tokens.length && examIdx < examNames.length) {
      const t = tokens[tokenIdx];

      if (t === '-') {
        // Dash means no data. Each exam has 2 pairs (OM/FM + OW/WT) = 4 values,
        // but they appear as 2 dash tokens (one for OM/FM, one for OW/WT)
        course.exams[examNames[examIdx]] = { remarks: 'not_published' };
        tokenIdx++;
        if (tokenIdx < tokens.length && tokens[tokenIdx] === '-') {
          tokenIdx++;
        }
        examIdx++;
        continue;
      }

      // Try to parse fraction: "obtained/ total" or "obtained/total"
      // Fractions can be split across tokens: "9.0/" "20.0" or "9.0/20.0"
      const parseFraction = (startIdx) => {
        const tk = tokens[startIdx] || '';
        // Full fraction in one token
        const fullMatch = tk.match(/^(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)$/);
        if (fullMatch) return { num: parseFloat(fullMatch[1]), den: parseFloat(fullMatch[2]), consumed: 1 };

        // Partial: "9.0/" + "20.0"
        const partialMatch = tk.match(/^(\d+\.?\d*)\s*\/\s*$/);
        if (partialMatch && startIdx + 1 < tokens.length) {
          const nextTk = tokens[startIdx + 1];
          const nextNum = parseFloat(nextTk);
          if (Number.isFinite(nextNum)) {
            return { num: parseFloat(partialMatch[1]), den: nextNum, consumed: 2 };
          }
        }

        return null;
      };

      // Parse OM/FM
      const omfm = parseFraction(tokenIdx);
      if (!omfm) {
        tokenIdx++;
        continue;
      }
      tokenIdx += omfm.consumed;

      const marks = {
        obtainedMarks: omfm.num,
        fullMarks: omfm.den
      };

      // Parse OW/WT
      const owwt = parseFraction(tokenIdx);
      if (owwt) {
        tokenIdx += owwt.consumed;
        marks.obtainedWeightage = owwt.num;
        marks.totalWeightage = owwt.den;
        course.totalObtained += marks.obtainedWeightage;
        course.totalFull += marks.totalWeightage;
      }

      course.exams[examNames[examIdx]] = marks;
      examIdx++;
    }

    if (Object.keys(course.exams).length > 0) {
      result.courses.push(course);
    }
  }

  return result;
}

module.exports = {
  loginSdk,
  getSdkSession,
  getAttendanceMeta,
  getAttendance,
  getAttendanceCounts,
  getSubjectAttendance,
  getProfile,
  getProfilePhoto,
  getGrades,
  getMarksSemesters,
  getExams,
  getSubjects,
  getFees,
  downloadMarks,
  getMarksData
};
