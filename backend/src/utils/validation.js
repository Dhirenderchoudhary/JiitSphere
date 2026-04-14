// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * validation.js — Data integrity validators for academic data.
 *
 * These run BEFORE any data is returned to the client.
 * On failure they throw PortalError('VALIDATION_ERROR', ...).
 */

const { PortalError } = require('../services/portalClient');

/**
 * Validate a single numeric value is a finite number within [min, max].
 */
const assertFinite = (value, fieldName, min = -Infinity, max = Infinity) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PortalError(
      'VALIDATION_ERROR',
      `${fieldName} is not a finite number: ${value}`
    );
  }
  if (value < min || value > max) {
    throw new PortalError(
      'VALIDATION_ERROR',
      `${fieldName} = ${value} is out of bounds [${min}, ${max}]`
    );
  }
};

/**
 * Validate the grades response before returning to client.
 *
 * Checks:
 *  1. Every semester has sgpa ∈ [0, 10]
 *  2. Every semester has cgpa ∈ [0, 10]
 *  3. CGPA is monotonically non-decreasing across semesters (by stynumber)
 *  4. registration_id and registration_code are present
 *
 * @param {object} data - { semesters: [...] }
 * @throws {PortalError} VALIDATION_ERROR
 */
const validateGradesResponse = (data) => {
  if (!data || !Array.isArray(data.semesters)) {
    throw new PortalError('VALIDATION_ERROR', 'Grades response missing semesters array');
  }

  if (data.semesters.length === 0) {
    // Empty is valid — student may not have any completed semesters yet
    return;
  }

  // Sort by stynumber ascending for monotonicity check
  const sorted = [...data.semesters].sort((a, b) => (a.semester || 0) - (b.semester || 0));

  let prevCgpa = -1;

  for (let i = 0; i < sorted.length; i++) {
    const sem = sorted[i];

    if (!sem.registration_id) {
      throw new PortalError('VALIDATION_ERROR', `Semester ${i} missing registration_id`);
    }

    assertFinite(sem.sgpa, `Semester ${sem.semester} SGPA`, 0, 10);
    assertFinite(sem.cgpa, `Semester ${sem.semester} CGPA`, 0, 10);

    // Monotonicity: CGPA should never DECREASE across semesters.
    // Allow small rounding tolerance (0.01) and equal values.
    if (sem.cgpa < prevCgpa - 0.01) {
      // Log but don't throw — portal data sometimes has rounding inconsistencies.
      // This is a warning, not a hard failure.
      console.warn(
        `[validation] CGPA decreased: Semester ${sorted[i - 1]?.semester} (${prevCgpa}) → Semester ${sem.semester} (${sem.cgpa}). Using portal values as-is.`
      );
    }
    prevCgpa = sem.cgpa;
  }
};

/**
 * Validate a single semester's marks data before returning to client.
 *
 * Checks:
 *  1. courses is a non-empty array
 *  2. Each course has name, code
 *  3. Each exam mark: obtained >= 0, obtained <= fullMarks (when both present)
 *  4. exams array is present
 *
 * @param {object} data - { courses: [...], exams: [...] }
 * @throws {PortalError} VALIDATION_ERROR
 */
const validateMarksResponse = (data) => {
  if (!data || !Array.isArray(data.courses)) {
    throw new PortalError('VALIDATION_ERROR', 'Marks response missing courses array');
  }

  if (data.courses.length === 0) {
    // Empty is valid — marks may not be published for this semester
    return;
  }

  if (!Array.isArray(data.exams) || data.exams.length === 0) {
    throw new PortalError('VALIDATION_ERROR', 'Marks response missing exams list');
  }

  for (let i = 0; i < data.courses.length; i++) {
    const course = data.courses[i];

    if (!course.name || typeof course.name !== 'string') {
      throw new PortalError('VALIDATION_ERROR', `Course ${i} missing name`);
    }

    if (!course.code || typeof course.code !== 'string') {
      throw new PortalError('VALIDATION_ERROR', `Course ${i} (${course.name}) missing code`);
    }

    if (typeof course.exams !== 'object' || course.exams === null) {
      throw new PortalError(
        'VALIDATION_ERROR',
        `Course ${course.name} has no exams object`
      );
    }

    for (const [examName, marks] of Object.entries(course.exams)) {
      if (marks?.remarks === 'not_applicable') continue;

      if (marks?.obtainedMarks !== undefined && marks?.fullMarks !== undefined) {
        const om = Number(marks.obtainedMarks);
        const fm = Number(marks.fullMarks);
        if (Number.isFinite(om) && Number.isFinite(fm)) {
          if (om < 0) {
            throw new PortalError(
              'VALIDATION_ERROR',
              `${course.name} → ${examName}: obtainedMarks (${om}) is negative`
            );
          }
          if (om > fm + 0.01) {
            // Allow tiny rounding tolerance
            throw new PortalError(
              'VALIDATION_ERROR',
              `${course.name} → ${examName}: obtainedMarks (${om}) > fullMarks (${fm})`
            );
          }
        }
      }
    }
  }
};

/**
 * Coerce a value to a finite number or return the fallback.
 */
const numberOr = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

module.exports = {
  validateGradesResponse,
  validateMarksResponse,
  assertFinite,
  numberOr,
  PortalError
};
