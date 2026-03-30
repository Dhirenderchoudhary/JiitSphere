'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { fetchPortalSubjects } from 'lib/api';
import { glassPanel, SHOW_TECHNICAL_DETAILS } from '../constants';
import { pickRenderablePairs } from '../utils';

export default function SubjectsView({ token, semesters = [], defaultSemester }) {
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
      setSubjects({ registered: [], faculties: [], details: [] });
      setMessage(err?.message || 'Unable to load subjects');
    } finally {
      setLoading(false);
    }
  }, [selectedSem, token]);

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
              {(semesters || []).map((sem) => (
                <option key={sem.registration_id} value={sem.registration_id}>{sem.registration_code}</option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={() => loadSubjects(true)} disabled={loading} className="min-w-[124px]">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Syncing...' : 'Refresh'}
          </Button>
        </div>
      </div>
      {!detailedSubjects.length ? <p className="text-sm text-muted-foreground">{loading ? 'Loading subjects...' : message || 'No direct subjects data available.'}</p> : null}
      {detailedSubjects.map((sub, idx) => (
        <Card key={`${sub.subjectcode || sub.subjectdesc}-${idx}`} className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{sub.subjectdesc || 'Subject'}</p>
              {sub.credits !== null && sub.credits !== undefined && String(sub.credits).trim() !== '' ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                  {sub.credits} Credits
                </span>
              ) : null}
            </div>
            <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <p>Code: {sub.subjectcode || '-'}</p>
              <p>Faculty: {sub.faculty || 'Faculty'}</p>
              {SHOW_TECHNICAL_DETAILS ? <p>Subject ID: {sub.subjectid || '-'}</p> : null}
              {SHOW_TECHNICAL_DETAILS ? <p>Faculty ID: {sub.facultyid || '-'}</p> : null}
              {SHOW_TECHNICAL_DETAILS ? <p>Student ID: {sub.studentid || '-'}</p> : null}
              {SHOW_TECHNICAL_DETAILS ? <p>Registration ID: {sub.registrationid || selectedSem || '-'}</p> : null}
              {SHOW_TECHNICAL_DETAILS ? <p>Branch ID: {sub.branchid || '-'}</p> : null}
              {SHOW_TECHNICAL_DETAILS ? <p>Program ID: {sub.programid || '-'}</p> : null}
            </div>
            {SHOW_TECHNICAL_DETAILS && pickRenderablePairs(sub.raw || {}, ['subjectdesc', 'subjectdescription', 'subjectname', 'subjectcode', 'employeename', 'facultyname', 'credit', 'credits', 'subjectcredit'], 4).length ? (
              <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                {pickRenderablePairs(sub.raw || {}, ['subjectdesc', 'subjectdescription', 'subjectname', 'subjectcode', 'employeename', 'facultyname', 'credit', 'credits', 'subjectcredit'], 4)
                  .map(([k, v]) => (
                    <p key={`${sub.subjectcode || sub.subjectdesc}-${idx}-${k}`}>{k}: {v}</p>
                  ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
