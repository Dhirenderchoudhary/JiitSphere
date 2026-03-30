'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { fetchPortalAttendance, fetchPortalAttendanceMeta, fetchPortalSubjectAttendance } from 'lib/api';
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

export default function AttendanceView({ token }) {
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
      setMeta({ semesters: [] });
      setAttendance([]);
      setMessage(err?.message || 'Unable to load attendance metadata');
    });
  }, [token]);

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
      setAttendance([]);
      setMessage(err?.message || 'Unable to load attendance data');
    });
  }, [token, selectedSem]);

  const loadSubject = async (subjectCode) => {
    if (subjectDetails[subjectCode]?.loaded) return;
    const response = await fetchPortalSubjectAttendance(token, selectedSem, subjectCode);
    setSubjectDetails((prev) => ({
      ...prev,
      [subjectCode]: {
        loaded: true,
        rows: response?.data?.studentAttdsummarylist || [],
        message: response?.data?.message || ''
      }
    }));
  };

  return (
    <div className="space-y-4 pb-28 sm:pb-24">
      <div className={`sticky top-0 z-20 p-3 ${glassPanel}`}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Semester</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
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
          <div className="w-28">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Target %</label>
            <select
              value={targetAttendancePct}
              onChange={(e) => setTargetAttendancePct(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">Select</option>
              <option value="60">60%</option>
              <option value="65">65%</option>
              <option value="70">70%</option>
              <option value="75">75%</option>
              <option value="80">80%</option>
              <option value="85">85%</option>
              <option value="90">90%</option>
            </select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 p-1 text-xs">
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 font-semibold ${attendanceMode === 'overview' ? 'bg-cyan-700 text-white' : 'text-slate-500 dark:text-slate-400'}`}
            onClick={() => setAttendanceMode('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`rounded-lg px-2 py-1.5 font-semibold ${attendanceMode === 'day' ? 'bg-cyan-700 text-white' : 'text-slate-500 dark:text-slate-400'}`}
            onClick={() => setAttendanceMode('day')}
          >
            Day-to-Day
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {!attendance.length ? <p className="text-sm text-muted-foreground">{message || 'No attendance records available for this semester.'}</p> : null}
        {attendance.map((row) => (
          <Card key={row.subjectcode} className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{row.subjectdesc || row.subjectcode}</h3>
                  <p className="text-xs text-muted-foreground">Code: {row.subjectcode || '-'}</p>
                </div>
                {(() => {
                  const ratio = resolveAttendanceCounts(row, targetAttendancePct);
                  return (
                <div className="rounded-full bg-cyan-50 px-2 py-1 text-right">
                  <p className="text-sm font-bold text-cyan-700">
                    {toPercent(row.LTpercantage)}
                    <span className="ml-1 text-[10px] font-semibold text-cyan-800">
                      ({ratio?.total ? `${ratio.attended}/${ratio.total}` : '-/-'})
                    </span>
                  </p>
                </div>
                  );
                })()}
              </div>
              <div className="mb-2 text-xs text-slate-600 dark:text-slate-300">
                <p>{buildAttendanceGuidance(row, targetAttendancePct)}</p>
              </div>
              <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-3 sm:gap-2">
                <p>Lecture: {toPercent(row.Lpercentage)}</p>
                <p>Tutorial: {toPercent(row.Tpercentage)}</p>
                <p>Practical: {toPercent(row.Ppercentage)}</p>
              </div>
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
                  <Button size="default" variant="secondary" className="border-slate-300 dark:border-slate-600" onClick={() => loadSubject(row.subjectcode)}>
                    View Day-to-Day
                  </Button>
                ) : null}
              </div>
              {attendanceMode === 'day' && (subjectDetails[row.subjectcode]?.rows || []).length ? (
                <div className="mt-3 space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/55 p-3 text-xs">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <label className="flex items-center gap-2 text-muted-foreground">
                      Status
                      <select
                        className="rounded border border-border bg-background px-2 py-1 text-[11px]"
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
                        className="rounded border border-border bg-background px-2 py-1 text-[11px]"
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
                            <span key={`${row.subjectcode}-${m.key}-stat`} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                              {monthLabelFromKey(m.key)}: {attendanceRatioText(m.present, m.total)}
                            </span>
                          ))}
                        </div>

                        {monthKeys.map((monthKey) => {
                          const monthRows = groupedByMonth[monthKey] || [];
                          const monthPresent = monthRows.filter((entry) => entry.present === 'Present').length;
                          const monthTotal = monthRows.length;

                          return (
                            <div key={`${row.subjectcode}-${monthKey}`} className="mb-2 rounded-lg border border-slate-300/70 dark:border-slate-600/70 bg-white/80 dark:bg-slate-900/65 p-2">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-1">
                                <p className="text-[11px] font-semibold text-foreground">{monthLabelFromKey(monthKey)}</p>
                                <p className="text-[11px] text-muted-foreground">Attended / Total: {attendanceRatioText(monthPresent, monthTotal)}</p>
                              </div>

                              <div className="space-y-2">
                                {monthRows.map((entry, idx) => (
                                  <div key={`${row.subjectcode}-${monthKey}-${idx}`} className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-2 py-1.5">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <span className="text-[11px] leading-5 sm:text-xs">{entry.datetime || '-'}</span>
                                        {entry.topic ? <p className="text-[10px] text-muted-foreground">{entry.topic}</p> : null}
                                      </div>
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${entry.present === 'Present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
