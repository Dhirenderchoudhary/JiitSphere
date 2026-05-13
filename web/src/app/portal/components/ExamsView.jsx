'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';
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
    <div className="space-y-4 pb-28 sm:pb-24">
      <div className={`p-4 ${glassPanel}`}>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Target Semester</label>
            <select
              className="w-full rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
            >
              <option value="all">All Semesters</option>
              {(semesters || []).map((sem) => (
                <option key={sem.registration_id} value={sem.registration_id}>{sem.registration_code}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button 
                type="button" 
                variant="secondary" 
                onClick={() => loadExams(true)} 
                disabled={loading} 
                className="rounded-xl font-bold h-10 px-6"
            >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Syncing...' : 'Force Refresh'}
            </Button>
          </div>
        </div>
        {lastSyncAt ? <p className="mt-3 text-xs font-medium text-muted-foreground/50 text-right">Synced at {lastSyncAt}</p> : null}
      </div>

      {loading && !sortedExams.length ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
             <div key={i} className="rounded-2xl border border-border/40 bg-card p-6 min-h-[140px] flex items-center justify-center">
                 <div className="w-full flex flex-col sm:grid sm:grid-cols-[2fr_1.5fr] gap-6">
                    <div className="space-y-4">
                       <div className="h-6 w-3/4 bg-muted animate-pulse rounded" />
                       <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4 sm:mt-0">
                       <div className="h-12 w-full bg-muted animate-pulse rounded-xl" />
                       <div className="h-12 w-full bg-muted animate-pulse rounded-xl" />
                    </div>
                 </div>
             </div>
          ))}
        </div>
      ) : !sortedExams.length ? (
         <div className="rounded-2xl p-12 text-center border border-dashed border-border/30">
            <p className="text-sm font-medium text-muted-foreground">{message || 'No scheduled exams found.'}</p>
         </div>
      ) : null}

      <div className="grid gap-4">
        {sortedExams.map((exam, idx) => (
          <div key={`${exam.subject}-${exam.date}`} className="rounded-2xl border border-border/40 bg-card hover:border-primary/20 transition-all">
            <div className="p-6">
              <div className="flex flex-col sm:grid sm:grid-cols-[2fr_1.5fr] gap-6">
                <div className="space-y-3">
                   <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xl font-bold tracking-tight leading-none text-foreground font-[var(--font-instrument-sans)]">
                        {exam.subject}
                      </h3>
                      {exam.registration_code && (
                        <span className="text-xs font-bold bg-primary/10 text-primary rounded-lg px-2 py-0.5">
                          {exam.registration_code}
                        </span>
                      )}
                   </div>
                   <div className="grid grid-cols-2 gap-4 border-t border-border/20 pt-4">
                      <div className="space-y-0.5">
                         <span className="text-[9px] font-medium text-muted-foreground">Exam Date</span>
                         <p className="text-sm font-bold text-foreground">{toExamDateLabel(exam.date) || 'Pending'}</p>
                      </div>
                      <div className="space-y-0.5">
                         <span className="text-[9px] font-medium text-muted-foreground">Room / Venue</span>
                         <p className="text-sm font-bold text-foreground">{toExamRoomLabel(exam) || 'TBA'}</p>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-2 gap-2">
                   <div className="rounded-xl border border-border/40 bg-secondary/20 p-2 flex flex-col items-center justify-center">
                      <span className="text-xs font-bold text-foreground">{toExamSlotLabel(exam) || '-'}</span>
                      <span className="text-[8px] font-medium text-muted-foreground">Slot</span>
                   </div>
                   <div className="rounded-xl border border-border/40 bg-secondary/20 p-2 flex flex-col items-center justify-center">
                      <span className="text-xs font-bold text-foreground">{toExamTimeLabel(exam) || '-'}</span>
                      <span className="text-[8px] font-medium text-muted-foreground">Time</span>
                   </div>
                   <div className="rounded-xl border-2 border-primary/20 p-2 flex flex-col items-center justify-center bg-primary/5 sm:col-span-2">
                      <span className="text-xs font-bold text-primary">{toExamSeatLabel(exam) || '-'}</span>
                      <span className="text-[8px] font-medium text-primary/60">Seat No</span>
                   </div>
                </div>
              </div>
              
              {SHOW_TECHNICAL_DETAILS && (
                 <div className="mt-4 pt-4 border-t border-border/20 grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground/40">
                    <span>Reg ID: {exam.registration_id}</span>
                    <span>Event ID: {exam.exameventid}</span>
                 </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
