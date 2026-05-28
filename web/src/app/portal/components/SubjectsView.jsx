'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';
import { fetchPortalSubjects, SessionExpiredError } from 'lib/api';
import { glassPanel, SHOW_TECHNICAL_DETAILS } from '../constants';
import { pickRenderablePairs } from '../utils';

export default function SubjectsView({ token, semesters = [], defaultSemester, onExpired }) {
  const [subjects, setSubjects] = useState({ registered: [], faculties: [], details: [] });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedSem, setSelectedSem] = useState(defaultSemester || semesters[0]?.registration_id || '');

  useEffect(() => {
    if (!selectedSem && semesters?.length > 0) {
      setSelectedSem(defaultSemester || semesters[0]?.registration_id || '');
    }
  }, [semesters, defaultSemester, selectedSem]);

  const loadSubjects = useCallback(
    async (forceRefresh = false) => {
      if (!selectedSem) return;
      setLoading(true);
      setMessage('');
      try {
        const response = await fetchPortalSubjects(token, selectedSem, forceRefresh);
        setSubjects(response?.data || { registered: [], faculties: [], details: [] });
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          onExpired?.();
          return;
        }
        setSubjects({ registered: [], faculties: [], details: [] });
        setMessage(err?.message || 'Unable to load subjects');
      } finally {
        setLoading(false);
      }
    },
    [selectedSem, token, onExpired]
  );

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
      raw: null,
    }));
  }, [subjects]);

  return (
    <div className="space-y-4 pb-28 sm:pb-24">
      <div className={`p-4 ${glassPanel}`}>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              Target Semester
            </label>
            <select
              className="w-full rounded-xl border border-border/40 bg-secondary/30 px-3 py-2 text-sm font-medium appearance-none cursor-pointer hover:border-primary/50 transition-colors"
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
            >
              {(semesters || []).map((sem) => (
                <option key={sem.registration_id} value={sem.registration_id}>
                  {sem.registration_code}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => loadSubjects(true)}
              disabled={loading}
              className="rounded-xl font-bold h-10 px-6"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Syncing...' : 'Force Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {!detailedSubjects.length ? (
        <div className="rounded-2xl p-12 text-center border border-dashed border-border/30">
          <p className="text-sm font-medium text-muted-foreground">
            {loading ? 'Loading courses...' : message || 'No course data found.'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {detailedSubjects.map((sub, idx) => (
          <div
            key={`${sub.subjectcode || sub.subjectdesc}-${idx}`}
            className="rounded-2xl border border-border/40 bg-card hover:border-primary/20 transition-all"
          >
            <div className="p-6">
              <div className="flex flex-col sm:grid sm:grid-cols-[2.5fr_1fr] gap-6">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xl font-bold tracking-tight leading-none text-foreground font-[var(--font-instrument-sans)]">
                      {sub.subjectdesc || 'Subject'}
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-border/20 pt-4">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-medium text-muted-foreground">
                        Course Code
                      </span>
                      <p className="text-sm font-bold text-foreground">{sub.subjectcode || '-'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-medium text-muted-foreground">
                        Primary Faculty
                      </span>
                      <p className="text-sm font-bold text-foreground truncate">
                        {sub.faculty || 'Faculty'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row sm:flex-col gap-2 justify-end sm:justify-start">
                  <div className="rounded-xl border border-border/40 bg-secondary/20 p-2 flex flex-col items-center justify-center min-w-[80px]">
                    <span className="text-xs font-bold text-foreground">
                      {sub.credits !== null ? sub.credits : '-'}
                    </span>
                    <span className="text-[8px] font-medium text-muted-foreground">Credits</span>
                  </div>
                  {SHOW_TECHNICAL_DETAILS && sub.subjectid && (
                    <div className="rounded-xl border border-border/40 bg-primary/5 p-2 flex flex-col items-center justify-center min-w-[80px]">
                      <span className="text-[9px] font-bold text-primary truncate w-full text-center">
                        {sub.subjectid}
                      </span>
                      <span className="text-[8px] font-medium text-primary/60">SID</span>
                    </div>
                  )}
                </div>
              </div>

              {SHOW_TECHNICAL_DETAILS && sub.registrationid && (
                <div className="mt-4 pt-4 border-t border-border/20 grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground/40">
                  <span>Registration ID: {sub.registrationid}</span>
                  <span>Student ID: {sub.studentid}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
