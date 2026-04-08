'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { fetchPortalFees, SessionExpiredError } from 'lib/api';
import { formatCurrency, deriveFeeStatus, feeStatusBadgeClass, semesterSortScore } from '../utils';

export default function FeesView({ token, semesters = [], onExpired }) {
  const [fees, setFees] = useState([]);
  const [message, setMessage] = useState('');
  const [debugHint, setDebugHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState('');

  const semesterById = useMemo(() => {
    return new Map((semesters || []).map((sem) => [String(sem?.registration_id || ''), sem?.registration_code || '']));
  }, [semesters]);

  const loadFees = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetchPortalFees(token, { debug: false, refresh: forceRefresh });
        const feeRows = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.data?.fees)
            ? response.data.fees
            : Array.isArray(response?.fees)
              ? response.fees
              : [];
        setFees(feeRows);
        setLastSyncAt(new Date().toLocaleTimeString());
        if (!feeRows.length) {
          setDebugHint('No semester-wise fee rows were returned by portal for this account right now.');
        } else {
          setDebugHint('');
        }
    } catch (err) {
      if (err instanceof SessionExpiredError) { onExpired?.(); return; }
      setFees([]);
      setMessage(err?.message || 'Unable to load fee details');
      setDebugHint('');
    } finally {
      setLoading(false);
    }
  }, [token, onExpired]);

  useEffect(() => {
    loadFees(false);
  }, [loadFees]);

  const summary = useMemo(() => {
    return fees.reduce(
      (acc, item) => {
        acc.total += Number(item?.total_demand || 0);
        acc.paid += Number(item?.paid_amount || 0);
        acc.due += Number(item?.due_amount || 0);
        acc.fine += Number(item?.fine_amount || 0);
        return acc;
      },
      { total: 0, paid: 0, due: 0, fine: 0 }
    );
  }, [fees]);

  const sortedFees = useMemo(() => {
    return [...fees].sort((a, b) => {
      const scoreA = semesterSortScore(a?.registration_code, a?.registration_id);
      const scoreB = semesterSortScore(b?.registration_code, b?.registration_id);
      return scoreB - scoreA;
    });
  }, [fees]);

  const groupedFees = useMemo(() => {
    const bySemester = new Map();
    for (const item of sortedFees) {
      const registrationId = String(item?.registration_id || '');
      const semesterCodeFromMeta = semesterById.get(registrationId) || '';
      const semesterCode = semesterCodeFromMeta || item?.registration_code || registrationId || 'Semester';
      const semesterLabel = item?.semester_label || semesterCode;
      const key = `${String(semesterLabel).trim().toLowerCase()}|${String(semesterCode).trim().toLowerCase()}`;
      const current = bySemester.get(key) || {
        semester_label: semesterLabel,
        registration_code: semesterCode,
        total_demand: 0,
        paid_amount: 0,
        due_amount: 0,
        fine_amount: 0,
        latest_payment_date: '',
        record_count: 0
      };
      current.total_demand += Number(item?.total_demand || 0);
      current.paid_amount += Number(item?.paid_amount || 0);
      current.due_amount += Number(item?.due_amount || 0);
      current.fine_amount += Number(item?.fine_amount || 0);
      current.record_count += 1;
      if (item?.payment_date && String(item.payment_date).trim()) {
        current.latest_payment_date = String(item.payment_date);
      }
      bySemester.set(key, current);
    }

    return Array.from(bySemester.values()).map((row) => {
      const total = Number(row?.total_demand || 0);
      let paid = Number(row?.paid_amount || 0);
      let due = Number(row?.due_amount || 0);

      if (total > 0 && paid <= 0 && due <= 0) {
        due = total;
      } else if (total > 0) {
        if (paid < 0) paid = 0;
        if (due < 0) due = 0;
        if (paid > total) paid = total;
        const minDue = Math.max(0, total - paid);
        if (due < minDue) due = minDue;
        if (due > total) due = total;
      }

      return {
        ...row,
        paid_amount: paid,
        due_amount: due
      };
    }).sort(
      (a, b) => semesterSortScore(b?.registration_code, b?.semester_label) - semesterSortScore(a?.registration_code, a?.semester_label)
    );
  }, [semesterById, sortedFees]);

  return (
    <div className="space-y-4 pb-24 sm:pb-20">
      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fee Summary</CardTitle>
          <CardDescription>Current overview from portal records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3">
              <p className="text-xs text-muted-foreground">Total Demand</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatCurrency(summary.total)}</p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-3">
              <p className="text-xs text-green-700">Total Paid</p>
              <p className="text-lg font-bold text-green-800">{formatCurrency(summary.paid)}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">Outstanding</p>
              <p className="text-lg font-bold text-amber-800">{formatCurrency(summary.due)}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs text-rose-700">Fine / Late Fee</p>
              <p className="text-lg font-bold text-rose-800">{formatCurrency(summary.fine)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Semester-wise Fee Records</CardTitle>
              <CardDescription>{groupedFees.length ? `${groupedFees.length} semesters loaded` : 'No records available yet'}</CardDescription>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => loadFees(true)} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Syncing...' : 'Refresh'}
            </Button>
          </div>
          {lastSyncAt ? <p className="text-[11px] text-muted-foreground">Last synced: {lastSyncAt}</p> : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {!groupedFees.length ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{message || 'No fee data was returned by the portal for this account.'}</p>
              {debugHint ? <p className="text-xs text-muted-foreground">{debugHint}</p> : null}
            </div>
          ) : (
            groupedFees.map((item, idx) => (
              <div
                key={`${item.registration_code || item.semester_label || 'fee'}-${idx}`}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-background/40 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.semester_label || item.registration_code || `Semester ${idx + 1}`}</p>
                    {item.record_count > 1 ? <p className="text-[11px] text-muted-foreground">{item.record_count} fee records merged</p> : null}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${feeStatusBadgeClass(deriveFeeStatus(item))}`}>
                    {deriveFeeStatus(item)}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/50 p-2.5">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Demand</p>
                    <p className="mt-1 text-sm font-semibold">{formatCurrency(item.total_demand)}</p>
                  </div>
                  <div className="rounded-lg border border-green-200/80 bg-green-50/80 p-2.5">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-green-700">Paid</p>
                    <p className="mt-1 text-sm font-semibold text-green-800">{formatCurrency(item.paid_amount)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 p-2.5">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-amber-700">Due</p>
                    <p className="mt-1 text-sm font-semibold text-amber-800">{formatCurrency(item.due_amount)}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200/80 bg-rose-50/80 p-2.5">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-rose-700">Fine</p>
                    <p className="mt-1 text-sm font-semibold text-rose-800">{formatCurrency(item.fine_amount)}</p>
                  </div>
                </div>
                {item.latest_payment_date ? <p className="mt-2 text-xs text-muted-foreground">Last payment date: {item.latest_payment_date}</p> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
