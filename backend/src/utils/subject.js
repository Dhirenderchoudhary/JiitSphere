/**
 * Centralized utility for subject name normalization and typo correction.
 */

const SUBJECT_TYPOS = {
  'MTHEMATICS-1': 'MATHEMATICS-1',
  'MTHEMATICS-2': 'MATHEMATICS-2',
  'UNIVERAL HUMAN VALUES': 'UNIVERSAL HUMAN VALUES',
  'UNIVERSTAL HUMAN VALUES': 'UNIVERSAL HUMAN VALUES',
  'ENVIRONMENTEL STUDIES': 'ENVIRONMENTAL STUDIES',
  'ENVIRONEMENTAL STUDIES': 'ENVIRONMENTAL STUDIES'
};

/**
 * Normalizes subject names by fixing known typos and applying standard formatting.
 *
 * @param {string} subject The raw subject name from S3 key or folder structure.
 * @returns {string} The normalized, upper-cased subject name.
 */
const normalizeSubject = (subject) => {
  if (!subject) return 'GENERAL';

  // 1. Remove course codes like (18B11EC315) at the end of the string
  // 2. Normalize case to UPPERCASE and trim whitespace
  let normalized = String(subject)
    .replace(/\s*\([\w\d]+\)\s*$/, '')
    .trim()
    .toUpperCase();

  // 3. Fix known typos using the SUBJECT_TYPOS map
  if (SUBJECT_TYPOS[normalized]) {
    normalized = SUBJECT_TYPOS[normalized];
  }

  return normalized || 'GENERAL';
};

module.exports = {
  SUBJECT_TYPOS,
  normalizeSubject
};
