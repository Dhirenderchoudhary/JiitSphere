// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * portalGrades.js — SGPA/CGPA + grade card fetching & validation.
 *
 * Architecture:
 *   1.  SGPA/CGPA come EXCLUSIVELY from `getallsemesterdata` (the official API).
 *   2.  Grade cards (`showstudentgradecard`) provide per-subject details (grade, credits).
 *   3.  We NEVER derive SGPA from grade cards — that was the root cause of corruption.
 *
 *   get_sgpa_cgpa() and get_grade_card()
 */

const { PortalClient, PortalError } = require('./portalClient');
const { validateGradesResponse, numberOr } = require('../utils/validation');

const pickFirst = (row, keys = []) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
};

const normalizeSemesterToken = (value = '') =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// ── Semester sort helpers ─────────────────────────────────────────────────

const semesterSortScore = (code, id) => {
  const raw = String(code || id || '');
  const yearMatch = raw.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  const isOdd = /odd/i.test(raw);
  const isEven = /even|eve/i.test(raw);
  const termOffset = isOdd ? 0 : isEven ? 0.5 : 0.25;
  return year + termOffset;
};

const sortSemestersChronological = (semesters) =>
  [...semesters].sort(
    (a, b) =>
      semesterSortScore(a.registration_code, a.registration_id) -
      semesterSortScore(b.registration_code, b.registration_id)
  );

// ── Core Grade Fetching ───────────────────────────────────────────────────

/**
 * Fetch SGPA/CGPA data from the official portal API.
 *
 * Flow (exactly mirrors jiit):
 *   1. POST checkIfstudentmasterexist → get currentsemester (stynumber)
 *   2. POST getallsemesterdata        → get semesterList with sgpa/cgpa per semester
 *
 * @param {PortalClient} client
 * @returns {Promise<Array>} semesterList from the API
 */
const fetchOfficialSgpaCgpa = async (client) => {
  // Step 1: Get current semester number
  const masterCheck = await client.post(
    '/StudentPortalAPI/studentsgpacgpa/checkIfstudentmasterexist',
    {
      instituteid: client.auth.instituteid,
      studentid: client.auth.memberid,
      name: client.auth.name,
      enrollmentno: client.auth.enrollmentno
    }
  );

  const stynumber =
    masterCheck?.studentlov?.currentsemester ||
    masterCheck?.currentsemester;

  if (!stynumber) {
    throw new PortalError(
      'FETCH_ERROR',
      'Could not determine current semester number from checkIfstudentmasterexist'
    );
  }

  // Step 2: Get all semester SGPA/CGPA data
  const sgpaData = await client.post(
    '/StudentPortalAPI/studentsgpacgpa/getallsemesterdata',
    {
      instituteid: client.auth.instituteid,
      studentid: client.auth.memberid,
      stynumber
    }
  );

  // The response shape is: { semesterList: [...], semesterdata: [...] } or similar
  const semesterList =
    sgpaData?.semesterList ||
    sgpaData?.semesterdata ||
    sgpaData?.sgpacgpalist ||
    (Array.isArray(sgpaData) ? sgpaData : []);

  if (!Array.isArray(semesterList) || semesterList.length === 0) {
    throw new PortalError('FETCH_ERROR', 'getallsemesterdata returned empty semester list');
  }

  return semesterList;
};

/**
 * Fetch grade card semesters and per-semester grade cards.
 *
 * @param {PortalClient} client
 * @returns {Promise<{ semesters: Array, gradeCards: Object }>}
 */
const fetchGradeCards = async (client) => {
  // Step 1: Get student info (needed for programid, branchid)
  const studentInfo = await client.post(
    '/StudentPortalAPI/studentgradecard/getstudentinfo',
    { instituteid: client.auth.instituteid }
  ).catch(e => { console.error("PORTAL API ERROR:", e.message); return { error: true }; });

  if (!studentInfo?.programid) {
    return { semesters: [], gradeCards: {} };
  }

  // Step 2: Get semester registration list
  const regList = await client.post(
    '/StudentPortalAPI/studentgradecard/getregistrationList',
    { instituteid: client.auth.instituteid }
  ).catch(e => { console.error("PORTAL API ERROR:", e.message); return { error: true }; });

  const registrations = regList?.registrations || [];
  if (!registrations.length) {
    return { semesters: [], gradeCards: {} };
  }

  const semesters = registrations
    .map((r) => ({
      registration_id: r.registrationid || r.registration_id,
      registration_code: r.registrationcode || r.registration_code || r.registrationdesc
    }))
    .filter((s) => s.registration_id && s.registration_code);

  // Step 3: Fetch grade cards for all semesters in parallel
  const gradeCards = {};
  const results = await Promise.all(
    semesters.map((sem) =>
      client
        .post('/StudentPortalAPI/studentgradecard/showstudentgradecard', {
          instituteid: client.auth.instituteid,
          registrationid: sem.registration_id,
          branchid: studentInfo.branchid,
          programid: studentInfo.programid
        })
        .then((res) => ({ sem, gradecard: res?.gradecard || [] }))
        .catch(() => ({ sem, gradecard: [] }))
    )
  );

  for (const { sem, gradecard } of results) {
    if (Array.isArray(gradecard) && gradecard.length > 0) {
      gradeCards[sem.registration_id] = normalizeGradeCardSubjects(gradecard);
    }
  }

  return { semesters, gradeCards, studentInfo };
};

/**
 * Normalize raw grade card rows into clean subject objects.
 */
const normalizeGradeCardSubjects = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      subjectcode:
        row.subjectcode || row.individualsubjectcode || row.stsubjectcode || '',
      subjectdesc:
        row.subjectdesc || row.subjectname || row.subjectdescription || 'Subject',
      grade: row.grade || row.lettergrade || row.stgrade || '-',
      credits: numberOr(
        row.earnedcredit || row.coursecreditpoint || row.credit || row.credits,
        0
      ),
      gradepoint: numberOr(row.gradepoint || row.grpoint || row.stgradepoint, NaN),
      cgpapoints: numberOr(row.cgpapoints, 0)
    }))
    .filter((r) => r.subjectdesc && r.subjectdesc !== 'Subject');
};

// ── Main Entry Point ──────────────────────────────────────────────────────

/**
 * Fetch complete grades data: official SGPA/CGPA + per-semester subjects.
 *
 * This is the single source of truth for all grade-related data in the application.
 * SGPA and CGPA come ONLY from getallsemesterdata. Grade cards provide subjects.
 *
 * @param {PortalClient} client
 * @returns {Promise<object>} Validated grades response
 */
const fetchGrades = async (client) => {
  // Fetch SGPA/CGPA and grade cards in parallel
  const [officialSemesters, gradeCardData] = await Promise.all([
    fetchOfficialSgpaCgpa(client),
    fetchGradeCards(client)
  ]);

  // Build the normalized response
  const semesters = officialSemesters.map((sem) => {
    const stynumber = numberOr(sem.stynumber, 0);
    const sgpa = numberOr(sem.sgpa, 0);
    const cgpa = numberOr(sem.cgpa, 0);
    const earnedGradePoints = numberOr(sem.earnedgradepoints, 0);
    const totalCredits = numberOr(sem.totalcoursecredit, 0);

    // Find matching grade card data for this semester
    let regId = null;
    let regCode = null;
    let subjects = [];

    // Match by stynumber or registration_code
    for (const gcSem of gradeCardData.semesters || []) {
      // Check if this grade card semester matches this SGPA semester
      const gcScore = semesterSortScore(gcSem.registration_code, gcSem.registration_id);
      // Match by checking sort score proximity (same year+term)
      // Or try direct stynumber match if available
      const gcSubjects = gradeCardData.gradeCards[gcSem.registration_id];
      if (gcSubjects && gcSubjects.length > 0) {
        // The semesterList from getallsemesterdata is ordered by stynumber
        // The gradeCardData.semesters are ordered by registration date
        // We need to match them up
        const idx = officialSemesters.indexOf(sem);
        const gcIdx = gradeCardData.semesters.indexOf(gcSem);
        // Simplest heuristic: match by position in sorted order
        // Better: match by registration_id if present in both
        if (sem.registrationid && sem.registrationid === gcSem.registration_id) {
          regId = gcSem.registration_id;
          regCode = gcSem.registration_code;
          subjects = gcSubjects;
          break;
        }
      }
    }

    // If no match by registrationid, try positional matching
    if (!regId && gradeCardData.semesters?.length) {
      const sortedGc = sortSemestersChronological(gradeCardData.semesters);
      const sortedOff = [...officialSemesters].sort(
        (a, b) => numberOr(a.stynumber, 0) - numberOr(b.stynumber, 0)
      );
      const posIdx = sortedOff.indexOf(sem);
      if (posIdx >= 0 && posIdx < sortedGc.length) {
        const match = sortedGc[posIdx];
        regId = match.registration_id;
        regCode = match.registration_code;
        subjects = gradeCardData.gradeCards[match.registration_id] || [];
      }
    }

    return {
      semester: stynumber,
      registration_id: regId || sem.registrationid || String(stynumber),
      registration_code: regCode || sem.registrationcode || `Semester ${stynumber}`,
      sgpa,
      cgpa,
      earnedGradePoints,
      totalCredits,
      subjects: subjects.map((s) => ({
        name: s.subjectdesc,
        code: s.subjectcode,
        grade: s.grade,
        credits: s.credits,
        gradePoint: s.gradepoint
      }))
    };
  });

  const result = { semesters };

  // Validate before returning
  validateGradesResponse(result);

  return result;
};

/**
 * Quick SGPA/CGPA fetch for bootstrapDatasetFromPortal —
 * returns raw normalized rows that can be merged into the existing dataset shape.
 *
 * @param {PortalClient} client
 * @param {Array} knownSemesters — existing semester list for ID resolution
 * @returns {Promise<Array>} normalized grade summary rows
 */
const fetchOfficialGradeSummaries = async (client, knownSemesters = []) => {
  try {
    const semesterList = await fetchOfficialSgpaCgpa(client);
    return semesterList.map((sem) => {
      const stynumber = numberOr(
        pickFirst(sem, [
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
        ]),
        0
      );

      // Try to resolve registration_id from known semesters
      let regId = pickFirst(sem, ['registrationid', 'registration_id', 'registration', 'regid']);
      let regCode = pickFirst(sem, [
        'registrationcode',
        'registration_code',
        'registrationdesc',
        'semestercode',
        'semester_code',
        'semester',
        'semestername',
        'session',
        'term'
      ]);

      if (!regId && knownSemesters.length) {
        // Match by stynumber
        const match = knownSemesters.find(
          (ks) => numberOr(ks.stynumber, -1) === stynumber
        );
        if (match) {
          regId = match.registration_id;
          regCode = match.registration_code;
        }
      }

      if (!regId && regCode && knownSemesters.length) {
        const token = normalizeSemesterToken(regCode);
        const byCode = knownSemesters.find(
          (ks) => normalizeSemesterToken(ks?.registration_code) === token
        );
        if (byCode) {
          regId = byCode.registration_id;
          regCode = byCode.registration_code;
        }
      }

      const sgpa = numberOr(
        pickFirst(sem, [
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
        pickFirst(sem, [
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

      const credits = numberOr(
        pickFirst(sem, [
          'totalcoursecredit',
          'totalcredits',
          'credits',
          'credit',
          'earnedcredit',
          'coursecreditpoint'
        ]),
        0
      );

      const earnedPoints = numberOr(
        pickFirst(sem, [
          'earnedgradepoints',
          'earnedpoints',
          'totalgradepoints',
          'gradepoints',
          'creditpoints'
        ]),
        0
      );

      return {
        registration_id: regId || String(stynumber),
        registration_code: regCode || `Semester ${stynumber}`,
        stynumber,
        sgpa,
        cgpa,
        credits,
        earnedPoints
      };
    });
  } catch (err) {
    console.error('[portalGrades] fetchOfficialGradeSummaries failed:', err.message);
    return [];
  }
};

module.exports = {
  fetchGrades,
  fetchGradeCards,
  fetchOfficialSgpaCgpa,
  fetchOfficialGradeSummaries,
  normalizeGradeCardSubjects,
  semesterSortScore,
  sortSemestersChronological
};
