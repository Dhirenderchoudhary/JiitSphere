'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from 'components/ui/button';
import { fetchPortalGrades, downloadPortalMarks, SessionExpiredError } from 'lib/api';
import { cn } from 'lib/utils';
import { SHOW_TECHNICAL_DETAILS } from '../constants';
import {
  semesterSortScore,
  toFixedSafe,
  toDisplayNumber,
  toDisplayMarks,
  normalizeCsvCell,
} from '../utils';

const RATIO_RE = /(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/;

const parseNumberish = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value || '').trim();
  if (!text) return null;
  const cleaned = text.replace(/,/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const withUnit = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(marks?|pts?|points?)$/i);
  if (!withUnit) return null;

  const parsed = Number(withUnit[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRatioPair = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(RATIO_RE);
  if (!match) return null;

  const obtained = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0) return null;

  return {
    obtained: Math.max(0, Math.min(obtained, total)),
    total,
  };
};

const extractMarksPair = (row = {}) => {
  const directObtained = parseNumberish(row?.marksobtained);
  const directTotal = parseNumberish(row?.totalmarks);
  if (directTotal !== null && directTotal > 0) {
    return {
      obtained: directObtained !== null ? Math.max(0, Math.min(directObtained, directTotal)) : 0,
      total: directTotal,
    };
  }

  const directRatioCandidates = [
    row?.weightage,
    row?.score,
    row?.marks,
    row?.assessment,
    row?.assessmentdesc,
    row?.assessmentname,
  ];
  for (const candidate of directRatioCandidates) {
    const pair = parseRatioPair(candidate);
    if (pair) return pair;
  }

  const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {};

  for (const [key, value] of Object.entries(raw)) {
    if (!/(mark|score|weight|total|max|outof|obt|internal|external)/i.test(String(key))) continue;
    const pair = parseRatioPair(value);
    if (pair) return pair;
  }

  let obtained = null;
  let total = null;

  for (const [key, value] of Object.entries(raw)) {
    const keyText = String(key || '');
    if (/gradepoint|credit|cgpa|sgpa/i.test(keyText)) continue;
    const numeric = parseNumberish(value);
    if (numeric === null) continue;

    // Explicit JIIT-specific total fields (must NOT contain 'obt' / 'obtained' / 'scored')
    if (
      total === null &&
      /(weightagetotal|wttotal|totalweightage|maxweightage|totalmarks|maxmarks|maximummarks|outofmarks)/i.test(
        keyText
      )
    ) {
      total = numeric;
      continue;
    }

    // Explicit JIIT-specific obtained fields
    if (
      obtained === null &&
      /(weightageobtained|wtobtained|obtainedweightage|marksobtained|obtainedmarks|weightagescored)/i.test(
        keyText
      )
    ) {
      obtained = numeric;
      continue;
    }

    // General total (but NOT if key contains 'obt'/'obtained'/'scored')
    if (
      total === null &&
      /(total|max|outof|maximum|fullmark|totmark)/i.test(keyText) &&
      !/(obt|obtain|scored)/i.test(keyText)
    ) {
      total = numeric;
      continue;
    }

    // General obtained
    if (
      obtained === null &&
      /(obt|obtain|secured|earned|score|marksobt|weightageobt|wtobt|internalobt|externalobt)/i.test(
        keyText
      ) &&
      !/(total|max|outof|maximum)/i.test(keyText)
    ) {
      obtained = numeric;
    }
  }

  if (total !== null && total > 0) {
    const safeObtained = obtained !== null ? Math.max(0, Math.min(obtained, total)) : 0;
    return { obtained: safeObtained, total };
  }

  return { obtained: null, total: null };
};

const extractAssessmentLabel = (row = {}, index = 0) => {
  const direct = [
    row?.assessment,
    row?.assessmentname,
    row?.assessmentdesc,
    row?.examname,
    row?.testname,
    row?.component,
    row?.eventname,
    row?.headname,
  ]
    .map((item) => String(item || '').trim())
    .find(Boolean);

  if (direct) return direct;

  const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      !/(assessment|exam|test|component|head|paper|evaluation|mid|end|term|quiz|viva|lab|practical|sessional|internal|external)/i.test(
        String(key)
      )
    ) {
      continue;
    }

    const text = String(value || '').trim();
    if (!text) continue;
    if (RATIO_RE.test(text)) continue;
    if (parseNumberish(text) !== null && !/[a-z]/i.test(text)) continue;
    return text;
  }

  return `Assessment ${index + 1}`;
};

const finiteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatMarksValue = (value) => {
  const num = finiteNumber(value);
  if (num === null) return null;
  if (Math.abs(num - Math.round(num)) < 1e-6) return String(Math.round(num));
  return num.toFixed(1).replace(/\.0$/, '');
};

const compactAssessmentLabel = (value, index = 0) => {
  const text = String(value || '').trim();
  if (!text) return `T${index + 1}`;

  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  if (/\b(total|overall|aggregate|grand total)\b/.test(lower)) return 'Total';

  const numbered = lower.match(
    /\b(?:ta|t|test|term|assessment|sessional|minor|quiz|internal)\s*[-:]?\s*(\d+)\b/
  );
  if (numbered) return `T${numbered[1]}`;

  const shortT = lower.match(/^t\s*[-:]?\s*(\d+)$/);
  if (shortT) return `T${shortT[1]}`;

  if (/\b(mid\s*sem|midterm)\b/.test(lower)) return 'T2';
  if (/\b(end\s*sem|endterm|final)\b/.test(lower)) return 'T3';

  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 16) return cleaned.toUpperCase();
  return `T${index + 1}`;
};

const assessmentOrder = (label, fallbackIndex = 0) => {
  const upper = String(label || '').toUpperCase();
  if (upper === 'TOTAL') return 999;
  const tMatch = upper.match(/^T(\d+)$/);
  if (tMatch) return Number(tMatch[1]);
  return 100 + fallbackIndex;
};

const normalizeSemesterToken = (value = '') =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const extractSemesterNumber = (value) => {
  const text = String(value || '')
    .trim()
    .toUpperCase();
  if (!text) return null;

  const semMatch = text.match(/\bSEM(?:ESTER)?\s*[-:]?\s*(\d{1,2})\b/i);
  if (semMatch) {
    const num = Number(semMatch[1]);
    return Number.isFinite(num) && num > 0 && num < 50 ? num : null;
  }

  const plainMatch = text.match(/^(\d{1,2})$/);
  if (plainMatch) {
    const num = Number(plainMatch[1]);
    return Number.isFinite(num) && num > 0 && num < 50 ? num : null;
  }

  return null;
};

const semesterNumberFromRow = (row = {}) => {
  const directKeys = [
    'stynumber',
    'sty_number',
    'semesterno',
    'semester_no',
    'semester_number',
    'currentsemester',
    'semno',
    'sem',
  ];

  for (const key of directKeys) {
    const numeric = finiteNumber(row?.[key]);
    if (numeric !== null && numeric > 0 && numeric < 50) {
      return Math.round(numeric);
    }
  }

  return (
    extractSemesterNumber(row?.registration_code) ||
    extractSemesterNumber(row?.registration_id) ||
    extractSemesterNumber(row?.semester)
  );
};

export default function GradesView({ token, onExpired }) {
  const [semesters, setSemesters] = useState([]);
  const [grades, setGrades] = useState([]);
  const [gradeCards, setGradeCards] = useState({});
  const [message, setMessage] = useState('');
  const [selectedSem, setSelectedSem] = useState('');
  const [gradesMode, setGradesMode] = useState('overview');
  const [selectedGraphIndex, setSelectedGraphIndex] = useState(-1);
  const [downloadingMarks, setDownloadingMarks] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const applyGradesPayload = (payload) => {
      if (Array.isArray(payload)) {
        setGrades(payload);
        setGradeCards({});
        setSemesters([]);
        return;
      }

      const summaries = Array.isArray(payload?.summaries) ? payload.summaries : [];
      setGrades(summaries);
      setGradeCards(payload?.gradeCards || {});
      const sems = Array.isArray(payload?.semesters) ? payload.semesters : [];
      const sortedSems = [...sems].sort(
        (a, b) =>
          semesterSortScore(b?.registration_code, b?.registration_id) -
          semesterSortScore(a?.registration_code, a?.registration_id)
      );
      setSemesters(sortedSems);
      if (sortedSems.length) {
        const summaryById = new Set();
        const summaryByCode = new Set();
        const summaryBySemNo = new Set();
        for (const row of summaries) {
          if (!(Number(row?.sgpa || 0) > 0 || Number(row?.cgpa || 0) > 0)) continue;
          const semId = String(row?.registration_id || '').trim();
          if (semId) summaryById.add(semId);
          const codeToken = normalizeSemesterToken(row?.registration_code);
          if (codeToken) summaryByCode.add(codeToken);
          const semNo = semesterNumberFromRow(row);
          if (semNo) summaryBySemNo.add(semNo);
        }

        const preferredSemester = sortedSems.find((sem) => {
          const semId = String(sem?.registration_id || '').trim();
          if (semId && summaryById.has(semId)) return true;
          const codeToken = normalizeSemesterToken(sem?.registration_code);
          if (codeToken && summaryByCode.has(codeToken)) return true;
          const semNo = semesterNumberFromRow(sem);
          return semNo && summaryBySemNo.has(semNo);
        });

        setSelectedSem((current) => {
          if (
            current &&
            sortedSems.some((sem) => String(sem?.registration_id) === String(current))
          ) {
            return current;
          }
          return String((preferredSemester || sortedSems[0])?.registration_id || '');
        });
      }
    };

    const load = async () => {
      try {
        // Fast path: render cached/session dataset immediately.
        const fastResponse = await fetchPortalGrades(token, false);
        if (cancelled) return;
        applyGradesPayload(fastResponse?.data);
        setMessage('');

        // Background sync: refresh without blocking UI.
        fetchPortalGrades(token, true)
          .then((freshResponse) => {
            if (cancelled) return;
            applyGradesPayload(freshResponse?.data);
          })
          .catch(() => {
            // Keep rendered data; background refresh failures should not blank the UI.
          });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SessionExpiredError) {
          onExpired?.();
          return;
        }
        setMessage(err?.message || 'Unable to load grades');
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [token, onExpired]);

  const sortedSemesters = useMemo(() => {
    return [...semesters].sort((a, b) => {
      const scoreA = semesterSortScore(a?.registration_code, a?.registration_id);
      const scoreB = semesterSortScore(b?.registration_code, b?.registration_id);
      return scoreB - scoreA;
    });
  }, [semesters]);

  const sortedGrades = useMemo(() => {
    return [...grades].sort((a, b) => {
      const scoreA = semesterSortScore(a?.registration_code, a?.registration_id);
      const scoreB = semesterSortScore(b?.registration_code, b?.registration_id);
      return scoreB - scoreA;
    });
  }, [grades]);

  const gradeSummaryBySemester = useMemo(() => {
    const byId = {};
    const byCode = {};
    const bySemNo = {};

    for (const row of sortedGrades) {
      const semId = String(row?.registration_id || '').trim();
      if (semId) byId[semId] = row;

      const semCodeToken = normalizeSemesterToken(row?.registration_code);
      if (semCodeToken && !byCode[semCodeToken]) {
        byCode[semCodeToken] = row;
      }

      const semNo = semesterNumberFromRow(row);
      if (semNo && !bySemNo[semNo]) {
        bySemNo[semNo] = row;
      }
    }

    return { byId, byCode, bySemNo };
  }, [sortedGrades]);

  const gradeRowsBySemesterId = useMemo(() => {
    const semsAsc = [...sortedSemesters].reverse();
    const rowsAsc = [...sortedGrades].reverse();
    const bySemId = {};
    const usedRows = new Set();

    const resolveDirect = (sem) => {
      const semId = String(sem?.registration_id || '').trim();
      if (semId && gradeSummaryBySemester.byId[semId]) {
        return gradeSummaryBySemester.byId[semId];
      }

      const codeToken = normalizeSemesterToken(sem?.registration_code);
      if (codeToken && gradeSummaryBySemester.byCode[codeToken]) {
        return gradeSummaryBySemester.byCode[codeToken];
      }

      const semNo = semesterNumberFromRow(sem);
      if (semNo && gradeSummaryBySemester.bySemNo[semNo]) {
        return gradeSummaryBySemester.bySemNo[semNo];
      }

      return null;
    };

    for (const sem of semsAsc) {
      const semId = String(sem?.registration_id || '').trim();
      if (!semId) continue;

      const direct = resolveDirect(sem);
      if (!direct) continue;

      bySemId[semId] = direct;
      usedRows.add(direct);
    }

    const unresolved = semsAsc.filter((sem) => !bySemId[String(sem?.registration_id || '').trim()]);
    const remainingRows = rowsAsc.filter((row) => !usedRows.has(row));

    let cursor = 0;
    for (const sem of unresolved) {
      const semId = String(sem?.registration_id || '').trim();
      if (!semId) continue;

      const row = remainingRows[cursor];
      if (!row) break;
      bySemId[semId] = row;
      cursor += 1;
    }

    return bySemId;
  }, [sortedSemesters, sortedGrades, gradeSummaryBySemester]);

  const selectedSemester = useMemo(() => {
    return sortedSemesters.find((s) => String(s?.registration_id) === String(selectedSem)) || null;
  }, [sortedSemesters, selectedSem]);

  const gradeCardsSemesterKey = useMemo(() => {
    const directKey = String(selectedSem || '').trim();
    if (directKey && Array.isArray(gradeCards?.[directKey])) {
      return directKey;
    }

    const selectedToken = normalizeSemesterToken(selectedSemester?.registration_code);
    if (!selectedToken) return directKey;

    const matchedSem = sortedSemesters.find((sem) => {
      const semToken = normalizeSemesterToken(sem?.registration_code);
      if (!semToken || semToken !== selectedToken) return false;
      const semId = String(sem?.registration_id || '').trim();
      return semId && Array.isArray(gradeCards?.[semId]);
    });

    return matchedSem ? String(matchedSem.registration_id) : directKey;
  }, [selectedSem, selectedSemester, sortedSemesters, gradeCards]);

  useEffect(() => {
    if (!sortedSemesters.length) {
      setSelectedSem('');
      return;
    }
    if (!selectedSem) {
      setSelectedSem(String(sortedSemesters[0]?.registration_id || ''));
      return;
    }
    const stillExists = sortedSemesters.some(
      (s) => String(s.registration_id) === String(selectedSem)
    );
    if (!stillExists) setSelectedSem(String(sortedSemesters[0]?.registration_id || ''));
  }, [selectedSem, sortedSemesters]);

  const currentSummary = useMemo(() => {
    const selectedSemId = String(selectedSem || '').trim();
    const fromGrades = gradeRowsBySemesterId[selectedSemId] || null;

    if (fromGrades) {
      return {
        ...fromGrades,
        registration_id: selectedSemester?.registration_id || fromGrades.registration_id,
        registration_code: selectedSemester?.registration_code || fromGrades.registration_code,
      };
    }

    const fromSem = selectedSemester;
    if (fromSem)
      return {
        registration_id: fromSem.registration_id,
        registration_code: fromSem.registration_code,
        sgpa: 0,
        cgpa: 0,
      };

    const latestValidSummary = sortedGrades.find(
      (row) => Number(row?.sgpa || 0) > 0 || Number(row?.cgpa || 0) > 0
    );
    return latestValidSummary || sortedGrades[0] || null;
  }, [selectedSem, selectedSemester, sortedGrades, gradeRowsBySemesterId]);

  const latestValidSummary = useMemo(() => {
    return (
      sortedGrades.find((row) => Number(row?.sgpa || 0) > 0 || Number(row?.cgpa || 0) > 0) || null
    );
  }, [sortedGrades]);

  const visibleRows = useMemo(() => {
    return (gradeCards[gradeCardsSemesterKey] || []).map((row) => ({
      ...row,
      registration_code:
        selectedSemester?.registration_code || currentSummary?.registration_code || selectedSem,
      registration_id: gradeCardsSemesterKey || selectedSem,
    }));
  }, [gradeCards, selectedSem, gradeCardsSemesterKey, selectedSemester, currentSummary]);

  const groupedMarksRows = useMemo(() => {
    const groups = new Map();

    for (const row of visibleRows) {
      const subjectCode = String(row?.subjectcode || '').trim() || 'SUBJECT';
      const subjectDesc = String(row?.subjectdesc || '').trim() || subjectCode;
      const key = `${subjectCode}::${subjectDesc}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          subjectcode: subjectCode,
          subjectdesc: subjectDesc,
          credit: Number.isFinite(Number(row?.credit)) ? Number(row.credit) : 0,
          obtained: null,
          total: null,
          assessments: [],
        });
      }

      const group = groups.get(key);
      const creditRaw = Number(row?.credit);
      if (Number.isFinite(creditRaw) && creditRaw > 0) {
        group.credit = Math.max(group.credit, creditRaw);
      }
      const marksPair = extractMarksPair(row);
      const { obtained } = marksPair;
      const { total } = marksPair;

      if (total !== null && total > 0) {
        const safeObtained = obtained !== null ? Math.max(0, Math.min(obtained, total)) : 0;
        group.obtained = (group.obtained || 0) + safeObtained;
        group.total = (group.total || 0) + total;
      }

      const assessmentLabel = extractAssessmentLabel(row, group.assessments.length);

      group.assessments.push({
        label: assessmentLabel,
        obtained,
        total,
        order: Number.isFinite(Number(row?.assessmentorder))
          ? Number(row.assessmentorder)
          : Number.MAX_SAFE_INTEGER,
      });
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        assessments: [...group.assessments].sort(
          (a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label))
        ),
      }))
      .sort((a, b) => String(a.subjectdesc).localeCompare(String(b.subjectdesc)));
  }, [visibleRows]);

  const marksBySubjectKey = useMemo(() => {
    const byKey = {};
    for (const row of groupedMarksRows) {
      byKey[row.key] = row;
    }
    return byKey;
  }, [groupedMarksRows]);

  const semesterCredits = useMemo(() => {
    return groupedMarksRows.reduce((sum, row) => sum + Number(row?.credit || 0), 0);
  }, [groupedMarksRows]);

  const gradeColor = (grade) => {
    const g = String(grade || '')
      .trim()
      .toUpperCase();
    if (g === 'A+' || g === 'O') return 'text-emerald-400';
    if (g === 'A') return 'text-green-400';
    if (g === 'B+') return 'text-lime-400';
    if (g === 'B') return 'text-yellow-400';
    if (g === 'C+') return 'text-orange-400';
    if (g === 'C') return 'text-amber-500';
    if (g === 'D') return 'text-red-400';
    if (g === 'F' || g === 'X') return 'text-red-600';
    return 'text-muted-foreground';
  };

  const semesterGradeCards = useMemo(() => {
    const groups = new Map();

    for (const row of visibleRows) {
      const subjectCode = String(row?.subjectcode || '').trim() || 'SUBJECT';
      const subjectDesc = String(row?.subjectdesc || '').trim() || subjectCode;
      const key = `${subjectCode}::${subjectDesc}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          subjectcode: subjectCode,
          subjectdesc: subjectDesc,
          credit: 0,
          grade: '-',
          gradepoint: null,
        });
      }

      const group = groups.get(key);

      const creditRaw = Number(row?.credit);
      if (Number.isFinite(creditRaw) && creditRaw > 0) {
        group.credit = Math.max(group.credit, creditRaw);
      }

      if (group.grade === '-' && row?.grade && row.grade !== '-') {
        group.grade = row.grade;
      }

      if (group.gradepoint === null) {
        const gp = Number(row?.gradepoint);
        if (Number.isFinite(gp)) {
          group.gradepoint = gp;
        }
      }
    }

    return [...groups.values()].sort((a, b) =>
      String(a.subjectdesc).localeCompare(String(b.subjectdesc))
    );
  }, [visibleRows]);

  const semesterTotalCredits = useMemo(() => {
    return semesterGradeCards.reduce((sum, row) => sum + Number(row?.credit || 0), 0);
  }, [semesterGradeCards]);

  const displayedSemesterCredits = useMemo(() => {
    const summaryCredits = Number(currentSummary?.credits || 0);
    if (Number.isFinite(summaryCredits) && summaryCredits > 0) return summaryCredits;
    return semesterTotalCredits;
  }, [currentSummary, semesterTotalCredits]);

  const semesterSubjectCards = useMemo(() => {
    return semesterGradeCards.map((subject) => {
      const marksRow = marksBySubjectKey[subject.key] || null;
      const obtainedLabel = formatMarksValue(marksRow?.obtained);
      const totalLabel = formatMarksValue(marksRow?.total);
      const marksText = toDisplayMarks(obtainedLabel, totalLabel);
      const marksPercent =
        marksRow && Number(marksRow?.total || 0) > 0
          ? `${((Number(marksRow?.obtained || 0) * 100) / Number(marksRow.total)).toFixed(1)}%`
          : null;

      return {
        ...subject,
        marksText,
        marksPercent,
      };
    });
  }, [semesterGradeCards, marksBySubjectKey]);

  const graphRows = useMemo(() => {
    return [...sortedGrades]
      .filter((row) => Number(row?.sgpa || 0) > 0 || Number(row?.cgpa || 0) > 0)
      .reverse();
  }, [sortedGrades]);

  const overviewSemRows = useMemo(() => {
    return [...sortedSemesters]
      .reverse()
      .map((sem) => ({
        sem,
        gradeRow: gradeRowsBySemesterId[String(sem?.registration_id || '')] || {
          registration_id: sem?.registration_id,
          registration_code: sem?.registration_code,
          sgpa: 0,
          cgpa: 0,
          credits: 0,
          earnedPoints: 0,
        },
      }))
      .filter((item) => item.gradeRow);
  }, [sortedSemesters, gradeRowsBySemesterId]);

  useEffect(() => {
    if (!graphRows.length) {
      setSelectedGraphIndex(-1);
      return;
    }
    setSelectedGraphIndex((prev) =>
      prev >= 0 && prev < graphRows.length ? prev : graphRows.length - 1
    );
  }, [graphRows]);

  const graphSeries = useMemo(() => {
    if (!graphRows.length) return null;

    const width = 720;
    const height = 220;
    const padX = 36;
    const padY = 20;

    const values = graphRows.flatMap((row) => [Number(row.sgpa || 0), Number(row.cgpa || 0)]);
    const minVal = Math.min(...values, 0);
    const maxVal = Math.max(...values, 10);
    const yMin = Math.max(0, Math.floor((minVal - 0.2) * 10) / 10);
    const yMax = Math.min(10, Math.ceil((maxVal + 0.2) * 10) / 10);
    const range = Math.max(yMax - yMin, 0.5);

    const xAt = (index) => {
      if (graphRows.length === 1) return width / 2;
      return padX + (index * (width - padX * 2)) / (graphRows.length - 1);
    };
    const yAt = (value) => padY + ((yMax - value) * (height - padY * 2)) / range;

    const sgpaPoints = graphRows
      .map((row, idx) => `${xAt(idx)},${yAt(Number(row.sgpa || 0))}`)
      .join(' ');
    const cgpaPoints = graphRows
      .map((row, idx) => `${xAt(idx)},${yAt(Number(row.cgpa || 0))}`)
      .join(' ');

    return {
      width,
      height,
      padX,
      padY,
      yMin,
      yMax,
      sgpaPoints,
      cgpaPoints,
      xLabels: graphRows.map((row, idx) => row.registration_code || `S${idx + 1}`),
    };
  }, [graphRows]);

  const selectedGraphRow = selectedGraphIndex >= 0 ? graphRows[selectedGraphIndex] : null;

  const buildRowsForExport = () => {
    return (gradeCards[gradeCardsSemesterKey] || []).map((row) => {
      const pair = extractMarksPair(row);
      const hasObtained =
        row?.marksobtained !== null &&
        row?.marksobtained !== undefined &&
        String(row?.marksobtained).trim() !== '';
      const hasTotal =
        row?.totalmarks !== null &&
        row?.totalmarks !== undefined &&
        String(row?.totalmarks).trim() !== '';

      return {
        semester: currentSummary?.registration_code || selectedSem || 'Semester',
        ...row,
        assessment: row?.assessment || extractAssessmentLabel(row, 0),
        marksobtained: hasObtained ? row.marksobtained : pair.obtained,
        totalmarks: hasTotal ? row.totalmarks : pair.total,
      };
    });
  };

  const downloadMarksPdf = async () => {
    const rows = buildRowsForExport();
    if (!rows.length) return false;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    // eslint-disable-next-line new-cap -- jsPDF is the library's exported constructor name
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const heading = `JPortal Marks - ${currentSummary?.registration_code || selectedSem}`;
    doc.setFontSize(14);
    doc.text(heading, 40, 40);
    doc.setFontSize(10);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 40, 58);

    const body = rows.map((row) => [
      row.semester || '',
      row.subjectcode || '',
      row.subjectdesc || '',
      row.marksobtained ?? '-',
      row.totalmarks ?? '-',
      row.gradepoint ?? '-',
      row.grade || '-',
    ]);

    autoTable(doc, {
      startY: 70,
      head: [
        [
          'Semester',
          'Subject Code',
          'Subject',
          'Marks Obtained',
          'Total Marks',
          'Grade Point',
          'Grade',
        ],
      ],
      body,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 74, 108] },
    });

    const semPart = String(currentSummary?.registration_code || selectedSem || 'semester');
    doc.save(`marks-${semPart}.pdf`);
    return true;
  };

  const downloadGradesPdf = async () => {
    const rows = buildRowsForExport();
    if (!rows.length) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    // eslint-disable-next-line new-cap -- jsPDF is the library's exported constructor name
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const heading = `JPortal Grades - ${currentSummary?.registration_code || selectedSem}`;
    doc.setFontSize(14);
    doc.text(heading, 40, 40);
    doc.setFontSize(10);
    doc.text(
      `SGPA: ${toFixedSafe(currentSummary?.sgpa, 2)}   CGPA: ${toFixedSafe(currentSummary?.cgpa, 2)}`,
      40,
      58
    );
    doc.text(`Generated on ${new Date().toLocaleString()}`, 40, 74);

    const body = rows.map((row) => [
      row.subjectcode || '-',
      row.subjectdesc || '-',
      row.gradepoint ?? '-',
      row.grade || '-',
    ]);

    autoTable(doc, {
      startY: 86,
      head: [['Subject Code', 'Subject', 'Grade Point', 'Grade']],
      body,
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [15, 74, 108] },
    });

    const semPart = String(currentSummary?.registration_code || selectedSem || 'semester');
    doc.save(`grades-${semPart}.pdf`);
  };

  const downloadMarksCsv = () => {
    const rows = buildRowsForExport();

    if (!rows.length) return;

    const header = [
      'Semester',
      'Subject Code',
      'Subject',
      'Marks Obtained',
      'Total Marks',
      'Grade Point',
      'Grade',
    ];

    const csvLines = [
      header.join(','),
      ...rows.map((row) =>
        [
          row.semester,
          row.subjectcode || '',
          row.subjectdesc || '',
          row.marksobtained ?? '',
          row.totalmarks ?? '',
          row.gradepoint ?? '',
          row.grade || '',
        ]
          .map(normalizeCsvCell)
          .join(',')
      ),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const semPart = String(currentSummary?.registration_code || selectedSem || 'semester');
    link.href = url;
    link.download = `marks-${semPart}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPortalMarksPdf = async () => {
    if (!currentSummary) return;
    setDownloadingMarks(true);
    try {
      const portalRegistrationId = String(
        selectedSemester?.registration_id || currentSummary?.registration_id || ''
      ).trim();
      const portalRegistrationCode = String(
        selectedSemester?.registration_code || currentSummary?.registration_code || ''
      ).trim();

      if (!portalRegistrationId || !portalRegistrationCode) {
        throw new Error('Selected semester is missing portal registration details');
      }

      const blob = await downloadPortalMarks(token, portalRegistrationId, portalRegistrationCode);
      if (!blob || blob.size <= 0) {
        throw new Error('Portal returned an empty marks PDF');
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `marks_${portalRegistrationCode || selectedSem || 'semester'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      let fallbackDownloaded = false;
      try {
        fallbackDownloaded = await downloadMarksPdf();
      } catch (_fallbackErr) {
        fallbackDownloaded = false;
      }

      if (fallbackDownloaded) {
        setMessage(
          'Official portal PDF is unavailable right now. Downloaded generated marks PDF instead.'
        );
      } else {
        setMessage(err?.message || 'Failed to download marks PDF from portal');
      }
    } finally {
      setDownloadingMarks(false);
    }
  };

  return (
    <div className="space-y-3 pb-28 sm:pb-24">
      {!sortedSemesters.length && !sortedGrades.length ? (
        <p className="text-sm text-muted-foreground">
          {message || 'No direct grades data available.'}
        </p>
      ) : null}

      {sortedSemesters.length ? (
        <div className="flex rounded-xl bg-secondary/50 p-1">
          {['overview', 'semester'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                'flex-1 py-2 text-xs font-bold capitalize rounded-lg transition-all',
                gradesMode === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setGradesMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      ) : null}

      {sortedSemesters.length ? (
        <div className="rounded-2xl border border-border/40 bg-card p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Current Status</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold tracking-tight text-foreground">
                  {currentSummary?.registration_code || 'Semester'}
                </p>
                <span className="text-xs font-medium text-muted-foreground">
                  SGPA: {toFixedSafe(currentSummary?.sgpa, 2)}
                </span>
              </div>
            </div>
            <div className="rounded-xl border-2 border-primary/20 p-4 flex flex-col items-center justify-center bg-primary/5">
              <p className="text-xs font-medium text-primary/80">Cumulative CGPA</p>
              <p className="text-4xl font-black tracking-tight text-primary">
                {toFixedSafe(latestValidSummary?.cgpa ?? currentSummary?.cgpa, 2)}
              </p>
              {latestValidSummary?.registration_code ? (
                <p className="mt-1 text-[10px] font-medium text-primary/70">
                  As of {latestValidSummary.registration_code}
                </p>
              ) : null}
            </div>
          </div>

          {gradesMode === 'semester' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end border-t border-border/20 pt-6">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Select Semester
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="min-w-[200px] rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
                      value={selectedSem}
                      onChange={(e) => setSelectedSem(e.target.value)}
                    >
                      {sortedSemesters.map((s) => (
                        <option
                          key={s.registration_id || s.registration_code}
                          value={s.registration_id}
                        >
                          {s.registration_code || s.registration_id || 'Semester'}
                        </option>
                      ))}
                    </select>
                    <span className="rounded-xl border border-border/40 bg-secondary/20 px-3 py-2 text-xs font-bold text-foreground">
                      Total Credits: {toDisplayNumber(displayedSemesterCredits, 1)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    variant="default"
                    onClick={downloadPortalMarksPdf}
                    disabled={downloadingMarks || !currentSummary}
                    className="rounded-xl font-bold h-10 px-6"
                  >
                    <Download className="mr-2 h-4 w-4" />{' '}
                    {downloadingMarks ? 'Fetching...' : 'Marks PDF'}
                  </Button>
                </div>
              </div>

              {semesterSubjectCards.length ? (
                <div className="grid gap-3 sm:grid-cols-2 border-t border-border/20 pt-6">
                  {semesterSubjectCards.map((subject) => (
                    <div
                      key={subject.key}
                      className="rounded-xl border border-border/40 p-4 flex items-center justify-between gap-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-foreground leading-tight uppercase truncate">
                          {subject.subjectdesc}
                        </h4>
                        <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                          {subject.subjectcode}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-center">
                          <p
                            className={cn(
                              'text-xl font-black tracking-tight',
                              gradeColor(subject.grade)
                            )}
                          >
                            {subject.grade || '-'}
                          </p>
                          <p className="text-[9px] font-medium text-muted-foreground">Grade</p>
                        </div>
                        {subject.marksText &&
                          subject.marksText !== '-' &&
                          subject.marksText !== '0/0' && (
                            <div className="text-center">
                              <p className="text-sm font-black tracking-tight text-sky-300">
                                {subject.marksText}
                              </p>
                              <p className="text-[9px] font-medium text-muted-foreground">
                                {subject.marksPercent || 'Marks'}
                              </p>
                            </div>
                          )}
                        <div className="text-center">
                          <p className="text-xl font-black tracking-tight text-foreground">
                            {toDisplayNumber(subject.credit, 0)}
                          </p>
                          <p className="text-[9px] font-medium text-muted-foreground">Credits</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-6">
              {graphSeries ? (
                <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold text-foreground">Performance Trend</h4>
                    <div className="flex gap-4 text-[9px] font-bold text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <div className="size-2 rounded-sm bg-emerald-500" /> SGPA
                      </span>
                      <span className="flex items-center gap-1.5">
                        <div className="size-2 rounded-sm bg-primary" /> CGPA
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${graphSeries.width} ${graphSeries.height}`}
                      className="h-52 min-w-[640px] w-full"
                    >
                      <polyline
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeOpacity="0.1"
                        points={graphSeries.sgpaPoints}
                        className="text-emerald-500"
                      />
                      <polyline
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        points={graphSeries.cgpaPoints}
                        className="text-primary"
                      />
                      {graphRows.map((row, idx) => {
                        const x =
                          graphSeries.padX +
                          (idx * (graphSeries.width - graphSeries.padX * 2)) /
                            Math.max(graphRows.length - 1, 1);
                        const yC =
                          graphSeries.padY +
                          ((graphSeries.yMax - Number(row.cgpa || 0)) *
                            (graphSeries.height - graphSeries.padY * 2)) /
                            Math.max(graphSeries.yMax - graphSeries.yMin, 0.5);
                        const active = idx === selectedGraphIndex;
                        return (
                          <circle
                            key={`cgpa-${idx}`}
                            cx={x}
                            cy={yC}
                            r={active ? '6' : '4'}
                            fill="currentColor"
                            className={cn(
                              'text-primary cursor-pointer transition-all',
                              active ? 'ring-4 ring-primary/20' : ''
                            )}
                            onClick={() => setSelectedGraphIndex(idx)}
                          />
                        );
                      })}
                    </svg>
                  </div>
                  {selectedGraphRow && (
                    <div className="mt-4 border-t border-border/20 pt-4 flex justify-between items-center">
                      <span className="text-xs font-bold text-muted-foreground">
                        {selectedGraphRow.registration_code}
                      </span>
                      <div className="flex gap-4">
                        <span className="text-xs font-bold text-emerald-500">
                          SGPA: {toFixedSafe(selectedGraphRow.sgpa, 2)}
                        </span>
                        <span className="text-xs font-bold text-primary">
                          CGPA: {toFixedSafe(selectedGraphRow.cgpa, 2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {overviewSemRows.map(({ sem, gradeRow }, idx) => {
                  const ep = Number(gradeRow?.earnedPoints || 0);
                  const cr = Number(gradeRow?.credits || 0);
                  const hasGp = ep > 0 && cr > 0;
                  const semLabel =
                    String(sem?.registration_code || '').trim() || `Semester ${idx + 1}`;
                  return (
                    <div
                      key={sem.registration_id}
                      className="rounded-xl border border-border/40 p-4 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-sm font-bold text-foreground">{semLabel}</p>
                          {hasGp ? (
                            <p className="text-[10px] font-medium text-muted-foreground">
                              GP: {toFixedSafe(ep, 1)}/{toFixedSafe(cr * 10, 0)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div>
                          <span className="text-lg font-black text-emerald-500 tracking-tight">
                            {toFixedSafe(gradeRow.sgpa, 2)}
                          </span>
                          <span className="text-[9px] font-medium text-muted-foreground ml-1">
                            SGPA
                          </span>
                        </div>
                        <div>
                          <span className="text-lg font-black text-primary tracking-tight">
                            {toFixedSafe(gradeRow.cgpa, 2)}
                          </span>
                          <span className="text-[9px] font-medium text-muted-foreground ml-1">
                            CGPA
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
