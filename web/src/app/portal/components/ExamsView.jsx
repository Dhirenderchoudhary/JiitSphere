'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { fetchPortalExams, SessionExpiredError } from 'lib/api';
import { glassPanel, SHOW_TECHNICAL_DETAILS } from '../constants';
import {
  dateScore,
  shouldHideUnknownExam,
  toExamDateLabel,
  toExamSlotLabel,
  toExamTimeLabel,
  toExamRoomLabel,
  toExamSeatLabel,
  pickRenderablePairs
} from '../utils';

export default function ExamsView({ token, semesters = [], onExpired }) {
  const [exams, setExams] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedSem, setSelectedSem] = useState('all');
  const [loading, setLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState('');

  const loadExams = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetchPortalExams(token, forceRefresh);
      const rows = Array.isArray(response?.data) ? response.data : [];
      setExams(rows);
      setLastSyncAt(new Date().toLocaleTimeString());
      if (!rows.length) {
        setMessage('No exam schedule available right now. Try refresh once the portal updates data.');
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) { onExpired?.(); return; }
      setExams([]);
      setMessage(err?.message || 'Unable to load exams');
    } finally {
      setLoading(false);
    }
  }, [token, onExpired]);

  useEffect(() => {
    loadExams(false);
  }, [loadExams]);

  const filteredExams = useMemo(() => {
    if (selectedSem === 'all') return exams;
    const selectedSemMeta = (semesters || []).find((sem) => String(sem.registration_id) === String(selectedSem));
    const selectedCode = String(selectedSemMeta?.registration_code || '').toLowerCase();
    return exams.filter((exam) => {
      const byId = String(exam.registration_id || '') === String(selectedSem);
      const byCode = selectedCode && String(exam.registration_code || '').toLowerCase() === selectedCode;
      return byId || byCode;
    });
  }, [exams, selectedSem, semesters]);

  const sortedExams = useMemo(() => {
    return filteredExams
      .filter((exam) => !shouldHideUnknownExam(exam))
      .sort((a, b) => {
        const left = dateScore(a.date);
        const right = dateScore(b.date);
        if (!left && !right) return 0;
        if (!left) return 1;
        if (!right) return -1;
        return left - right;
      });
  }, [filteredExams]);

  return (
    <div className="space-y-3 pb-28 sm:pb-24">
      <div className={`p-3 ${glassPanel}`}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Semester</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
            >
              <option value="all">All Semesters</option>
              {(semesters || []).map((sem) => (
                <option key={sem.registration_id} value={sem.registration_id}>{sem.registration_code}</option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={() => loadExams(true)} disabled={loading} className="min-w-[124px]">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Syncing...' : 'Refresh'}
          </Button>
        </div>
        {lastSyncAt ? <p className="mt-2 text-[11px] text-muted-foreground">Last synced: {lastSyncAt}</p> : null}
      </div>
      {!sortedExams.length ? <p className="text-sm text-muted-foreground">{message || 'No exam schedule available for selected semester.'}</p> : null}
      {sortedExams.map((exam, idx) => (
        <Card key={`${exam.subject}-${exam.date}`} className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">{exam.subject}</p>
              {exam.registration_code ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                  {exam.registration_code}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">Date: {toExamDateLabel(exam.date) || 'Schedule pending'}</p>
            <p className="text-sm text-muted-foreground">Slot: {toExamSlotLabel(exam) || 'Schedule pending'}</p>
            <p className="text-sm text-muted-foreground">Time: {toExamTimeLabel(exam) || 'Schedule pending'}</p>
            <p className="text-sm text-muted-foreground">Room: {toExamRoomLabel(exam) || 'Schedule pending'}</p>
            <p className="text-sm text-muted-foreground">Seat No: {toExamSeatLabel(exam) || 'Not assigned'}</p>
            {SHOW_TECHNICAL_DETAILS ? (
              <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <p>Registration ID: {exam.registration_id || '-'}</p>
                <p>Exam Event ID: {exam.exameventid || '-'}</p>
                <p>Student ID: {exam.studentid || '-'}</p>
                <p>Subject ID: {exam.subjectid || '-'}</p>
              </div>
            ) : null}
            {SHOW_TECHNICAL_DETAILS && pickRenderablePairs(exam.raw || {}, ['subject', 'subjectdesc', 'subjectname', 'date', 'examdate', 'slot', 'time', 'room', 'venue', 'registrationid', 'registrationcode'], 5).length ? (
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {pickRenderablePairs(exam.raw || {}, ['subject', 'subjectdesc', 'subjectname', 'date', 'examdate', 'slot', 'time', 'room', 'venue', 'registrationid', 'registrationcode'], 5)
                  .map(([k, v]) => (
                    <p key={`${exam.subject}-${idx}-${k}`}>{k}: {v}</p>
                  ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
