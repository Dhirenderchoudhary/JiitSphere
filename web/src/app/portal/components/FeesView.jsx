'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from 'components/ui/button';
import { fetchPortalFees, SessionExpiredError } from 'lib/api';
import { cn } from 'lib/utils';
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
    <div className="space-y-6 pb-24 sm:pb-20">
      <div className="rounded-2xl border border-border/40 bg-card shadow-sm">
        <div className="p-6 pb-4 border-b border-border/20">
          <h3 className="text-lg font-bold text-foreground font-[var(--font-instrument-sans)]">Wallet Summary</h3>
          <p className="text-xs font-medium text-muted-foreground">Consolidated financial standing across all terms</p>
        </div>
        <div className="p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/40 p-4 bg-secondary/10 space-y-1">
              <span className="text-[9px] font-medium text-muted-foreground">Gross Demand</span>
              <p className="text-2xl font-black text-foreground">{formatCurrency(summary.total)}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 p-4 bg-emerald-500/5 space-y-1">
              <span className="text-[9px] font-medium text-emerald-600/80">Total Paid</span>
              <p className="text-2xl font-black text-emerald-600">{formatCurrency(summary.paid)}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 p-4 bg-amber-500/5 space-y-1">
              <span className="text-[9px] font-medium text-amber-600/80">Outstanding</span>
              <p className="text-2xl font-black text-amber-600">{formatCurrency(summary.due)}</p>
            </div>
            <div className="rounded-xl border border-red-500/20 p-4 bg-red-500/5 space-y-1">
              <span className="text-[9px] font-medium text-red-600/80">Fines</span>
              <p className="text-2xl font-black text-red-600">{formatCurrency(summary.fine)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
           <h3 className="text-xs font-bold text-muted-foreground">Term Breakdown</h3>
           <div className="flex items-center gap-4">
              {lastSyncAt && <span className="text-[9px] font-medium text-muted-foreground/50">Synced {lastSyncAt}</span>}
              <Button type="button" variant="link" size="sm" onClick={() => loadFees(true)} disabled={loading} className="h-auto p-0 text-xs font-bold text-primary hover:no-underline">
                <RefreshCw className={cn("mr-2 h-3 w-3", loading && "animate-spin")} />
                {loading ? 'Syncing...' : 'Force Refresh'}
              </Button>
           </div>
        </div>

        {!groupedFees.length ? (
           <div className="rounded-2xl p-12 text-center border border-dashed border-border/30">
              <p className="text-sm font-medium text-muted-foreground whitespace-pre-line">{message || debugHint || 'No financial records found.'}</p>
           </div>
        ) : (
         <div className="grid gap-4">
            {groupedFees.map((item, idx) => (
              <div key={`${item.registration_code || item.semester_label || 'fee'}-${idx}`} className="rounded-2xl border border-border/40 bg-card hover:border-primary/20 transition-all">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="space-y-1">
                      <h4 className="text-lg font-bold tracking-tight text-foreground font-[var(--font-instrument-sans)]">
                        {item.semester_label || item.registration_code || `Term ${idx + 1}`}
                      </h4>
                      {item.record_count > 1 && (
                         <span className="text-xs font-medium bg-primary/10 text-primary rounded-lg px-2 py-0.5">
                           {item.record_count} entries aggregated
                         </span>
                      )}
                    </div>
                    <div className={cn(
                       "px-4 py-1.5 text-xs font-bold rounded-lg border",
                       deriveFeeStatus(item) === 'PAID' ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-500" : "border-amber-500/40 bg-amber-500/5 text-amber-500"
                    )}>
                      {deriveFeeStatus(item)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border/40 p-3 space-y-1">
                      <span className="text-[8px] font-medium text-muted-foreground">Demand</span>
                      <p className="text-sm font-bold text-foreground">{formatCurrency(item.total_demand)}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3 space-y-1 bg-emerald-500/[0.02]">
                      <span className="text-[8px] font-medium text-emerald-600/80">Paid</span>
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(item.paid_amount)}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3 space-y-1 bg-amber-500/[0.02]">
                      <span className="text-[8px] font-medium text-amber-600/80">Outstanding</span>
                      <p className="text-sm font-bold text-amber-600">{formatCurrency(item.due_amount)}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 p-3 space-y-1 bg-red-500/[0.02]">
                      <span className="text-[8px] font-medium text-red-600/80">Penalty</span>
                      <p className="text-sm font-bold text-red-600">{formatCurrency(item.fine_amount)}</p>
                    </div>
                  </div>

                  {item.latest_payment_date && (
                    <div className="mt-4 pt-4 border-t border-border/20 flex items-center justify-between">
                       <span className="text-[9px] font-medium text-muted-foreground/50">Latest transaction</span>
                       <span className="text-xs font-medium text-muted-foreground">{item.latest_payment_date}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
