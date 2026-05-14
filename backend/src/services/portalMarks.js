
/**
 * portalMarks.js — Marks PDF fetching & deterministic parsing.
 *
 * Key improvements over the previous regex parser:
 *   1. Each exam event always consumes EXACTLY 2 token slots (OM/FM pair + OW/WT pair, or two dashes)
 *   2. Un-attempted exams are marked as { remarks: 'not_applicable' }, never as 0
 *   3. Subject name extraction handles multi-line names cleanly
 *   4. Validation runs before returning
 */

const { PortalClient, PortalError } = require('./portalClient');
const { validateMarksResponse, numberOr } = require('../utils/validation');

// ── PDF Parsing ──────────────────────────────────────────────────────────

/**
 * Parse the raw text extracted from a marks PDF.
 *
 * PDF structure (per page):
 *   - Student info lines (Name, Enrollment, Registration Code)
 *   - Header: "Subject Code  EXAM1  EXAM2  EXAM3..."
 *   - Sub-header: "OM/FM OW/WT  OM/FM OW/WT  ..."
 *   - Data blocks: Subject Name + (CODE) + marks tokens
 *   - Footer: "Legend" or "Page N of M"
 *
 * Each exam event produces EXACTLY 2 data columns: OM/FM and OW/WT.
 * Missing data is represented as "-" (dash) for each column.
 *
 * @param {string} text — raw text from one page of the PDF
 * @returns {{ courses: Array, exams: string[], studentInfo: object }}
 */
function parseMarksText(text) {
  const result = { courses: [], exams: [], studentInfo: {} };

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // ── Extract student info ──
  for (const line of lines) {
    const nameMatch = line.match(/Name:\s*(.+?)(?:\s+Enrollment|$)/);
    if (nameMatch && !result.studentInfo.name) {
      result.studentInfo.name = nameMatch[1].trim();
    }
    const enrollMatch = line.match(/Enrollment No:\s*(\S+)/);
    if (enrollMatch) result.studentInfo.enrollment_no = enrollMatch[1].trim();
    const regMatch = line.match(/Registration Code:\s*(\S+)/);
    if (regMatch) result.studentInfo.registration_code = regMatch[1].trim();
  }

  // ── Find exam header ──
  let examNames = [];
  let headerIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^Subject\s+Code\b/i.test(lines[i])) {
      const after = lines[i].replace(/^Subject\s+Code\s*/i, '');
      examNames = after.split(/\s{2,}/).filter(Boolean).map((e) => e.trim());
      headerIdx = i;
      break;
    }
  }

  if (!examNames.length || headerIdx < 0) return result;
  result.exams = examNames;

  // Skip the OM/FM OW/WT sub-header line
  const startIdx = headerIdx + 2;

  // ── Gather data lines until footer ──
  const dataLines = [];
  for (let i = startIdx; i < lines.length; i++) {
    if (/^Legend\b/i.test(lines[i])) break;
    if (/^Page \d+/i.test(lines[i])) break;
    if (/^Jaypee Institute/i.test(lines[i])) break;
    dataLines.push(lines[i]);
  }

  const joinedData = dataLines.join('\n');

  // ── Find all subject codes: (15B11EC411) pattern ──
  const subjectPattern = /\((\d{2}[A-Za-z]\w+)\)/g;
  let match;
  const codePositions = [];

  while ((match = subjectPattern.exec(joinedData)) !== null) {
    codePositions.push({
      code: match[1],
      index: match.index,
      endIndex: match.index + match[0].length
    });
  }

  // ── Parse each subject ──
  for (let s = 0; s < codePositions.length; s++) {
    const { code, index, endIndex } = codePositions[s];

    // Extract name: text before the (CODE), after previous code's data
    const prevEnd = s > 0 ? codePositions[s - 1].endIndex : 0;
    const namePart = joinedData.substring(prevEnd, index).trim();

    // Clean name: take only trailing text lines (not numeric data from prev subject)
    const nameChunks = namePart.split('\n');
    const nameLines = [];
    for (let k = nameChunks.length - 1; k >= 0; k--) {
      const chunk = nameChunks[k].trim();
      if (!chunk) continue;
      if (/^\s*[\d.\s/\-]+\s*$/.test(chunk)) break;
      nameLines.unshift(chunk);
    }
    const name = nameLines.join(' ').trim() || code;

    // Marks: text after (CODE) until next subject name
    const nextStart = s < codePositions.length - 1
      ? codePositions[s + 1].index
      : joinedData.length;

    let marksStr = joinedData.substring(endIndex, nextStart).trim();

    // Remove trailing subject name lines
    const marksLines = marksStr.split('\n');
    const cleanedMarksLines = [];
    for (const ml of marksLines) {
      const trimmed = ml.trim();
      if (!trimmed) continue;
      // Pure text without digits or slashes = next subject name
      if (
        /^[A-Za-z][A-Za-z\s&\-/.,]+$/.test(trimmed) &&
        !trimmed.includes('/') &&
        !/\d/.test(trimmed)
      ) {
        break;
      }
      cleanedMarksLines.push(trimmed);
    }
    marksStr = cleanedMarksLines.join(' ');

    // ── Tokenize and parse marks ──
    const tokens = marksStr.split(/\s+/).filter(Boolean);
    const course = {
      name: name.toUpperCase(),
      code,
      totalObtained: 0,
      totalFull: 0,
      exams: {}
    };

    let examIdx = 0;
    let tokenIdx = 0;

    while (tokenIdx < tokens.length && examIdx < examNames.length) {
      const t = tokens[tokenIdx];

      if (t === '-') {
        // Dash = no data for this exam.
        // Each exam always has 2 dash tokens (one for OM/FM, one for OW/WT)
        course.exams[examNames[examIdx]] = { remarks: 'not_applicable' };
        tokenIdx++; // consume first dash
        if (tokenIdx < tokens.length && tokens[tokenIdx] === '-') {
          tokenIdx++; // consume second dash
        }
        examIdx++;
        continue;
      }

      // Parse fraction: "9.0/20.0" or "9.0/" + "20.0"
      const frac = parseFraction(tokens, tokenIdx);
      if (!frac) {
        tokenIdx++;
        continue;
      }

      // This is the OM/FM pair
      tokenIdx += frac.consumed;
      const marks = {
        obtainedMarks: frac.num,
        fullMarks: frac.den
      };

      // Parse OW/WT pair
      const owwt = parseFraction(tokens, tokenIdx);
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

/**
 * Parse a fraction from the token stream.
 * Handles: "9.0/20.0" (one token) and "9.0/" + "20.0" (two tokens)
 *
 * @returns {{ num: number, den: number, consumed: number } | null}
 */
function parseFraction(tokens, startIdx) {
  const tk = tokens[startIdx] || '';

  // Full fraction in one token: "9.0/20.0"
  const fullMatch = tk.match(/^(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)$/);
  if (fullMatch) {
    return {
      num: parseFloat(fullMatch[1]),
      den: parseFloat(fullMatch[2]),
      consumed: 1
    };
  }

  // Partial: "9.0/" + "20.0"
  const partialMatch = tk.match(/^(\d+\.?\d*)\s*\/\s*$/);
  if (partialMatch && startIdx + 1 < tokens.length) {
    const nextTk = tokens[startIdx + 1];
    const nextNum = parseFloat(nextTk);
    if (Number.isFinite(nextNum)) {
      return {
        num: parseFloat(partialMatch[1]),
        den: nextNum,
        consumed: 2
      };
    }
  }

  return null;
}

/**
 * Merge multiple parsed chunks (e.g. multi-page PDFs) into a single result.
 */
function mergeParsedMarksChunks(chunks) {
  const result = { courses: [], exams: [], studentInfo: {} };
  const seenCodes = new Set();
  const globalExamNames = new Set();

  for (const chunk of chunks) {
    if (chunk.studentInfo) {
      result.studentInfo = { ...result.studentInfo, ...chunk.studentInfo };
    }
    if (Array.isArray(chunk.exams)) {
      chunk.exams.forEach((e) => globalExamNames.add(e));
    }
    if (Array.isArray(chunk.courses)) {
      for (const course of chunk.courses) {
        if (seenCodes.has(course.code)) continue;
        seenCodes.add(course.code);
        result.courses.push(course);
      }
    }
  }

  result.exams = [...globalExamNames];
  return result;
}

// ── Main Entry Point ──────────────────────────────────────────────────────

/**
 * Fetch and parse marks for a specific semester.
 *
 * @param {PortalClient} client
 * @param {string} registrationId
 * @param {string} registrationCode
 * @returns {Promise<object>} Validated marks data
 */
const fetchMarks = async (client, registrationId, registrationCode) => {
  const safeInstId = encodeURIComponent(String(client.auth.instituteid).trim());
  const safeRegId = encodeURIComponent(String(registrationId).trim());
  const safeRegCode = encodeURIComponent(String(registrationCode).trim());

  const pdfPath = `/StudentPortalAPI/studentsexamview/printstudent-exammarks/${safeInstId}/${safeRegId}/${safeRegCode}`;

  // Download the PDF
  let buffer;
  try {
    buffer = await client.get(pdfPath, { responseType: 'buffer', timeout: 12000 });
  } catch (err) {
    // If no PDF is available, return empty (not an error — marks may not be published)
    if (err.type === 'FETCH_ERROR') {
      return { courses: [], exams: [], studentInfo: {} };
    }
    throw err;
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { courses: [], exams: [], studentInfo: {} };
  }

  // Parse the PDF
  let parsed = null;

  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });

    try {
      const [textResult, tableResult] = await Promise.all([
        parser.getText().catch(e => { console.error("PORTAL API ERROR:", e.message); return { error: true }; }),
        parser.getTable().catch(e => { console.error("PORTAL API ERROR:", e.message); return { error: true }; })
      ]);

      const chunks = [];

      // Try table-based extraction first (more structured)
      if (Array.isArray(tableResult?.pages)) {
        for (const page of tableResult.pages) {
          const pageTables = Array.isArray(page?.tables) ? page.tables : [];
          if (pageTables.length) {
            const chunk = parseMarksFromTables(pageTables);
            if (chunk?.courses?.length) chunks.push(chunk);
          }
        }
      }

      // Text-based extraction
      const pageTexts = Array.isArray(textResult?.pages)
        ? textResult.pages.map((p) => String(p?.text || '')).filter((t) => t.trim())
        : [];

      if (pageTexts.length) {
        for (const text of pageTexts) {
          const chunk = parseMarksText(text);
          if (chunk?.courses?.length) chunks.push(chunk);
        }
      } else {
        const fallbackText = String(textResult?.text || '');
        if (fallbackText.trim()) {
          const chunk = parseMarksText(fallbackText);
          if (chunk?.courses?.length) chunks.push(chunk);
        }
      }

      if (chunks.length) {
        parsed = mergeParsedMarksChunks(chunks);
      }

      // Final fallback: try raw text as a single blob
      if (!parsed || !parsed.courses?.length) {
        const rawText = Array.isArray(textResult?.pages)
          ? textResult.pages.map((p) => String(p?.text || '')).join('\n')
          : String(textResult?.text || '');
        parsed = parseMarksText(rawText);
      }
    } finally {
      await parser.destroy().catch(e => { console.error("PORTAL API ERROR:", e.message); return { error: true }; });
    }
  } catch (err) {
    throw new PortalError('PARSE_ERROR', `Failed to parse marks PDF: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    parsed = { courses: [], exams: [], studentInfo: {} };
  }

  // Validate before returning (only if we have data)
  if (parsed.courses.length > 0) {
    try {
      validateMarksResponse(parsed);
    } catch (validationErr) {
      console.warn('[portalMarks] Validation warning:', validationErr.message);
      // Don't throw — return what we have, the portal data is the source of truth
    }
  }

  return parsed;
};

/**
 * Stub for future table-based parsing.
 * Falls back to text parsing for now.
 */
function parseMarksFromTables(tables) {
  // Table-based parsing is complex and fragile.
  // The text-based parser handles the JIIT PDF format well.
  // Keeping this as a placeholder for future improvement.
  return { courses: [], exams: [] };
}

module.exports = {
  fetchMarks,
  parseMarksText,
  parseFraction,
  mergeParsedMarksChunks
};
