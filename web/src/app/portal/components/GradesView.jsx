'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
  fetchPortalGrades,
  downloadPortalMarks,
  fetchPortalMarksData,
  fetchPortalMarksSemesters,
  SessionExpiredError
} from 'lib/api';
import { cn } from 'lib/utils';
import { SHOW_TECHNICAL_DETAILS } from '../constants';
import {
  semesterSortScore,
  toFixedSafe,
  toDisplayNumber,
  toDisplayMarks,
  normalizeCsvCell
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
    total
  };
};

const extractMarksPair = (row = {}) => {
  const directObtained = parseNumberish(row?.marksobtained);
  const directTotal = parseNumberish(row?.totalmarks);
  if (directTotal !== null && directTotal > 0) {
    return {
      obtained: directObtained !== null ? Math.max(0, Math.min(directObtained, directTotal)) : 0,
      total: directTotal
    };
  }

  const directRatioCandidates = [
    row?.weightage,
    row?.score,
    row?.marks,
    row?.assessment,
    row?.assessmentdesc,
    row?.assessmentname
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
      /(weightagetotal|wttotal|totalweightage|maxweightage|totalmarks|maxmarks|maximummarks|outofmarks)/i.test(keyText)
    ) {
      total = numeric;
      continue;
    }

    // Explicit JIIT-specific obtained fields
    if (
      obtained === null &&
      /(weightageobtained|wtobtained|obtainedweightage|marksobtained|obtainedmarks|weightagescored)/i.test(keyText)
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
      /(obt|obtain|secured|earned|score|marksobt|weightageobt|wtobt|internalobt|externalobt)/i.test(keyText) &&
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
    row?.headname
  ]
    .map((item) => String(item || '').trim())
    .find(Boolean);

  if (direct) return direct;

  const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/(assessment|exam|test|component|head|paper|evaluation|mid|end|term|quiz|viva|lab|practical|sessional|internal|external)/i.test(String(key))) {
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

  const numbered = lower.match(/\b(?:ta|t|test|term|assessment|sessional|minor|quiz|internal)\s*[-:]?\s*(\d+)\b/);
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

export default function GradesView({ token, onExpired }) {
  const [semesters, setSemesters] = useState([]);
  const [grades, setGrades] = useState([]);
  const [gradeCards, setGradeCards] = useState({});
  const [message, setMessage] = useState('');
  const [selectedSem, setSelectedSem] = useState('');
  const [gradesMode, setGradesMode] = useState('marks');
  const [selectedGraphIndex, setSelectedGraphIndex] = useState(-1);
  const [downloadingMarks, setDownloadingMarks] = useState(false);
  const [marksData, setMarksData] = useState({});
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSemesters, setMarksSemesters] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const applyGradesPayload = (payload) => {
      if (Array.isArray(payload)) {
        setGrades(payload);
        setGradeCards({});
        setSemesters([]);
        return;
      }

      setGrades(payload?.summaries || []);
      setGradeCards(payload?.gradeCards || {});
      const sems = payload?.semesters || [];
      setSemesters(sems);
      if (sems.length) {
        setSelectedSem((current) => {
          if (current && sems.some((sem) => String(sem?.registration_id) === String(current))) {
            return current;
          }
          return String(sems[0]?.registration_id || '');
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

    for (const row of sortedGrades) {
      const semId = String(row?.registration_id || '').trim();
      if (semId) byId[semId] = row;

      const semCodeToken = normalizeSemesterToken(row?.registration_code);
      if (semCodeToken && !byCode[semCodeToken]) {
        byCode[semCodeToken] = row;
      }
    }

    return { byId, byCode };
  }, [sortedGrades]);

  const eligibleSemesters = useMemo(() => {
    const filtered = sortedSemesters.filter((sem) => {
      const semId = String(sem?.registration_id || '');
      const semCodeToken = normalizeSemesterToken(sem?.registration_code);
      const summary = gradeSummaryBySemester.byId[semId] || gradeSummaryBySemester.byCode[semCodeToken];
      const hasSummary = Number(summary?.sgpa || 0) > 0 || Number(summary?.cgpa || 0) > 0;
      const hasGradePoints = Array.isArray(gradeCards?.[semId])
        && gradeCards[semId].some((row) => {
          const gp = Number(row?.gradepoint);
          return Number.isFinite(gp) && gp > 0;
        });

      return hasSummary || hasGradePoints;
    });

    return filtered.length ? filtered : sortedSemesters;
  }, [sortedSemesters, gradeSummaryBySemester, gradeCards]);

  const selectedSemester = useMemo(() => {
    return (
      sortedSemesters.find((s) => String(s?.registration_id) === String(selectedSem))
      || marksSemesters.find((s) => String(s?.registration_id) === String(selectedSem))
      || null
    );
  }, [sortedSemesters, marksSemesters, selectedSem]);

  const gradeCardsSemesterKey = useMemo(() => {
    const directKey = String(selectedSem || '').trim();
    if (directKey && Array.isArray(gradeCards?.[directKey])) {
      return directKey;
    }

    const selectedToken = normalizeSemesterToken(selectedSemester?.registration_code);
    if (!selectedToken) return directKey;

    const matchedSem = sortedSemesters.find((sem) => {
      const token = normalizeSemesterToken(sem?.registration_code);
      if (!token || token !== selectedToken) return false;
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
    const stillExists = sortedSemesters.some((s) => String(s.registration_id) === String(selectedSem));
    if (!stillExists) setSelectedSem(String(sortedSemesters[0]?.registration_id || ''));
  }, [selectedSem, sortedSemesters]);

  useEffect(() => {
    if (gradesMode === 'marks') return;
    if (!eligibleSemesters.length) return;

    const existsInEligible = eligibleSemesters.some((s) => String(s.registration_id) === String(selectedSem));
    if (!existsInEligible) {
      setSelectedSem(String(eligibleSemesters[0]?.registration_id || ''));
    }
  }, [gradesMode, selectedSem, eligibleSemesters]);

  const currentSummary = useMemo(() => {
    const selectedSemId = String(selectedSem || '').trim();
    const selectedSemCode = normalizeSemesterToken(selectedSemester?.registration_code);

    const fromGrades =
      gradeSummaryBySemester.byId[selectedSemId] ||
      (selectedSemCode ? gradeSummaryBySemester.byCode[selectedSemCode] : null);

    const latestValidSummary = sortedGrades.find(
      (row) => Number(row?.sgpa || 0) > 0 || Number(row?.cgpa || 0) > 0
    );

    if (fromGrades && (Number(fromGrades?.sgpa || 0) > 0 || Number(fromGrades?.cgpa || 0) > 0)) {
      return fromGrades;
    }
    if (latestValidSummary) return latestValidSummary;
    if (fromGrades) return fromGrades;
    const fromSem = selectedSemester;
    if (fromSem) return { registration_id: fromSem.registration_id, registration_code: fromSem.registration_code, sgpa: 0, cgpa: 0 };
    return sortedGrades[0] || null;
  }, [selectedSem, selectedSemester, sortedGrades, gradeSummaryBySemester]);

  const visibleRows = useMemo(() => {
    return (gradeCards[gradeCardsSemesterKey] || []).map((row) => ({
      ...row,
      registration_code: currentSummary?.registration_code || selectedSem,
      registration_id: gradeCardsSemesterKey || selectedSem
    }));
  }, [gradeCards, selectedSem, gradeCardsSemesterKey, currentSummary]);

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
          assessments: []
        });
      }

      const group = groups.get(key);
      const creditRaw = Number(row?.credit);
      if (Number.isFinite(creditRaw) && creditRaw > 0) {
        group.credit = Math.max(group.credit, creditRaw);
      }
      const marksPair = extractMarksPair(row);
      const obtained = marksPair.obtained;
      const total = marksPair.total;

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
        order: Number.isFinite(Number(row?.assessmentorder)) ? Number(row.assessmentorder) : Number.MAX_SAFE_INTEGER
      });
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        assessments: [...group.assessments].sort(
          (a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label))
        )
      }))
      .sort((a, b) => String(a.subjectdesc).localeCompare(String(b.subjectdesc)));
  }, [visibleRows]);

  const semesterCredits = useMemo(() => {
    return groupedMarksRows.reduce((sum, row) => sum + Number(row?.credit || 0), 0);
  }, [groupedMarksRows]);

  const gradeColor = (grade) => {
    const g = String(grade || '').trim().toUpperCase();
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
          gradepoint: null
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

  const graphRows = useMemo(() => {
    return [...sortedGrades]
      .filter((row) => Number(row?.sgpa || 0) > 0 || Number(row?.cgpa || 0) > 0)
      .reverse();
  }, [sortedGrades]);

  const overviewSemRows = useMemo(() => {
    return [...eligibleSemesters].reverse()
      .map((sem) => ({
        sem,
        gradeRow:
          gradeSummaryBySemester.byId[String(sem?.registration_id || '')] ||
          gradeSummaryBySemester.byCode[normalizeSemesterToken(sem?.registration_code)] ||
          null
      }))
      .filter((item) => item.gradeRow && (Number(item.gradeRow?.sgpa || 0) > 0 || Number(item.gradeRow?.cgpa || 0) > 0));
  }, [eligibleSemesters, gradeSummaryBySemester]);

  useEffect(() => {
    if (!graphRows.length) {
      setSelectedGraphIndex(-1);
      return;
    }
    setSelectedGraphIndex((prev) => (prev >= 0 && prev < graphRows.length ? prev : graphRows.length - 1));
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

    const sgpaPoints = graphRows.map((row, idx) => `${xAt(idx)},${yAt(Number(row.sgpa || 0))}`).join(' ');
    const cgpaPoints = graphRows.map((row, idx) => `${xAt(idx)},${yAt(Number(row.cgpa || 0))}`).join(' ');

    return {
      width,
      height,
      padX,
      padY,
      yMin,
      yMax,
      sgpaPoints,
      cgpaPoints,
      xLabels: graphRows.map((row, idx) => row.registration_code || `S${idx + 1}`)
    };
  }, [graphRows]);

  const selectedGraphRow = selectedGraphIndex >= 0 ? graphRows[selectedGraphIndex] : null;

  const buildRowsForExport = () => {
    return (gradeCards[gradeCardsSemesterKey] || []).map((row) => {
      const pair = extractMarksPair(row);
      const hasObtained = row?.marksobtained !== null && row?.marksobtained !== undefined && String(row?.marksobtained).trim() !== '';
      const hasTotal = row?.totalmarks !== null && row?.totalmarks !== undefined && String(row?.totalmarks).trim() !== '';

      return {
        semester: currentSummary?.registration_code || selectedSem || 'Semester',
        ...row,
        assessment: row?.assessment || extractAssessmentLabel(row, 0),
        marksobtained: hasObtained ? row.marksobtained : pair.obtained,
        totalmarks: hasTotal ? row.totalmarks : pair.total
      };
    });
  };

  const downloadMarksPdf = async () => {
    const rows = buildRowsForExport();
    if (!rows.length) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const heading = `JPortal Marks - ${currentSummary?.registration_code || selectedSem}`;
    doc.setFontSize(14);
    doc.text(heading, 40, 40);
    doc.setFontSize(10);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 40, 58);

    const body = rows.map((row) => ([
      row.semester || '',
      row.subjectcode || '',
      row.subjectdesc || '',
      row.marksobtained ?? '-',
      row.totalmarks ?? '-',
      row.gradepoint ?? '-',
      row.grade || '-'
    ]));

    autoTable(doc, {
      startY: 70,
      head: [['Semester', 'Subject Code', 'Subject', 'Marks Obtained', 'Total Marks', 'Grade Point', 'Grade']],
      body,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 74, 108] }
    });

    const semPart = String(currentSummary?.registration_code || selectedSem || 'semester');
    doc.save(`marks-${semPart}.pdf`);
  };

  const downloadGradesPdf = async () => {
    const rows = buildRowsForExport();
    if (!rows.length) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const heading = `JPortal Grades - ${currentSummary?.registration_code || selectedSem}`;
    doc.setFontSize(14);
    doc.text(heading, 40, 40);
    doc.setFontSize(10);
    doc.text(`SGPA: ${toFixedSafe(currentSummary?.sgpa, 2)}   CGPA: ${toFixedSafe(currentSummary?.cgpa, 2)}`, 40, 58);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 40, 74);

    const body = rows.map((row) => ([
      row.subjectcode || '-',
      row.subjectdesc || '-',
      row.gradepoint ?? '-',
      row.grade || '-'
    ]));

    autoTable(doc, {
      startY: 86,
      head: [['Subject Code', 'Subject', 'Grade Point', 'Grade']],
      body,
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [15, 74, 108] }
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
      'Grade'
    ];

    const csvLines = [
      header.join(','),
      ...rows.map((row) => ([
        row.semester,
        row.subjectcode || '',
        row.subjectdesc || '',
        row.marksobtained ?? '',
        row.totalmarks ?? '',
        row.gradepoint ?? '',
        row.grade || ''
      ]
        .map(normalizeCsvCell)
        .join(',')))
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
      const blob = await downloadPortalMarks(token, currentSummary.registration_id, currentSummary.registration_code);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `marks_${currentSummary.registration_code || selectedSem || 'semester'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(err?.message || 'Failed to download marks PDF from portal');
    } finally {
      setDownloadingMarks(false);
    }
  };

  return (
    <div className="space-y-3 pb-28 sm:pb-24">
      {!sortedSemesters.length && !sortedGrades.length ? <p className="text-sm text-muted-foreground">{message || 'No direct grades data available.'}</p> : null}

      {sortedSemesters.length ? (
        <div className="flex rounded-xl bg-secondary/50 p-1">
          {['overview', 'semester', 'marks'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "flex-1 py-2 text-xs font-bold capitalize rounded-lg transition-all",
                gradesMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setGradesMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      ) : null}

      {eligibleSemesters.length && gradesMode !== 'marks' ? (
        <div className="rounded-2xl border border-border/40 bg-card p-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Current Status</p>
                <div className="flex items-baseline gap-2">
                   <p className="text-xl font-bold tracking-tight text-foreground">{currentSummary?.registration_code || 'Semester'}</p>
                   <span className="text-xs font-medium text-muted-foreground">SGPA: {toFixedSafe(currentSummary?.sgpa, 2)}</span>
                </div>
              </div>
              <div className="rounded-xl border-2 border-primary/20 p-4 flex flex-col items-center justify-center bg-primary/5">
                <p className="text-xs font-medium text-primary/80">Cumulative CGPA</p>
                <p className="text-4xl font-black tracking-tight text-primary">{toFixedSafe(currentSummary?.cgpa, 2)}</p>
              </div>
            </div>

            {gradesMode === 'semester' ? (
              <>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end border-t border-border/20 pt-6">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">Select Semester</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="min-w-[200px] rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
                      value={selectedSem}
                      onChange={(e) => setSelectedSem(e.target.value)}
                    >
                      {eligibleSemesters.map((s) => (
                        <option key={s.registration_id || s.registration_code} value={s.registration_id}>
                          {s.registration_code || s.registration_id || 'Semester'}
                        </option>
                      ))}
                    </select>
                    <span className="rounded-xl border border-border/40 bg-secondary/20 px-3 py-2 text-xs font-bold text-foreground">
                      Total Credits: {toDisplayNumber(semesterTotalCredits, 1)}
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
                    <Download className="mr-2 h-4 w-4" /> {downloadingMarks ? 'Fetching...' : 'Portal PDF'}
                  </Button>
                </div>
              </div>

              {semesterGradeCards.length ? (
                <div className="grid gap-3 sm:grid-cols-2 border-t border-border/20 pt-6">
                  {semesterGradeCards.map((subject) => (
                    <div
                      key={subject.key}
                      className="rounded-xl border border-border/40 p-4 flex items-center justify-between gap-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-foreground leading-tight uppercase truncate">
                          {subject.subjectdesc}
                        </h4>
                        <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{subject.subjectcode}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-center">
                          <p className={cn('text-xl font-black tracking-tight', gradeColor(subject.grade))}>
                            {subject.grade || '-'}
                          </p>
                          <p className="text-[9px] font-medium text-muted-foreground">Grade</p>
                        </div>
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
                          <span className="flex items-center gap-1.5"><div className="size-2 rounded-sm bg-emerald-500" /> SGPA</span>
                          <span className="flex items-center gap-1.5"><div className="size-2 rounded-sm bg-primary" /> CGPA</span>
                       </div>
                    </div>
                    <div className="overflow-x-auto">
                      <svg viewBox={`0 0 ${graphSeries.width} ${graphSeries.height}`} className="h-52 min-w-[640px] w-full">
                        <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.1" points={graphSeries.sgpaPoints} className="text-emerald-500" />
                        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={graphSeries.cgpaPoints} className="text-primary" />
                        {graphRows.map((row, idx) => {
                          const x = graphSeries.padX + (idx * (graphSeries.width - graphSeries.padX * 2)) / Math.max(graphRows.length - 1, 1);
                          const yC = graphSeries.padY + ((graphSeries.yMax - Number(row.cgpa || 0)) * (graphSeries.height - graphSeries.padY * 2)) / Math.max(graphSeries.yMax - graphSeries.yMin, 0.5);
                          const active = idx === selectedGraphIndex;
                          return (
                            <circle key={`cgpa-${idx}`} cx={x} cy={yC} r={active ? "6" : "4"} fill="currentColor" className={cn("text-primary cursor-pointer transition-all", active ? "ring-4 ring-primary/20" : "")} onClick={() => setSelectedGraphIndex(idx)} />
                          );
                        })}
                      </svg>
                    </div>
                    {selectedGraphRow && (
                      <div className="mt-4 border-t border-border/20 pt-4 flex justify-between items-center">
                         <span className="text-xs font-bold text-muted-foreground">{selectedGraphRow.registration_code}</span>
                         <div className="flex gap-4">
                            <span className="text-xs font-bold text-emerald-500">SGPA: {toFixedSafe(selectedGraphRow.sgpa, 2)}</span>
                            <span className="text-xs font-bold text-primary">CGPA: {toFixedSafe(selectedGraphRow.cgpa, 2)}</span>
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
                    const semLabel = `Semester ${idx + 1}`;
                    return (
                      <div key={sem.registration_id} className="rounded-xl border border-border/40 p-4 hover:border-primary/30 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-sm font-bold text-foreground">{semLabel}</p>
                            {hasGp ? (
                              <p className="text-[10px] font-medium text-muted-foreground">GP: {toFixedSafe(ep, 1)}/{toFixedSafe(cr * 10, 0)}</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <div>
                            <span className="text-lg font-black text-emerald-500 tracking-tight">{toFixedSafe(gradeRow.sgpa, 2)}</span>
                            <span className="text-[9px] font-medium text-muted-foreground ml-1">SGPA</span>
                          </div>
                          <div>
                            <span className="text-lg font-black text-primary tracking-tight">{toFixedSafe(gradeRow.cgpa, 2)}</span>
                            <span className="text-[9px] font-medium text-muted-foreground ml-1">CGPA</span>
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

      <MarksTab
        gradesMode={gradesMode}
        marksSemesters={marksSemesters}
        setMarksSemesters={setMarksSemesters}
        fallbackSemesters={sortedSemesters}
        selectedSem={selectedSem}
        setSelectedSem={setSelectedSem}
        currentSummary={currentSummary}
        token={token}
        marksData={marksData}
        setMarksData={setMarksData}
        marksLoading={marksLoading}
        setMarksLoading={setMarksLoading}
        fallbackGroupedMarks={groupedMarksRows}
        downloadPortalMarksPdf={downloadPortalMarksPdf}
        downloadingMarks={downloadingMarks}
      />
    </div>
  );
}

function MarksTab({
  gradesMode,
  marksSemesters,
  setMarksSemesters,
  fallbackSemesters,
  selectedSem,
  setSelectedSem,
  currentSummary,
  token,
  marksData,
  setMarksData,
  marksLoading,
  setMarksLoading,
  fallbackGroupedMarks,
  downloadPortalMarksPdf,
  downloadingMarks
}) {
  const semesterOptions = useMemo(() => {
    if (Array.isArray(marksSemesters) && marksSemesters.length) return marksSemesters;
    return Array.isArray(fallbackSemesters) ? fallbackSemesters : [];
  }, [marksSemesters, fallbackSemesters]);

  const selectedMarksSemester = useMemo(() => {
    return semesterOptions.find((sem) => String(sem?.registration_id) === String(selectedSem)) || null;
  }, [semesterOptions, selectedSem]);

  const effectiveSemester = selectedMarksSemester || currentSummary || null;

  useEffect(() => {
    if (gradesMode !== 'marks' || (Array.isArray(marksSemesters) && marksSemesters.length)) return;

    let cancelled = false;
    fetchPortalMarksSemesters(token, false)
      .then((rows) => {
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length) {
          setMarksSemesters(rows);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [gradesMode, marksSemesters, token, setMarksSemesters]);

  useEffect(() => {
    if (gradesMode !== 'marks' || !semesterOptions.length) return;
    const exists = semesterOptions.some((s) => String(s?.registration_id) === String(selectedSem));
    if (!exists) {
      setSelectedSem(String(semesterOptions[0]?.registration_id || ''));
    }
  }, [gradesMode, semesterOptions, selectedSem, setSelectedSem]);

  // Fetch marks data when semester changes and marks tab is active
  useEffect(() => {
    if (gradesMode !== 'marks' || !effectiveSemester?.registration_id || !effectiveSemester?.registration_code) return;

    const cacheKey = `${effectiveSemester.registration_id}_${effectiveSemester.registration_code}`;
    if (marksData[cacheKey]) {
      let cancelled = false;
      setMarksLoading(true);

      fetchPortalMarksData(token, effectiveSemester.registration_id, effectiveSemester.registration_code, true)
        .then((freshData) => {
          if (cancelled) return;
          setMarksData((prev) => ({ ...prev, [cacheKey]: freshData }));
        })
        .catch(() => {
          // Keep existing cached view when background refresh fails.
        })
        .finally(() => {
          if (!cancelled) setMarksLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setMarksLoading(true);

    fetchPortalMarksData(token, effectiveSemester.registration_id, effectiveSemester.registration_code, false)
      .then((cachedData) => {
        if (cancelled) return;
        setMarksData((prev) => ({ ...prev, [cacheKey]: cachedData }));

        // Re-parse on backend in background to replace stale/incomplete cached data.
        fetchPortalMarksData(token, effectiveSemester.registration_id, effectiveSemester.registration_code, true)
          .then((freshData) => {
            if (cancelled) return;
            setMarksData((prev) => ({ ...prev, [cacheKey]: freshData }));
          })
          .catch(() => {
            // Keep cached payload rendered if refresh fails.
          })
          .finally(() => {
            if (!cancelled) setMarksLoading(false);
          });
      })
      .catch((err) => {
        console.error('Failed to fetch marks data:', err);
        if (!cancelled) {
          setMarksData((prev) => ({ ...prev, [cacheKey]: { courses: [], exams: [], error: err.message } }));
          setMarksLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [
    gradesMode,
    effectiveSemester?.registration_id,
    effectiveSemester?.registration_code,
    token,
    marksData,
    setMarksData,
    setMarksLoading
  ]);

  if (gradesMode !== 'marks' || !semesterOptions.length) return null;

  const cacheKey = effectiveSemester ? `${effectiveSemester.registration_id}_${effectiveSemester.registration_code}` : '';
  const currentMarks = marksData[cacheKey] || null;
  const parsedCourses = Array.isArray(currentMarks?.courses) ? currentMarks.courses : [];

  const normalizeSubjectToken = (value) =>
    String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

  const courseMergeKey = (course = {}) => {
    const codeToken = normalizeSubjectToken(course?.code || course?.subjectcode);
    if (codeToken) return `C:${codeToken}`;
    const nameToken = normalizeSubjectToken(course?.name || course?.subjectdesc);
    if (nameToken) return `N:${nameToken}`;
    return '';
  };

  const fallbackCourses = Array.isArray(fallbackGroupedMarks)
    ? fallbackGroupedMarks.map((row, idx) => {
        const exams = {};
        const assessments = Array.isArray(row?.assessments) ? row.assessments : [];

        assessments.forEach((assessment, aIdx) => {
          const label = compactAssessmentLabel(assessment?.label, aIdx);
          if (!label) return;
          exams[label] = {
            obtainedWeightage: finiteNumber(assessment?.obtained),
            totalWeightage: finiteNumber(assessment?.total)
          };
        });

        return {
          name: row?.subjectdesc || row?.subjectcode || `Subject ${idx + 1}`,
          code: row?.subjectcode || '',
          totalObtained: finiteNumber(row?.obtained),
          totalFull: finiteNumber(row?.total),
          exams
        };
      })
    : [];

  const courseMap = new Map();
  const mergeExamEntry = (base = {}, incoming = {}) => {
    const merged = { ...base };
    ['obtainedWeightage', 'totalWeightage', 'obtainedMarks', 'fullMarks'].forEach((key) => {
      const currentValue = finiteNumber(merged[key]);
      if (currentValue !== null) return;
      const incomingValue = finiteNumber(incoming[key]);
      if (incomingValue !== null) merged[key] = incomingValue;
    });
    return merged;
  };

  const mergeCourse = (course, index) => {
    const key = courseMergeKey(course) || `X:${index}`;
    const incoming = {
      name: String(course?.name || course?.subjectdesc || '').trim() || `Subject ${index + 1}`,
      code: String(course?.code || course?.subjectcode || '').trim(),
      totalObtained: finiteNumber(course?.totalObtained),
      totalFull: finiteNumber(course?.totalFull),
      exams: { ...(course?.exams && typeof course.exams === 'object' ? course.exams : {}) }
    };

    if (!courseMap.has(key)) {
      courseMap.set(key, incoming);
      return;
    }

    const existing = courseMap.get(key);
    existing.name = existing.name || incoming.name;
    existing.code = existing.code || incoming.code;

    if (finiteNumber(existing.totalFull) === null && finiteNumber(incoming.totalFull) !== null) {
      existing.totalFull = incoming.totalFull;
    }
    if (finiteNumber(existing.totalObtained) === null && finiteNumber(incoming.totalObtained) !== null) {
      existing.totalObtained = incoming.totalObtained;
    }

    const examNames = new Set([
      ...Object.keys(existing.exams || {}),
      ...Object.keys(incoming.exams || {})
    ]);

    const mergedExams = {};
    examNames.forEach((examName) => {
      mergedExams[examName] = mergeExamEntry(existing.exams?.[examName], incoming.exams?.[examName]);
    });

    existing.exams = mergedExams;
  };

  parsedCourses.forEach((course, idx) => mergeCourse(course, idx));
  fallbackCourses.forEach((course, idx) => mergeCourse(course, parsedCourses.length + idx));

  const courses = [...courseMap.values()].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''))
  );

  // Color for progress bars based on percentage
  const barColor = (pct) => {
    if (pct >= 75) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    if (pct >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          className="min-w-[200px] rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
          value={selectedSem}
          onChange={(e) => setSelectedSem(e.target.value)}
        >
          {semesterOptions.map((s) => (
            <option key={s.registration_id} value={s.registration_id}>{s.registration_code}</option>
          ))}
        </select>
      </div>

      {marksLoading && !courses.length ? (
        <div className="rounded-2xl border border-border/40 bg-card p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading marks from portal PDF...</p>
        </div>
      ) : currentMarks?.error && !courses.length ? (
        <div className="rounded-2xl border border-border/40 bg-card p-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">Marks data is not available yet</p>
          <p className="text-xs text-muted-foreground/60">Please check back later</p>
        </div>
      ) : courses.length ? (
        <div className="space-y-3">
          {marksLoading ? (
            <p className="text-xs font-medium text-muted-foreground">Refreshing marks in background...</p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
          {courses.map((course, idx) => {
            const examMap = new Map();

            Object.entries(course?.exams || {}).forEach(([examName, marks], examIndex) => {
              const label = compactAssessmentLabel(examName, examIndex);
              const order = assessmentOrder(label, examIndex);

              const obtainedWeightage = finiteNumber(marks?.obtainedWeightage);
              const totalWeightage = finiteNumber(marks?.totalWeightage);
              const obtainedMarks = finiteNumber(marks?.obtainedMarks);
              const fullMarks = finiteNumber(marks?.fullMarks);

              const total = totalWeightage !== null && totalWeightage > 0
                ? totalWeightage
                : fullMarks !== null && fullMarks > 0
                  ? fullMarks
                  : null;

              let obtained = obtainedWeightage !== null ? obtainedWeightage : obtainedMarks;
              if (obtained !== null && total !== null && total > 0) {
                obtained = Math.max(0, Math.min(obtained, total));
              }

              const existing = examMap.get(label) || {
                key: `${course.code || idx}-${label}`,
                label,
                order,
                obtained: 0,
                total: 0,
                hasObtained: false,
                hasTotal: false,
                isSummary: label === 'Total'
              };

              if (obtained !== null) {
                existing.obtained += obtained;
                existing.hasObtained = true;
              }

              if (total !== null && total > 0) {
                existing.total += total;
                existing.hasTotal = true;
              }

              examMap.set(label, existing);
            });

            const assessmentRows = [...examMap.values()]
              .map((row) => ({
                ...row,
                obtained: row.hasObtained ? row.obtained : null,
                total: row.hasTotal ? row.total : null
              }))
              .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

            const hasTestSeries = assessmentRows.some((row) => /^T\d+$/i.test(String(row?.label || '')));
            if (hasTestSeries) {
              ['T1', 'T2', 'T3'].forEach((label, tIdx) => {
                if (assessmentRows.some((row) => String(row?.label || '').toUpperCase() === label)) return;
                assessmentRows.push({
                  key: `${course.code || idx}-${label}`,
                  label,
                  order: tIdx + 1,
                  obtained: null,
                  total: null,
                  hasObtained: false,
                  hasTotal: false,
                  isSummary: false
                });
              });
            }

            const explicitObtained = finiteNumber(course?.totalObtained);
            const explicitTotal = finiteNumber(course?.totalFull);

            const derivedTotal = assessmentRows
              .filter((row) => !row.isSummary && row.total !== null && row.total > 0)
              .reduce((sum, row) => sum + row.total, 0);

            const derivedObtained = assessmentRows
              .filter((row) => !row.isSummary)
              .reduce((sum, row) => {
                const value = finiteNumber(row.obtained);
                return sum + (value !== null ? value : 0);
              }, 0);

            let courseTotal = explicitTotal !== null && explicitTotal > 0 ? explicitTotal : (derivedTotal > 0 ? derivedTotal : null);
            let courseObtained = explicitObtained !== null ? explicitObtained : (courseTotal !== null ? derivedObtained : null);

            if (courseTotal === null && (explicitObtained === null || explicitObtained <= 0) && derivedObtained <= 0) {
              courseObtained = null;
            }

            if (courseTotal !== null && courseObtained !== null) {
              courseObtained = Math.max(0, Math.min(courseObtained, courseTotal));
            }

            const totalIndex = assessmentRows.findIndex((row) => row.label === 'Total');
            if (totalIndex >= 0) {
              const current = assessmentRows[totalIndex];
              assessmentRows[totalIndex] = {
                ...current,
                isSummary: true,
                order: 999,
                total: courseTotal !== null ? courseTotal : current.total,
                obtained: courseObtained !== null ? courseObtained : current.obtained
              };
            } else {
              assessmentRows.push({
                key: `${course.code || idx}-Total`,
                label: 'Total',
                order: 999,
                obtained: courseObtained,
                total: courseTotal,
                hasObtained: courseObtained !== null,
                hasTotal: courseTotal !== null,
                isSummary: true
              });
            }

            assessmentRows.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

            const scoreLabel = toDisplayMarks(formatMarksValue(courseObtained), formatMarksValue(courseTotal));

            return (
              <div
                key={`${course.code || idx}`}
                className="rounded-2xl border border-border/40 bg-card p-5 space-y-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-black tracking-tight text-foreground leading-tight uppercase break-words">
                      {course.name}
                    </h4>
                    {course.code ? (
                      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{course.code}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full border border-border/40 bg-secondary/30 px-3 py-1 text-xs font-bold text-foreground whitespace-nowrap">
                    Score: {scoreLabel}
                  </span>
                </div>

                {assessmentRows.length ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_auto] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Assessment</span>
                      <span>Weightage</span>
                    </div>

                    {assessmentRows.map((assessment) => {
                      const obt = finiteNumber(assessment?.obtained);
                      const tot = finiteNumber(assessment?.total);
                      const pct = tot !== null && tot > 0 && obt !== null
                        ? Math.max(0, Math.min(100, (obt / tot) * 100))
                        : 0;
                      const displayObt = formatMarksValue(obt) ?? '-';
                      const displayTot = tot !== null && tot > 0 ? formatMarksValue(tot) ?? '-' : '-';

                      return (
                        <div key={assessment.key} className="space-y-1.5">
                          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                            <p className={cn('font-semibold truncate', assessment.isSummary ? 'text-primary' : 'text-foreground')}>
                              {assessment.label}
                            </p>
                            <p className="font-bold text-foreground whitespace-nowrap">
                              {displayObt} <span className="text-muted-foreground font-medium">/ {displayTot}</span>
                            </p>
                          </div>
                          <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-500", barColor(pct))}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
          </div>
        </div>
      ) : null}
    </>
  );
}
