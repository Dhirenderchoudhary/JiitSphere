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
    <div className="space-y-4 pb-28 sm:pb-24">
      <div className={`p-4 ${glassPanel}`}>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Target Semester</label>
            <select
              className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm font-bold appearance-none cursor-pointer hover:border-primary/50 transition-colors"
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
            >
              <option value="all">ALL SEMESTERS</option>
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
                className="rounded-none font-bold uppercase tracking-wider h-10 px-6 border-border/50 active:scale-95"
            >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'SYNCING...' : 'FORCE REFRESH'}
            </Button>
          </div>
        </div>
        {lastSyncAt ? <p className="mt-3 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest text-right">Data Snapshot: {lastSyncAt}</p> : null}
      </div>

      {!sortedExams.length ? (
         <div className="p-12 text-center border border-dashed border-border/40">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{message || 'No scheduled exams found.'}</p>
         </div>
      ) : null}

      <div className="grid gap-4">
        {sortedExams.map((exam, idx) => (
          <Card key={`${exam.subject}-${exam.date}`} className="rounded-none border-border/40 bg-card/40 hover:border-primary/30 transition-all group">
            <CardContent className="p-6">
              <div className="flex flex-col sm:grid sm:grid-cols-[2fr_1.5fr] gap-6">
                <div className="space-y-3">
                   <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xl font-black tracking-tight leading-none text-foreground font-[var(--font-instrument-sans)]">
                        {exam.subject}
                      </h3>
                      {exam.registration_code && (
                        <span className="text-[9px] font-black bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 uppercase tracking-widest">
                          {exam.registration_code}
                        </span>
                      )}
                   </div>
                   <div className="grid grid-cols-2 gap-4 border-t border-border/10 pt-4">
                      <div className="space-y-0.5">
                         <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-[0.15em]">Exam Date</span>
                         <p className="text-sm font-bold text-foreground">{toExamDateLabel(exam.date) || 'PENDING'}</p>
                      </div>
                      <div className="space-y-0.5">
                         <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-[0.15em]">Room / Venue</span>
                         <p className="text-sm font-bold text-foreground">{toExamRoomLabel(exam) || 'TBA'}</p>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-2 gap-2">
                   <div className="border border-border/50 p-2 flex flex-col items-center justify-center bg-muted/5">
                      <span className="text-xs font-black text-foreground">{toExamSlotLabel(exam) || '-'}</span>
                      <span className="text-[7px] font-black text-muted-foreground/40 uppercase tracking-widest">SLOT</span>
                   </div>
                   <div className="border border-border/50 p-2 flex flex-col items-center justify-center bg-muted/5">
                      <span className="text-xs font-black text-foreground">{toExamTimeLabel(exam) || '-'}</span>
                      <span className="text-[7px] font-black text-muted-foreground/40 uppercase tracking-widest">TIME</span>
                   </div>
                   <div className="border-2 border-primary/20 p-2 flex flex-col items-center justify-center bg-primary/5 sm:col-span-2">
                      <span className="text-xs font-black text-primary">{toExamSeatLabel(exam) || '-'}</span>
                      <span className="text-[7px] font-black text-primary/40 uppercase tracking-widest">SEAT NO</span>
                   </div>
                </div>
              </div>
              
              {SHOW_TECHNICAL_DETAILS && (
                 <div className="mt-4 pt-4 border-t border-border/10 grid grid-cols-2 gap-2 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    <span>Reg ID: {exam.registration_id}</span>
                    <span>Event ID: {exam.exameventid}</span>
                 </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
