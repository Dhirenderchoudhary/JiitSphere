'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { fetchPortalGrades, downloadPortalMarks, SessionExpiredError } from 'lib/api';
import { cn } from 'lib/utils';
import { SHOW_TECHNICAL_DETAILS } from '../constants';
import {
  semesterSortScore,
  toFixedSafe,
  toDisplayNumber,
  toDisplayMarks,
  normalizeCsvCell
} from '../utils';

export default function GradesView({ token, onExpired }) {
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
        if (err instanceof SessionExpiredError) { onExpired?.(); return; }
        setGrades([]);
        setGradeCards({});
        setSemesters([]);
        setMessage(err?.message || 'Unable to load grades');
      });

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
        <div className="flex border border-border bg-muted/20 p-1">
          {['overview', 'semester', 'marks'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                gradesMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setGradesMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      ) : null}

      {sortedSemesters.length && gradesMode !== 'marks' ? (
        <Card className="rounded-none border-border/60 bg-card/60  transition-all duration-300">
          <CardContent className="space-y-6 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-border/50 p-4 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Current Status</p>
                <div className="flex items-baseline gap-2">
                   <p className="text-xl font-bold tracking-tight text-foreground">{currentSummary?.registration_code || 'Semester'}</p>
                   <span className="text-xs font-bold text-muted-foreground opacity-60">SGPA: {toFixedSafe(currentSummary?.sgpa, 2)}</span>
                </div>
              </div>
              <div className="border-2 border-primary/20 p-4 flex flex-col items-center justify-center bg-primary/5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">Cumulative CGPA</p>
                <p className="text-4xl font-black tracking-tightest text-primary">{toFixedSafe(currentSummary?.cgpa, 2)}</p>
              </div>
            </div>

            {gradesMode === 'semester' ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end border-t border-border/20 pt-6">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Select Semester</label>
                  <select
                    className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm font-bold appearance-none cursor-pointer hover:border-primary/50 transition-colors"
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
                    className="rounded-none font-bold uppercase tracking-wider h-10 px-6 active:scale-95"
                  >
                    <Download className="mr-2 h-4 w-4" /> {downloadingMarks ? 'FETCHING...' : 'PORTAL PDF'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {graphSeries ? (
                  <div className="border border-border/60 bg-muted/10 p-4 relative overflow-hidden group">
                    <div className="flex items-center justify-between mb-4">
                       <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">Performance Trend</h4>
                       <div className="flex gap-4 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                          <span className="flex items-center gap-1.5"><div className="size-2 bg-emerald-500" /> SGPA</span>
                          <span className="flex items-center gap-1.5"><div className="size-2 bg-primary" /> CGPA</span>
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
                         <span className="text-[10px] font-black text-muted-foreground uppercase">{selectedGraphRow.registration_code}</span>
                         <div className="flex gap-4">
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter">SGPA: {toFixedSafe(selectedGraphRow.sgpa, 2)}</span>
                            <span className="text-[10px] font-black text-primary uppercase tracking-tighter">CGPA: {toFixedSafe(selectedGraphRow.cgpa, 2)}</span>
                         </div>
                      </div>
                    )}
                  </div>
                ) : null}
                
                <div className="grid gap-2 sm:grid-cols-2">
                   {sortedSemesters.map((s, idx) => {
                    const gradeRow = sortedGrades.find((g) => String(g.registration_id) === String(s.registration_id));
                    return (
                      <div key={s.registration_id} className="border border-border/50 p-4 flex justify-between items-center group hover:border-primary/40 transition-colors">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">{s.registration_code}</p>
                          <p className="text-xs font-bold text-foreground">SGPA: {gradeRow ? toFixedSafe(gradeRow.sgpa, 2) : 'N/A'}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-xl font-black text-primary tracking-tightest">{gradeRow ? toFixedSafe(gradeRow.cgpa, 2) : '-'}</p>
                           <p className="text-[8px] font-bold text-muted-foreground uppercase opacity-40 whitespace-nowrap">CGPA Snapshot</p>
                        </div>
                      </div>
                    );
                   })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {gradesMode === 'marks' && sortedSemesters.length ? (
        <Card className="rounded-none border-border/60 bg-card/60">
          <CardContent className="p-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
               <div className="space-y-1.5 flex-1">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Target Semester</label>
                <select
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm font-bold appearance-none cursor-pointer hover:border-primary/50 transition-colors"
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(e.target.value)}
                >
                  {sortedSemesters.map((s) => (
                    <option key={s.registration_id} value={s.registration_id}>{s.registration_code}</option>
                  ))}
                </select>
               </div>
               <Button
                  onClick={downloadPortalMarksPdf}
                  disabled={downloadingMarks || !currentSummary}
                  className="rounded-none font-bold uppercase tracking-wider h-10 px-8"
                >
                  <Download className="mr-2 h-4 w-4" /> {downloadingMarks ? 'FETCHING...' : 'FULL PORTAL PDF'}
                </Button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
               <Button variant="outline" size="sm" onClick={downloadMarksPdf} className="rounded-none font-bold text-[10px] uppercase tracking-widest h-10">Marks PDF</Button>
               <Button variant="outline" size="sm" onClick={downloadGradesPdf} className="rounded-none font-bold text-[10px] uppercase tracking-widest h-10">Grades PDF</Button>
               <Button variant="outline" size="sm" onClick={downloadMarksCsv} className="rounded-none font-bold text-[10px] uppercase tracking-widest h-10">CSV Data</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {gradesMode === 'marks' && visibleRows.length ? (
        <div className="space-y-4">
           <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr] px-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
              <span>Course Title</span>
              <span className="text-center">Credits</span>
              <span className="text-center">Marks</span>
              <span className="text-right">Grade</span>
           </div>
           {visibleRows.map((row, idx) => (
            <Card key={idx} className="rounded-none border-border/40 bg-card/40 hover:border-primary/30 transition-all group">
               <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr] gap-4 sm:items-center">
                     <div className="space-y-1">
                        <h4 className="text-sm font-bold text-foreground font-[var(--font-instrument-sans)] truncate tracking-tight">{row.subjectdesc}</h4>
                        <div className="flex gap-3">
                           <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{row.subjectcode}</span>
                           <span className="text-[9px] font-bold text-primary uppercase tracking-widest">{row.registration_code}</span>
                        </div>
                     </div>
                     <div className="hidden sm:flex flex-col items-center">
                         <span className="text-sm font-bold text-foreground">{toDisplayNumber(row.credit, 1)}</span>
                         <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest opacity-40">CREDITS</span>
                     </div>
                     <div className="hidden sm:flex flex-col items-center">
                         <span className="text-sm font-bold text-foreground">{toDisplayMarks(row.marksobtained, row.totalmarks)}</span>
                         <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest opacity-40">SCORE</span>
                     </div>
                     <div className="flex justify-between sm:justify-end items-center gap-4">
                        <div className="sm:hidden flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                           <span>CR: {toDisplayNumber(row.credit, 1)}</span>
                           <span>MK: {toDisplayMarks(row.marksobtained, row.totalmarks)}</span>
                        </div>
                        <div className="bg-primary/10 border border-primary/20 px-3 py-1 min-w-[50px] text-center">
                           <span className="text-lg font-black text-primary">{row.grade || '-'}</span>
                        </div>
                     </div>
                  </div>
               </CardContent>
            </Card>
           ))}
        </div>
      ) : null}
    </div>
  );
}
