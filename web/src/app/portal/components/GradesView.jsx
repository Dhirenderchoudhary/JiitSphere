'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { fetchPortalGrades, downloadPortalMarks } from 'lib/api';
import { SHOW_TECHNICAL_DETAILS } from '../constants';
import {
  semesterSortScore,
  toFixedSafe,
  toDisplayNumber,
  toDisplayMarks,
  normalizeCsvCell
} from '../utils';

export default function GradesView({ token }) {
  const [semesters, setSemesters] = useState([]);
  const [grades, setGrades] = useState([]);
  const [gradeCards, setGradeCards] = useState({});
  const [message, setMessage] = useState('');
  const [selectedSem, setSelectedSem] = useState('');
  const [gradesMode, setGradesMode] = useState('marks');
  const [selectedGraphIndex, setSelectedGraphIndex] = useState(-1);
  const [downloadingMarks, setDownloadingMarks] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchPortalGrades(token)
      .then((response) => {
        if (cancelled) return;
        const payload = response?.data;
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
          setSelectedSem((current) => current || String(sems[0]?.registration_id || ''));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setGrades([]);
        setGradeCards({});
        setSemesters([]);
        setMessage(err?.message || 'Unable to load grades');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

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

  const currentSummary = useMemo(() => {
    const fromGrades = sortedGrades.find((row) => String(row.registration_id) === String(selectedSem));
    if (fromGrades) return fromGrades;
    const fromSem = sortedSemesters.find((s) => String(s.registration_id) === String(selectedSem));
    if (fromSem) return { registration_id: fromSem.registration_id, registration_code: fromSem.registration_code, sgpa: 0, cgpa: 0 };
    return sortedGrades[0] || null;
  }, [selectedSem, sortedGrades, sortedSemesters]);

  const visibleRows = useMemo(() => {
    return (gradeCards[selectedSem] || []).map((row) => ({
      ...row,
      registration_code: currentSummary?.registration_code || selectedSem,
      registration_id: selectedSem
    }));
  }, [gradeCards, selectedSem, currentSummary]);

  const graphRows = useMemo(() => {
    return [...sortedGrades].reverse();
  }, [sortedGrades]);

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
    return (gradeCards[selectedSem] || []).map((row) => ({
      semester: currentSummary?.registration_code || selectedSem || 'Semester',
      ...row
    }));
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
        <div className="grid grid-cols-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 p-1 text-xs">
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 font-semibold ${gradesMode === 'overview' ? 'bg-cyan-700 text-white' : 'text-slate-500 dark:text-slate-400'}`}
            onClick={() => setGradesMode('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 font-semibold ${gradesMode === 'semester' ? 'bg-cyan-700 text-white' : 'text-slate-500 dark:text-slate-400'}`}
            onClick={() => setGradesMode('semester')}
          >
            Semester
          </button>
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 font-semibold ${gradesMode === 'marks' ? 'bg-cyan-700 text-white' : 'text-slate-500 dark:text-slate-400'}`}
            onClick={() => setGradesMode('marks')}
          >
            Marks
          </button>
        </div>
      ) : null}

      {sortedSemesters.length && gradesMode !== 'marks' ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Latest Semester</p>
                <p className="mt-1 font-semibold">{currentSummary?.registration_code || 'Semester'}</p>
                <p className="text-sm text-muted-foreground">SGPA: {toFixedSafe(currentSummary?.sgpa, 2)}</p>
                {SHOW_TECHNICAL_DETAILS ? <p className="text-sm text-muted-foreground">Registration ID: {currentSummary?.registration_id || '-'}</p> : null}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-right">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Current CGPA</p>
                <p className="mt-1 text-2xl font-black text-primary">{toFixedSafe(currentSummary?.cgpa, 2)}</p>
              </div>
            </div>

            {gradesMode === 'semester' ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Semester</label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(e.target.value)}
                >
                  {sortedSemesters.map((s) => (
                    <option key={s.registration_id || s.registration_code} value={s.registration_id}>
                      {s.registration_code || s.registration_id || 'Semester'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  variant="default"
                  onClick={downloadPortalMarksPdf}
                  disabled={downloadingMarks || !currentSummary}
                  className="w-full sm:w-auto bg-cyan-700 hover:bg-cyan-800 text-white"
                >
                  <Download className="mr-2 h-4 w-4" /> {downloadingMarks ? 'Downloading...' : 'Download Marks (Portal PDF)'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={downloadMarksPdf}
                  disabled={!(gradeCards[selectedSem] || []).length}
                  className="w-full sm:w-auto"
                >
                  <Download className="mr-2 h-4 w-4" /> Download Semester PDF
                </Button>
                <Button
                  variant="secondary"
                  onClick={downloadGradesPdf}
                  disabled={!(gradeCards[selectedSem] || []).length}
                  className="w-full sm:w-auto"
                >
                  <Download className="mr-2 h-4 w-4" /> Download Grades PDF
                </Button>
                <Button
                  variant="secondary"
                  onClick={downloadMarksCsv}
                  disabled={!(gradeCards[selectedSem] || []).length}
                  className="w-full sm:w-auto"
                >
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>
              </div>
            </div>
            ) : (
              <>
              {graphSeries ? (
                <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-amber-50 p-3 shadow-[0_12px_30px_-24px_rgba(14,116,144,0.6)]">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">CGPA / SGPA Trend</p>
                    <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> SGPA</span>
                      <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-600" /> CGPA</span>
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 font-semibold text-cyan-700">Tap any dot to inspect value</span>
                    {selectedGraphRow ? (
                      <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-200">
                        {(selectedGraphRow.registration_code || 'Semester')} • SGPA {toFixedSafe(selectedGraphRow.sgpa, 2)} • CGPA {toFixedSafe(selectedGraphRow.cgpa, 2)}
                      </span>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto">
                    <svg viewBox={`0 0 ${graphSeries.width} ${graphSeries.height}`} className="h-56 min-w-[640px] w-full">
                      <rect x="0" y="0" width={graphSeries.width} height={graphSeries.height} fill="transparent" />
                      {[0, 1, 2, 3, 4].map((step) => {
                        const y = graphSeries.padY + (step * (graphSeries.height - graphSeries.padY * 2)) / 4;
                        return <line key={`grid-${step}`} x1={graphSeries.padX} y1={y} x2={graphSeries.width - graphSeries.padX} y2={y} stroke="#bae6fd" strokeDasharray="4 4" />;
                      })}
                      <polyline fill="none" stroke="#10b981" strokeWidth="3" points={graphSeries.sgpaPoints} />
                      <polyline fill="none" stroke="#0891b2" strokeWidth="3" points={graphSeries.cgpaPoints} />
                      {graphRows.map((row, idx) => {
                        const x = graphSeries.padX + (idx * (graphSeries.width - graphSeries.padX * 2)) / Math.max(graphRows.length - 1, 1);
                        const yS = graphSeries.padY + ((graphSeries.yMax - Number(row.sgpa || 0)) * (graphSeries.height - graphSeries.padY * 2)) / Math.max(graphSeries.yMax - graphSeries.yMin, 0.5);
                        const yC = graphSeries.padY + ((graphSeries.yMax - Number(row.cgpa || 0)) * (graphSeries.height - graphSeries.padY * 2)) / Math.max(graphSeries.yMax - graphSeries.yMin, 0.5);
                        const active = idx === selectedGraphIndex;
                        return (
                          <g key={`dots-${row.registration_id || idx}`}>
                            <circle
                              cx={x}
                              cy={yS}
                              r={active ? '5' : '4'}
                              fill="#10b981"
                              stroke={active ? '#065f46' : 'transparent'}
                              strokeWidth="1.5"
                              style={{ cursor: 'pointer' }}
                              onClick={() => setSelectedGraphIndex(idx)}
                            />
                            <circle
                              cx={x}
                              cy={yC}
                              r={active ? '5' : '4'}
                              fill="#0891b2"
                              stroke={active ? '#0c4a6e' : 'transparent'}
                              strokeWidth="1.5"
                              style={{ cursor: 'pointer' }}
                              onClick={() => setSelectedGraphIndex(idx)}
                            />
                          </g>
                        );
                      })}
                      {graphRows.map((row, idx) => {
                        const x = graphSeries.padX + (idx * (graphSeries.width - graphSeries.padX * 2)) / Math.max(graphRows.length - 1, 1);
                        return (
                          <g key={`x-label-${row.registration_id || idx}`}>
                            <text x={x} y={graphSeries.height - 4} textAnchor="middle" fontSize="10" fill="#94a3b8">
                              {idx + 1}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                {sortedSemesters.map((s, idx) => {
                  const gradeRow = sortedGrades.find((g) => String(g.registration_id) === String(s.registration_id));
                  return (
                    <div key={`${s.registration_id}-${idx}`} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-semibold">{s.registration_code || `Semester ${idx + 1}`}</p>
                      {gradeRow ? (
                        <>
                          <p className="text-xs text-muted-foreground">SGPA: {toFixedSafe(gradeRow.sgpa, 2)}</p>
                          <p className="text-xs text-muted-foreground">CGPA: {toFixedSafe(gradeRow.cgpa, 2)}</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No grades yet</p>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {gradesMode === 'marks' && sortedSemesters.length ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70 text-slate-900 dark:text-slate-100">
          <CardContent className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Semester</label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={selectedSem}
                onChange={(e) => setSelectedSem(e.target.value)}
              >
                {sortedSemesters.map((s) => (
                  <option key={s.registration_id || s.registration_code} value={s.registration_id}>
                    {s.registration_code || s.registration_id || 'Semester'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={downloadPortalMarksPdf}
                disabled={downloadingMarks || !currentSummary}
                className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                <Download className="mr-2 h-4 w-4" /> {downloadingMarks ? 'Downloading…' : 'Download Marks (Portal PDF)'}
              </Button>
              <Button variant="secondary" onClick={downloadMarksPdf} disabled={!(gradeCards[selectedSem] || []).length} className="w-full sm:w-auto">
                <Download className="mr-2 h-4 w-4" /> Download Semester PDF
              </Button>
              <Button variant="secondary" onClick={downloadGradesPdf} disabled={!(gradeCards[selectedSem] || []).length} className="w-full sm:w-auto">
                <Download className="mr-2 h-4 w-4" /> Download Grades PDF
              </Button>
              <Button variant="secondary" onClick={downloadMarksCsv} disabled={!(gradeCards[selectedSem] || []).length} className="w-full sm:w-auto">
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {gradesMode === 'marks' && sortedSemesters.length && !visibleRows.length ? (
        <p className="text-sm text-muted-foreground px-1">No marks data available yet for {currentSummary?.registration_code || 'this semester'}.</p>
      ) : null}

      {gradesMode === 'marks' && visibleRows.length ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70 text-slate-900 dark:text-slate-100">
          <CardContent className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-xs">
            <div className="hidden grid-cols-[1.4fr_auto_auto_auto_auto] gap-2 border-b border-slate-200 dark:border-slate-700 px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:grid">
              <span>Subject</span>
              <span>Code</span>
              <span>Credits</span>
              <span>Marks</span>
              <span>Grade</span>
            </div>
            {visibleRows.map((row, idx) => (
              <div key={`${row.registration_id || 'all'}-${row.subjectcode || row.subjectdesc}-${idx}`} className="border-b border-slate-200 dark:border-slate-700 px-1 py-2 last:border-b-0">
                <div className="space-y-1 sm:hidden">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{row.subjectdesc}</p>
                  {row.registration_code ? <p className="text-[11px] text-muted-foreground">{row.registration_code}</p> : null}
                  <div className="flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                    <span>Code: {row.subjectcode || '-'}</span>
                    <span>Credits: {toDisplayNumber(row.credit, 1)}</span>
                    <span>Marks: {toDisplayMarks(row.marksobtained, row.totalmarks)}</span>
                    <span>GP: {toDisplayNumber(row.gradepoint, 1)}</span>
                    <span>Grade: {row.grade || '-'}</span>
                  </div>
                </div>

                <div className="hidden grid-cols-[1.4fr_auto_auto_auto_auto] gap-2 sm:grid">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{row.subjectdesc}</p>
                    {row.registration_code ? <p className="text-[11px] text-muted-foreground">{row.registration_code}</p> : null}
                  </div>
                  <span className="text-slate-600 dark:text-slate-300">{row.subjectcode || '-'}</span>
                  <span className="text-slate-600 dark:text-slate-300">{toDisplayNumber(row.credit, 1)}</span>
                  <span className="text-slate-600 dark:text-slate-300">{toDisplayMarks(row.marksobtained, row.totalmarks)}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{row.grade || '-'} <span className="text-muted-foreground">(GP {toDisplayNumber(row.gradepoint, 1)})</span></span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
