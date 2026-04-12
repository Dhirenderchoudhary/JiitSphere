'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from 'components/ui/button';
import { fetchPortalAttendance, fetchPortalAttendanceMeta, fetchPortalSubjectAttendance, SessionExpiredError } from 'lib/api';
import { motion } from 'framer-motion';
import { cn } from 'lib/utils';
import { glassPanel, SHOW_TECHNICAL_DETAILS } from '../constants';
import {
  getAttendanceTargetStorageKey,
  toPercent,
  resolveAttendanceCounts,
  buildAttendanceGuidance,
  pickRenderablePairs,
  pickIdPairs,
  dateScore,
  monthKeyFromDate,
  monthLabelFromKey,
  attendanceRatioText,
  monthStatsFromRows
} from '../utils';

export default function AttendanceView({ token, onExpired }) {
  const [meta, setMeta] = useState(null);
  const [selectedSem, setSelectedSem] = useState('');
  const [attendanceMode, setAttendanceMode] = useState('overview');
  const [targetAttendancePct, setTargetAttendancePct] = useState('');
  const [attendance, setAttendance] = useState([]);
  const [subjectDetails, setSubjectDetails] = useState({});
  const [dayFilters, setDayFilters] = useState({});
  const [monthFilters, setMonthFilters] = useState({});
  const [showAllRows, setShowAllRows] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      const key = getAttendanceTargetStorageKey();
      const stored = window.localStorage.getItem(key);
      if (stored) setTargetAttendancePct(stored);
    } catch (_error) {
      setTargetAttendancePct('');
    }
  }, []);

  useEffect(() => {
    try {
      const key = getAttendanceTargetStorageKey();
      if (targetAttendancePct) {
        window.localStorage.setItem(key, String(targetAttendancePct));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch (_error) {
      // Ignore localStorage write failures in restricted browser contexts.
    }
  }, [targetAttendancePct]);

  useEffect(() => {
    fetchPortalAttendanceMeta(token).then((response) => {
      const payload = response?.data || null;
      setMeta(payload);
      setMessage(payload?.latest_header?.message || '');
      const latest = payload?.latest_semester?.registration_id || '';
      setSelectedSem(latest);
    }).catch((err) => {
      if (err instanceof SessionExpiredError) { onExpired?.(); return; }
      setMeta({ semesters: [] });
      setAttendance([]);
      setMessage(err?.message || 'Unable to load attendance metadata');
    });
  }, [token, onExpired]);

  useEffect(() => {
    if (!selectedSem) return;
    fetchPortalAttendance(token, selectedSem).then((response) => {
      setAttendance(response?.data?.studentattendancelist || []);
      setSubjectDetails({});
      setDayFilters({});
      setMonthFilters({});
      setShowAllRows({});
      if (!response?.data?.studentattendancelist?.length && response?.data?.message) {
        setMessage(response.data.message);
      }
    }).catch((err) => {
      if (err instanceof SessionExpiredError) { onExpired?.(); return; }
      setAttendance([]);
      setMessage(err?.message || 'Unable to load attendance data');
    });
  }, [token, selectedSem, onExpired]);

  const loadSubject = async (subjectCode) => {
    const current = subjectDetails[subjectCode];
    if (!subjectCode || !selectedSem || current?.loading || current?.loaded) return;

    setSubjectDetails((prev) => ({
      ...prev,
      [subjectCode]: {
        loaded: false,
        loading: true,
        rows: [],
        message: ''
      }
    }));

    try {
      const response = await fetchPortalSubjectAttendance(token, selectedSem, subjectCode, false);
      setSubjectDetails((prev) => ({
        ...prev,
        [subjectCode]: {
          loaded: true,
          loading: false,
          rows: response?.data?.studentAttdsummarylist || [],
          message: response?.data?.message || ''
        }
      }));
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        onExpired?.();
        return;
      }

      setSubjectDetails((prev) => ({
        ...prev,
        [subjectCode]: {
          loaded: true,
          loading: false,
          rows: [],
          message: err?.message || 'Unable to load subject attendance'
        }
      }));
    }
  };

  return (
    <div className="space-y-4 pb-28 sm:pb-24">
      <div className={`sticky top-0 z-20 p-4 ${glassPanel}`}>
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Semester</label>
            <select
              className="w-full rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
            >
              {(meta?.semesters || []).map((sem) => (
                <option key={sem.registration_id} value={sem.registration_id}>
                  {sem.registration_code}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32 space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Target %</label>
            <select
              value={targetAttendancePct}
              onChange={(e) => setTargetAttendancePct(e.target.value)}
              className="h-10 w-full rounded-xl border border-border/40 bg-secondary/30 px-3 text-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
            >
              <option value="">Select</option>
              {[60, 65, 70, 75, 80, 85, 90].map(val => (
                <option key={val} value={val}>{val}%</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex rounded-xl bg-secondary/50 p-1">
          <button
            type="button"
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              attendanceMode === 'overview' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setAttendanceMode('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              attendanceMode === 'day' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setAttendanceMode('day')}
          >
            Day-to-Day
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {!attendance.length ? <p className="text-sm text-muted-foreground font-medium">{message || 'No records found.'}</p> : null}
        {attendance.map((row) => (
          <div key={row.subjectcode} className="rounded-2xl border border-border/40 bg-card p-6 hover:border-primary/20 transition-all duration-300">
              {(() => {
                const pct = Number(row.LTpercantage || 0);
                const target = Number(targetAttendancePct || 75);
                const detailRows = subjectDetails[row.subjectcode]?.rows || [];
                const exactTotal = detailRows.length;
                const exactAttended = detailRows.filter((entry) => String(entry?.present || '').toLowerCase() === 'present').length;
                const ratio = exactTotal
                  ? { attended: exactAttended, total: exactTotal, source: 'daily' }
                  : resolveAttendanceCounts(row, targetAttendancePct);
                
                const guidance = buildAttendanceGuidance(row, targetAttendancePct);
                
                // Color logic based on target
                const statusColorCls = pct >= target 
                  ? 'text-emerald-500' 
                  : pct >= target - 10 ? 'text-amber-500' : 'text-red-500';

                return (
                  <>
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-none tracking-tight text-foreground font-[var(--font-instrument-sans)] truncate">
                          {row.subjectdesc || row.subjectcode}
                        </h3>
                        <p className="text-xs font-medium text-muted-foreground">
                          {row.subjectcode}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        {ratio?.total ? (
                          <div className="flex flex-col items-end gap-0.5 font-black leading-none">
                            <span className="text-xl text-foreground">{ratio.attended}</span>
                            <div className="h-0.5 w-6 bg-primary" />
                            <span className="text-base text-muted-foreground">{ratio.total}</span>
                          </div>
                        ) : null}
                        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-primary/20 p-2 min-w-[70px] bg-primary/5">
                           <span className="text-2xl font-black leading-none text-primary">{toPercent(row.LTpercantage)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3 space-y-2">
                      <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, pct)}%` }}
                          transition={{ duration: 1, ease: "circOut" }}
                          className="h-full rounded-full bg-primary"
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <p className={cn("text-xs font-bold", statusColorCls)}>
                          {guidance}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground/50">
                          Target: {target}%
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Lecture', val: row.Lpercentage },
                        { label: 'Tutorial', val: row.Tpercentage },
                        { label: 'Practical', val: row.Ppercentage }
                      ].map((comp) => (
                        <div key={comp.label} className="rounded-xl border border-border/40 bg-secondary/20 p-2 flex flex-col items-center">
                          <p className="text-sm font-bold text-foreground">{toPercent(comp.val)}</p>
                          <p className="text-[9px] font-medium text-muted-foreground">{comp.label}</p>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
              {SHOW_TECHNICAL_DETAILS ? (
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <p>Subject ID: {row.subjectid || '-'}</p>
                  <p>Individual Code: {row.individualsubjectcode || '-'}</p>
                  <p>L Component ID: {row.Lsubjectcomponentid || '-'}</p>
                  <p>T Component ID: {row.Tsubjectcomponentid || '-'}</p>
                  <p>P Component ID: {row.Psubjectcomponentid || '-'}</p>
                </div>
              ) : null}
              {SHOW_TECHNICAL_DETAILS && pickRenderablePairs(row.raw || {}, [
                'subjectcode',
                'subjectdesc',
                'subjectname',
                'lpercentage',
                'tpercentage',
                'ppercentage',
                'ltpercantage',
                'ltpercentage'
              ], 4).length ? (
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                  {pickRenderablePairs(row.raw || {}, [
                    'subjectcode',
                    'subjectdesc',
                    'subjectname',
                    'lpercentage',
                    'tpercentage',
                    'ppercentage',
                    'ltpercantage',
                    'ltpercentage'
                  ], 4).map(([k, v]) => (
                    <p key={`${row.subjectcode}-${k}`}>{k}: {v}</p>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                {attendanceMode === 'day' ? (
                  <Button
                    size="default"
                    variant="secondary"
                    className="border-slate-300 dark:border-slate-600"
                    onClick={() => loadSubject(row.subjectcode)}
                    disabled={subjectDetails[row.subjectcode]?.loading || subjectDetails[row.subjectcode]?.loaded}
                  >
                    {subjectDetails[row.subjectcode]?.loading
                      ? 'Loading...'
                      : subjectDetails[row.subjectcode]?.loaded
                        ? 'Loaded'
                        : 'View Day-to-Day'}
                  </Button>
                ) : null}
              </div>
              {attendanceMode === 'day' && (subjectDetails[row.subjectcode]?.rows || []).length ? (
                <div className="mt-3 space-y-2 rounded-xl border border-border/40 bg-secondary/20 p-3 text-xs">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2 text-muted-foreground">
                      Status
                      <select
                        className="rounded-lg border border-border/40 bg-card px-2 py-1 text-xs"
                        value={dayFilters[row.subjectcode] || 'all'}
                        onChange={(e) => setDayFilters((prev) => ({ ...prev, [row.subjectcode]: e.target.value }))}
                      >
                        <option value="all">All</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-muted-foreground">
                      Month
                      <select
                        className="rounded-lg border border-border/40 bg-card px-2 py-1 text-xs"
                        value={monthFilters[row.subjectcode] || 'all'}
                        onChange={(e) => setMonthFilters((prev) => ({ ...prev, [row.subjectcode]: e.target.value }))}
                      >
                        <option value="all">All Months</option>
                        {Array.from(new Set((subjectDetails[row.subjectcode].rows || []).map((entry) => monthKeyFromDate(entry.datetime))))
                          .filter((key) => key !== 'unknown')
                          .sort((a, b) => String(b).localeCompare(String(a)))
                          .map((key) => (
                            <option key={key} value={key}>{monthLabelFromKey(key)}</option>
                          ))}
                      </select>
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAllRows((prev) => ({ ...prev, [row.subjectcode]: !prev[row.subjectcode] }))}
                    >
                      {showAllRows[row.subjectcode] ? 'Show Recent' : 'Show All'}
                    </Button>
                  </div>
                  {(() => {
                    const allRows = subjectDetails[row.subjectcode].rows || [];
                    const sortedRows = [...allRows].sort((a, b) => dateScore(b.datetime) - dateScore(a.datetime));
                    const filteredRows = sortedRows
                      .filter((entry) => {
                        const mode = dayFilters[row.subjectcode] || 'all';
                        if (mode === 'present') return entry.present === 'Present';
                        if (mode === 'absent') return entry.present === 'Absent';
                        return true;
                      })
                      .filter((entry) => {
                        const monthMode = monthFilters[row.subjectcode] || 'all';
                        if (monthMode === 'all') return true;
                        return monthKeyFromDate(entry.datetime) === monthMode;
                      });

                    const visibleRows = filteredRows.slice(0, showAllRows[row.subjectcode] ? undefined : 20);

                    const groupedByMonth = visibleRows.reduce((acc, entry) => {
                      const key = monthKeyFromDate(entry.datetime);
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(entry);
                      return acc;
                    }, {});

                    const monthKeys = Object.keys(groupedByMonth).sort((a, b) => String(b).localeCompare(String(a)));

                    const totalPresent = filteredRows.filter((entry) => entry.present === 'Present').length;
                    const totalAbsent = filteredRows.filter((entry) => entry.present === 'Absent').length;
                    const totalClasses = filteredRows.length;

                    const monthlyStats = monthStatsFromRows(filteredRows);

                    return (
                      <>
                        <div className="mb-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                          <span>Present: {totalPresent}</span>
                          <span>Absent: {totalAbsent}</span>
                          <span>Attended / Total: {attendanceRatioText(totalPresent, totalClasses)}</span>
                        </div>

                        <div className="mb-2 flex flex-wrap gap-2">
                          {monthlyStats.map((m) => (
                      <span key={`${row.subjectcode}-${m.key}-stat`} className="rounded-lg border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                              {monthLabelFromKey(m.key)}: {attendanceRatioText(m.present, m.total)}
                            </span>
                          ))}
                        </div>

                        {monthKeys.map((monthKey) => {
                          const monthRows = groupedByMonth[monthKey] || [];
                          const monthPresent = monthRows.filter((entry) => entry.present === 'Present').length;
                          const monthTotal = monthRows.length;

                          return (
                            <div key={`${row.subjectcode}-${monthKey}`} className="mb-2 rounded-xl border border-border/30 bg-card p-2">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-1">
                                <p className="text-xs font-semibold text-foreground">{monthLabelFromKey(monthKey)}</p>
                                <p className="text-xs text-muted-foreground">Attended / Total: {attendanceRatioText(monthPresent, monthTotal)}</p>
                              </div>

                              <div className="space-y-2">
                                {monthRows.map((entry, idx) => (
                                  <div key={`${row.subjectcode}-${monthKey}-${idx}`} className="rounded-lg border border-border/30 bg-card px-2 py-1.5">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <span className="text-[11px] leading-5 sm:text-xs">{entry.datetime || '-'}</span>
                                        {entry.topic ? <p className="text-[10px] text-muted-foreground">{entry.topic}</p> : null}
                                      </div>
                                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${entry.present === 'Present' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
                                        {entry.present}
                                      </span>
                                    </div>
                                    {SHOW_TECHNICAL_DETAILS && pickRenderablePairs(entry.raw || {}, ['datetime', 'attendancedate', 'date', 'present', 'status', 'attendance', 'topic'], 3).length ? (
                                      <div className="mt-1 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
                                        {pickRenderablePairs(entry.raw || {}, ['datetime', 'attendancedate', 'date', 'present', 'status', 'attendance', 'topic'], 3)
                                          .map(([k, v]) => (
                                            <p key={`${row.subjectcode}-${monthKey}-${idx}-${k}`}>{k}: {v}</p>
                                          ))}
                                      </div>
                                    ) : null}
                                    {SHOW_TECHNICAL_DETAILS && pickIdPairs(entry.raw || {}, 4).length ? (
                                      <div className="mt-1 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
                                        {pickIdPairs(entry.raw || {}, 4).map(([k, v]) => (
                                          <p key={`${row.subjectcode}-${monthKey}-${idx}-id-${k}`}>{k}: {v}</p>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              ) : null}
              {attendanceMode === 'day' && subjectDetails[row.subjectcode]?.loaded && !(subjectDetails[row.subjectcode]?.rows || []).length ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {subjectDetails[row.subjectcode]?.message || 'Day-to-day attendance is not available for this subject right now.'}
                </p>
              ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
