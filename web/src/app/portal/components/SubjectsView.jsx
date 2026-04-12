'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { fetchPortalSubjects, SessionExpiredError } from 'lib/api';
import { glassPanel, SHOW_TECHNICAL_DETAILS } from '../constants';
import { pickRenderablePairs } from '../utils';

export default function SubjectsView({ token, semesters = [], defaultSemester, onExpired }) {
  const [subjects, setSubjects] = useState({ registered: [], faculties: [], details: [] });
  const [message, setMessage] = useState('');
  const [selectedSem, setSelectedSem] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedSem && defaultSemester) {
      setSelectedSem(defaultSemester);
      return;
    }
    if (!selectedSem && semesters.length) {
      setSelectedSem(semesters[0].registration_id);
    }
  }, [defaultSemester, semesters, selectedSem]);

  const loadSubjects = useCallback(async (forceRefresh = false) => {
    if (!selectedSem) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetchPortalSubjects(token, selectedSem, forceRefresh);
      setSubjects(response?.data || { registered: [], faculties: [], details: [] });
    } catch (err) {
      if (err instanceof SessionExpiredError) { onExpired?.(); return; }
      setSubjects({ registered: [], faculties: [], details: [] });
      setMessage(err?.message || 'Unable to load subjects');
    } finally {
      setLoading(false);
    }
  }, [selectedSem, token, onExpired]);

  useEffect(() => {
    loadSubjects(false);
  }, [loadSubjects]);

  const detailedSubjects = useMemo(() => {
    if (Array.isArray(subjects.details) && subjects.details.length) return subjects.details;
    return (subjects.registered || []).map((name, idx) => ({
      subjectdesc: name,
      subjectcode: null,
      credits: null,
      component: null,
      section: null,
      faculty: subjects.faculties?.[idx] || 'Faculty',
      raw: null
    }));
  }, [subjects]);

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
              {(semesters || []).map((sem) => (
                <option key={sem.registration_id} value={sem.registration_id}>{sem.registration_code}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button 
                type="button" 
                variant="secondary" 
                onClick={() => loadSubjects(true)} 
                disabled={loading} 
                className="rounded-none font-bold uppercase tracking-wider h-10 px-6 border-border/50 active:scale-95"
            >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'SYNCING...' : 'FORCE REFRESH'}
            </Button>
          </div>
        </div>
      </div>

      {!detailedSubjects.length ? (
         <div className="p-12 text-center border border-dashed border-border/40">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{loading ? 'ESTABLISHING HANDSHAKE...' : message || 'No course data discovered.'}</p>
         </div>
      ) : null}

      <div className="grid gap-4">
        {detailedSubjects.map((sub, idx) => (
          <Card key={`${sub.subjectcode || sub.subjectdesc}-${idx}`} className="rounded-none border-border/40 bg-card/40 hover:border-primary/30 transition-all group">
            <CardContent className="p-6">
              <div className="flex flex-col sm:grid sm:grid-cols-[2.5fr_1fr] gap-6">
                <div className="space-y-3">
                   <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xl font-black tracking-tight leading-none text-foreground font-[var(--font-instrument-sans)] uppercase">
                        {sub.subjectdesc || 'Subject'}
                      </h3>
                   </div>
                   <div className="grid grid-cols-2 gap-4 border-t border-border/10 pt-4">
                      <div className="space-y-0.5">
                         <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-[0.15em]">Course Code</span>
                         <p className="text-sm font-bold text-foreground">{sub.subjectcode || '-'}</p>
                      </div>
                      <div className="space-y-0.5">
                         <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-[0.15em]">Primary Faculty</span>
                         <p className="text-sm font-bold text-foreground truncate">{sub.faculty || 'FACULTY'}</p>
                      </div>
                   </div>
                </div>

                <div className="flex flex-row sm:flex-col gap-2 justify-end sm:justify-start">
                   <div className="border border-border/50 p-2 flex flex-col items-center justify-center bg-muted/5 min-w-[80px]">
                      <span className="text-xs font-black text-foreground">{sub.credits !== null ? sub.credits : '-'}</span>
                      <span className="text-[7px] font-black text-muted-foreground/40 uppercase tracking-widest">CREDITS</span>
                   </div>
                   {SHOW_TECHNICAL_DETAILS && sub.subjectid && (
                     <div className="border border-border/50 p-2 flex flex-col items-center justify-center bg-primary/5 min-w-[80px]">
                        <span className="text-[9px] font-bold text-primary truncate w-full text-center">{sub.subjectid}</span>
                        <span className="text-[7px] font-black text-primary/40 uppercase tracking-widest">SID</span>
                     </div>
                   )}
                </div>
              </div>
              
              {SHOW_TECHNICAL_DETAILS && sub.registrationid && (
                 <div className="mt-4 pt-4 border-t border-border/10 grid grid-cols-2 gap-2 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    <span>Registration ID: {sub.registrationid}</span>
                    <span>Student ID: {sub.studentid}</span>
                 </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
