/**
 * portalAttendanceService.js — Clean attendance service layer.
 *
 * Mirrors the jiit flow:
 *   1. get_attendance_meta()  → semesters + headers (with stynumber)
 *   2. get_attendance(header, semester) → attendance rows
 *   3. get_subject_daily_attendance() → per-class records
 *
 * Uses PortalClient for actual HTTP calls.
 * Uses portalCache for short-TTL caching.
 * All functions accept (relaySession, authContext) — no controller coupling.
 */

const { PortalClient } = require('./portalClient');
const cache = require('./portalCache');

// ── Cache TTLs ─────────────────────────────────────────────────────────────
const META_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — semesters rarely change
const ATTEND_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min  — attendance can update
const COUNTS_CACHE_TTL_MS = 5 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

const userKey = (authContext) =>
  String(authContext?.userid || authContext?.enrollmentno || authContext?.memberid || 'unknown');

/**
 * Normalize a semester row from the portal API.
 * Portal returns: { registrationid, registrationcode, stynumber? }
 */
const normalizeSemester = (row) => {
  if (!row) return null;
  const id = row.registrationid || row.registration_id || row.value || null;
  const code =
    row.registrationcode || row.registration_code || row.registrationdesc || row.label || null;
  const stynumber = row.stynumber || row.sty_number || null;
  if (!id || !code) return null;
  return { registration_id: id, registration_code: code, stynumber };
};

/**
 * Sort semesters by year/term descending (latest first).
 */
const sortSemestersDesc = (semesters) => {
  return [...semesters].sort((a, b) => {
    const scoreA = semesterSortScore(a.registration_code, a.registration_id);
    const scoreB = semesterSortScore(b.registration_code, b.registration_id);
    return scoreB - scoreA;
  });
};

const semesterSortScore = (code = '', id = '') => {
  const text = String(code).toUpperCase();
  const yearMatch = text.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  const term = text.includes('ODD') ? 2 : text.includes('EVE') || text.includes('EVEN') ? 1 : 0;
  const tie = String(id)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return year * 100000 + term * 1000 + tie;
};

/**
 * Normalize attendance rows from the portal API.
 * Handles various key naming conventions.
 */
const normalizeAttendanceRow = (row) => {
  if (!row || typeof row !== 'object') return null;

  // Subject identification
  const subjectcode = row.subjectcode || row.individualsubjectcode || row.subject_code || '';
  const subjectdesc = row.subjectdesc || row.subjectdescription || row.subject_name || subjectcode;
  const subjectid = row.subjectid || row.subject_id || null;

  // Attendance numbers — the portal uses several different key names
  const totalclasses = Number(row.totalclasses || row.total || row.Lclass || 0);
  const attendedclasses = Number(row.attendedclasses || row.attended || row.Lattended || 0);

  // Percentages
  const LTpercantage = Number(row.LTpercantage || row.ltpercentage || row.percentage || 0);
  const Lpercentage = Number(row.Lpercentage || row.lpercentage || 0);
  const Tpercentage = Number(row.Tpercentage || row.tpercentage || 0);
  const Ppercentage = Number(row.Ppercentage || row.ppercentage || 0);

  // Component IDs (needed for daily attendance drill-down)
  const subjectcomponentids = [];
  const Lcomp = row.LsubjectComponentId || row.Lsubjectcomponentid || row.lsubjectcomponentid;
  const Tcomp = row.TsubjectComponentId || row.Tsubjectcomponentid || row.tsubjectcomponentid;
  const Pcomp = row.PsubjectComponentId || row.Psubjectcomponentid || row.psubjectcomponentid;

  if (Lcomp) subjectcomponentids.push(Lcomp);
  if (Tcomp) subjectcomponentids.push(Tcomp);
  if (Pcomp) subjectcomponentids.push(Pcomp);

  return {
    subjectcode,
    subjectdesc,
    subjectid,
    individualsubjectcode: row.individualsubjectcode || subjectcode,
    totalclasses,
    attendedclasses,
    LTpercantage,
    Lpercentage,
    Tpercentage,
    Ppercentage,
    subjectcomponentids,
    // Preserve any extra fields the frontend might use
    Lclass: Number(row.Lclass || 0),
    Lattended: Number(row.Lattended || 0),
    Tclass: Number(row.Tclass || 0),
    Tattended: Number(row.Tattended || 0),
    Pclass: Number(row.Pclass || 0),
    Pattended: Number(row.Pattended || 0),
    LsubjectComponentId: Lcomp || null,
    TsubjectComponentId: Tcomp || null,
    PsubjectComponentId: Pcomp || null,
    raw: row,
  };
};

// ── Core API Functions ─────────────────────────────────────────────────────

/**
 * Fetch attendance meta: semesters + headers.
 * Equivalent to jiit's get_attendance_meta().
 *
 * Returns: { semesters: [], headers: [], latestStynumber: string|null }
 */
const fetchAttendanceMeta = async (relaySession, authContext, opts = {}) => {
  const { forceRefresh = false } = opts;
  const uid = userKey(authContext);

  // Check cache
  if (!forceRefresh) {
    const cached = cache.get(uid, 'attendance-meta');
    if (cached) return cached;
  }

  const client = new PortalClient(relaySession, authContext);

  // Fire three sources of semester data in parallel:
  // 1. Attendance meta (has headers with stynumber)
  // 2. Registered semesters (jiit: get_registered_semesters - the complete list)
  // 3. Grade card registrations (another source)
  const [attendanceMetaData, registeredSemsData, gradeRegData] = await Promise.all([
    client
      .post(
        '/StudentPortalAPI/StudentClassAttendance/getstudentInforegistrationforattendence',
        {
          clientid: authContext.clientid,
          instituteid: authContext.instituteid,
          membertype: authContext.membertype || 'S',
        },
        { encrypted: false }
      )
      .catch((e) => {
        console.error('PORTAL API ERROR:', e.message);
        return { error: true };
      }),
    // jiit's get_registered_semesters() — encrypted payload
    client
      .post('/StudentPortalAPI/reqsubfaculty/getregistrationList', {
        instituteid: authContext.instituteid,
        studentid: authContext.memberid,
      })
      .catch((e) => {
        console.error('PORTAL API ERROR:', e.message);
        return { error: true };
      }),
    client
      .post('/StudentPortalAPI/studentgradecard/getregistrationList', {
        instituteid: authContext.instituteid,
      })
      .catch((e) => {
        console.error('PORTAL API ERROR:', e.message);
        return { error: true };
      }),
  ]);

  // Extract headers (contain stynumber)
  const headerlist = attendanceMetaData?.headerlist || [];
  const latestStynumber = headerlist[0]?.stynumber || headerlist[0]?.sty_number || null;

  // Build stynumber map from all headers
  const stynumberByRegId = {};
  for (const h of headerlist) {
    const regId = h.registrationid || h.registration_id;
    const sty = h.stynumber || h.sty_number;
    if (regId && sty) stynumberByRegId[String(regId)] = sty;
  }

  // Extract semesters from attendance meta
  const attendanceSems = (attendanceMetaData?.semlist || []).map(normalizeSemester).filter(Boolean);

  // Extract from reqsubfaculty/getregistrationList (jiit's canonical list)
  const registeredSems = (registeredSemsData?.registrations || [])
    .map(normalizeSemester)
    .filter(Boolean);

  // Extract from grade card registrations
  const gradeSems = (gradeRegData?.registrations || []).map(normalizeSemester).filter(Boolean);

  // Merge all sources: attendance → registered → grades
  const seenIds = new Set();
  const merged = [];
  for (const source of [attendanceSems, registeredSems, gradeSems]) {
    for (const sem of source) {
      const id = String(sem.registration_id);
      if (!seenIds.has(id)) {
        merged.push(sem);
        seenIds.add(id);
      }
    }
  }

  // Enrich with stynumber from headers
  const semesters = sortSemestersDesc(merged).map((sem, idx) => ({
    ...sem,
    stynumber:
      sem.stynumber ||
      stynumberByRegId[String(sem.registration_id)] ||
      (idx === 0 ? latestStynumber : null),
  }));

  const result = { semesters, headers: headerlist, latestStynumber };
  cache.set(uid, 'attendance-meta', result, META_CACHE_TTL_MS);
  return result;
};

/**
 * Resolve stynumber for a semester.
 * IMPORTANT: jiit's get_attendance() always passes `header.stynumber` (the LATEST
 * header's stynumber) regardless of which semester is being queried.
 * We must match this behavior — always use latestStynumber.
 */
const resolveStynumber = (semester, meta = {}) => {
  // Always prefer the latest header stynumber (matches jiit exactly)
  if (meta.latestStynumber) return meta.latestStynumber;
  if (semester?.stynumber) return semester.stynumber;

  // Last resort: derive from total semester count
  const semesters = meta.semesters || [];
  return semesters.length ? String(semesters.length) : null;
};

/**
 * Fetch attendance for a specific semester.
 * Equivalent to jiit's get_attendance(header, semester).
 *
 * Returns: { studentattendancelist: [], subjects: {} }
 */
const fetchAttendance = async (relaySession, authContext, semesterId, opts = {}) => {
  const { forceRefresh = false, meta = null } = opts;
  const uid = userKey(authContext);
  const cacheScope = `attendance:${semesterId}`;

  // Check cache
  if (!forceRefresh) {
    const cached = cache.get(uid, cacheScope);
    if (cached) return cached;
  }

  // Get meta if not provided (need stynumber + semester details)
  const attendanceMeta = meta || (await fetchAttendanceMeta(relaySession, authContext));
  const semesterRow = attendanceMeta.semesters.find(
    (s) => String(s.registration_id) === String(semesterId)
  );

  if (!semesterRow) {
    return { studentattendancelist: [], message: 'Semester not found in meta' };
  }

  const stynumber = resolveStynumber(semesterRow, attendanceMeta);
  const client = new PortalClient(relaySession, authContext);

  // Fire attendance + subjects in parallel (like jiit does)
  const [attendanceData, subjectsData] = await Promise.all([
    client
      .post('/StudentPortalAPI/StudentClassAttendance/getstudentattendancedetail', {
        clientid: authContext.clientid,
        instituteid: authContext.instituteid,
        registrationcode: semesterRow.registration_code,
        registrationid: semesterRow.registration_id,
        stynumber: stynumber || '',
      })
      .catch((e) => {
        console.error('PORTAL API ERROR:', e.message);
        return { error: true };
      }),
    client
      .post('/StudentPortalAPI/reqsubfaculty/getfaculties', {
        instituteid: authContext.instituteid,
        studentid: authContext.memberid,
        registrationid: semesterRow.registration_id,
      })
      .catch((e) => {
        console.error('PORTAL API ERROR:', e.message);
        return { error: true };
      }),
  ]);

  const rawRows = attendanceData?.studentattendancelist || [];
  const studentattendancelist = rawRows.map(normalizeAttendanceRow).filter(Boolean);

  // Parse registered subjects
  const subjects = parseRegisteredSubjects(subjectsData);

  const result = { studentattendancelist, subjects };
  if (studentattendancelist.length) {
    cache.set(uid, cacheScope, result, ATTEND_CACHE_TTL_MS);
  }

  return result;
};

/**
 * Fetch per-class attendance for a specific subject.
 * Equivalent to jiit's get_subject_daily_attendance().
 *
 * Returns: { studentAttdsummarylist: [] }
 */
const fetchSubjectDailyAttendance = async (
  relaySession,
  authContext,
  semesterId,
  subjectCode,
  opts = {}
) => {
  const { forceRefresh = false, meta = null, attendanceRows = null } = opts;
  const uid = userKey(authContext);
  const cacheScope = `subject-daily:${semesterId}:${subjectCode}`;

  if (!forceRefresh) {
    const cached = cache.get(uid, cacheScope);
    if (cached) return cached;
  }

  const attendanceMeta = meta || (await fetchAttendanceMeta(relaySession, authContext));
  const semesterRow = attendanceMeta.semesters.find(
    (s) => String(s.registration_id) === String(semesterId)
  );
  if (!semesterRow) return { studentAttdsummarylist: [] };

  // Find the subject in attendance rows to get component IDs
  let rows = attendanceRows;
  if (!rows) {
    const attendResult = await fetchAttendance(relaySession, authContext, semesterId, {
      meta: attendanceMeta,
    });
    rows = attendResult.studentattendancelist;
  }

  const subjectRow = rows.find(
    (r) =>
      String(r.subjectcode || r.individualsubjectcode || '').trim() === String(subjectCode).trim()
  );
  if (!subjectRow) return { studentAttdsummarylist: [] };

  // Build component ID array (jiit: cmpidkey)
  const cmpidkey = (subjectRow.subjectcomponentids || [])
    .filter(Boolean)
    .map((id) => ({ subjectcomponentid: id }));

  if (!cmpidkey.length) {
    // Fallback: try all standard component fields
    const components = [];
    if (subjectRow.LsubjectComponentId)
      components.push({ subjectcomponentid: subjectRow.LsubjectComponentId });
    if (subjectRow.TsubjectComponentId)
      components.push({ subjectcomponentid: subjectRow.TsubjectComponentId });
    if (subjectRow.PsubjectComponentId)
      components.push({ subjectcomponentid: subjectRow.PsubjectComponentId });
    if (components.length) cmpidkey.push(...components);
  }

  if (!cmpidkey.length) return { studentAttdsummarylist: [] };

  const client = new PortalClient(relaySession, authContext);
  const data = await client
    .post('/StudentPortalAPI/StudentClassAttendance/getstudentsubjectpersentage', {
      cmpidkey,
      clientid: authContext.clientid,
      instituteid: authContext.instituteid,
      registrationcode: semesterRow.registration_code,
      registrationid: semesterRow.registration_id,
      subjectcode: subjectRow.individualsubjectcode || subjectCode,
      subjectid: subjectRow.subjectid,
    })
    .catch((e) => {
      console.error('PORTAL API ERROR:', e.message);
      return { error: true };
    });

  const result = {
    studentAttdsummarylist: data?.studentAttdsummarylist || [],
  };

  if (result.studentAttdsummarylist.length) {
    cache.set(uid, cacheScope, result, COUNTS_CACHE_TTL_MS);
  }

  return result;
};

/**
 * Compute attended/total counts from daily attendance rows.
 */
const computeCountsFromDaily = (dailyRows = []) => {
  let attended = 0;
  let total = 0;
  for (const row of dailyRows) {
    total += 1;
    const present = String(row.present || row.Present || '')
      .trim()
      .toLowerCase();
    if (present === 'present' || present === 'p' || present === '1') {
      attended += 1;
    }
  }
  return { attended, total };
};

/**
 * Parse registered subjects from the faculties endpoint response.
 */
const parseRegisteredSubjects = (data) => {
  if (!data) return { registered: [], faculties: [] };

  const subjects = data.registrations || data.subjects || data.subjectList || [];
  const registered = [];
  const faculties = [];

  if (Array.isArray(subjects)) {
    for (const item of subjects) {
      const code = item.subjectcode || item.subjectCode || item.subject_code || '';
      const name = item.subjectdesc || item.subjectdescription || code;
      const faculty = item.employeename || item.facultyname || item.faculty || '';
      if (code) {
        registered.push({ code, name });
        faculties.push({ code, faculty });
      }
    }
  }

  return { registered, faculties };
};

module.exports = {
  fetchAttendanceMeta,
  fetchAttendance,
  fetchSubjectDailyAttendance,
  computeCountsFromDaily,
  resolveStynumber,
  normalizeAttendanceRow,
  normalizeSemester,
};
