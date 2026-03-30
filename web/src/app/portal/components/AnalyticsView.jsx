'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, BookOpen, Clock3, Globe2, Laptop2, Smartphone, Tablet, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { fetchAdminAnalytics, fetchStudyAnalytics } from 'lib/api';

export default function AnalyticsView({ token }) {
  const [analytics, setAnalytics] = useState(null);
  const [studyAnalytics, setStudyAnalytics] = useState(null);
  const [error, setError] = useState('');

  const compact = (value) => Number(value || 0).toLocaleString('en-IN');

  const statusBreakdown = [
    { label: '2xx', value: analytics?.byStatusFamily?.['2xx'] || 0, color: 'text-emerald-700' },
    { label: '3xx', value: analytics?.byStatusFamily?.['3xx'] || 0, color: 'text-sky-700' },
    { label: '4xx', value: analytics?.byStatusFamily?.['4xx'] || 0, color: 'text-amber-700' },
    { label: '5xx', value: analytics?.byStatusFamily?.['5xx'] || 0, color: 'text-rose-700' }
  ];

  useEffect(() => {
    fetchAdminAnalytics(token)
      .then((response) => {
        setAnalytics(response?.data || null);
      })
      .catch((err) => {
        setError(err?.message || 'Unable to load analytics');
      });

    fetchStudyAnalytics()
      .then((response) => setStudyAnalytics(response?.data || null))
      .catch(() => setStudyAnalytics(null));
  }, [token]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!analytics) return <p className="text-sm text-muted-foreground">Loading analytics...</p>;

  return (
    <div className="space-y-4 pb-28 sm:pb-24">

      {/* ── Study Material Google Auth Analytics ──────────────────── */}
      <Card className="border-emerald-200/70 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-emerald-700" /> Study Material Visitors
          </CardTitle>
          <CardDescription>Google-authenticated JIIT students who accessed study material</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {studyAnalytics ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Total Sign-Ins</p>
                  <p className="mt-1 text-2xl font-black text-emerald-700">{compact(studyAnalytics.totalSignIns)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Unique Students</p>
                  <p className="mt-1 text-2xl font-black text-emerald-700 flex items-center gap-1"><Users className="h-5 w-5" />{compact(studyAnalytics.uniqueUsers)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 p-3 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">Last 7 Days</p>
                  <div className="grid grid-cols-7 gap-1">
                    {(studyAnalytics.last7Days || []).map((day) => (
                      <div key={day.date} className="text-center">
                        <div
                          className="mx-auto mb-1 w-full rounded"
                          style={{
                            height: '32px',
                            background: day.count > 0 ? `rgba(5,150,105,${Math.min(1, 0.2 + (day.count / Math.max(...(studyAnalytics.last7Days || []).map((d) => d.count), 1)) * 0.8)})` : 'rgba(0,0,0,0.06)'
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground">{day.date.slice(5)}</p>
                        <p className="text-[10px] font-semibold">{day.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {(studyAnalytics.recentSignIns || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent Sign-Ins</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(studyAnalytics.recentSignIns || []).slice(0, 10).map((entry, idx) => (
                      <div key={`${entry.at}-${idx}`} className="flex items-center justify-between rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 px-3 py-1.5 text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{entry.email}</span>
                        <span className="text-muted-foreground">{new Date(entry.at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Tracking since: {studyAnalytics.startedAt ? new Date(studyAnalytics.startedAt).toLocaleString() : '-'}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No study material access data yet.</p>
          )}
        </CardContent>
      </Card>

      {/* ── API / Backend Analytics ───────────────────────────────── */}
      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-cyan-700" /> Overall Traffic</CardTitle>
          <CardDescription>All API traffic and active usage snapshot</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Total API Requests</p>
            <p className="mt-1 text-2xl font-black text-cyan-700">{compact(analytics.totalRequests)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Unique Logged-in Users</p>
            <p className="mt-1 text-2xl font-black text-cyan-700">{compact(analytics.uniqueVisitors)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Unique IP Visitors</p>
            <p className="mt-1 text-2xl font-black text-cyan-700">{compact(analytics.uniqueIps)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Avg Response Time</p>
            <p className="mt-1 text-2xl font-black text-cyan-700">{compact(analytics.avgResponseTimeMs)}ms</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">P95 Response Time</p>
            <p className="mt-1 text-2xl font-black text-cyan-700">{compact(analytics.p95ResponseTimeMs)}ms</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-cyan-700" /> Health And Status</CardTitle>
          <CardDescription>Request outcome ratio and runtime health</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          <div className="grid gap-2 text-sm text-slate-700 dark:text-slate-200 sm:grid-cols-4">
            {statusBreakdown.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
                <p className={`mt-1 text-lg font-bold ${item.color}`}>{compact(item.value)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Tracking started: {analytics.startedAt ? new Date(analytics.startedAt).toLocaleString() : '-'}</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Globe2 className="h-4 w-4 text-cyan-700" /> Traffic Sources</CardTitle>
          <CardDescription>Where visitors are coming from</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          {(analytics.topReferrers || []).length ? (analytics.topReferrers || []).map((row) => (
            <div key={row.source} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
              <span className="truncate text-slate-600 dark:text-slate-300">{row.source}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{compact(row.count)}</span>
            </div>
          )) : <p className="text-sm text-muted-foreground">No source data yet.</p>}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Laptop2 className="h-4 w-4 text-cyan-700" /> Device And Platform</CardTitle>
          <CardDescription>Visitor device type, browser and OS</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Device Type</p>
            <div className="grid gap-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"><span className="flex items-center gap-1"><Laptop2 className="h-3.5 w-3.5" /> Desktop</span><span className="font-semibold">{compact(analytics.byDevice?.desktop)}</span></div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"><span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> Mobile</span><span className="font-semibold">{compact(analytics.byDevice?.mobile)}</span></div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"><span className="flex items-center gap-1"><Tablet className="h-3.5 w-3.5" /> Tablet</span><span className="font-semibold">{compact(analytics.byDevice?.tablet)}</span></div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"><span>Bot</span><span className="font-semibold">{compact(analytics.byDevice?.bot)}</span></div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Top Browsers</p>
            {(analytics.topBrowsers || []).slice(0, 7).map((row) => (
              <div key={row.name} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
                <span className="truncate">{row.name}</span>
                <span className="font-semibold">{compact(row.count)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Top Operating Systems</p>
            {(analytics.topOperatingSystems || []).slice(0, 7).map((row) => (
              <div key={row.name} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
                <span className="truncate">{row.name}</span>
                <span className="font-semibold">{compact(row.count)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top Routes</CardTitle>
          <CardDescription>Most visited API endpoints</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          {(analytics.topRoutes || []).map((row) => (
            <div key={row.route} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
              <span className="truncate text-slate-600 dark:text-slate-300">{row.route}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{compact(row.count)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-cyan-700" /> Performance And Errors</CardTitle>
          <CardDescription>Slow endpoints and error concentration</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Slowest Routes (avg ms)</p>
            {(analytics.slowestRoutes || []).slice(0, 8).map((row) => (
              <div key={row.route} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
                <p className="truncate text-slate-600 dark:text-slate-300">{row.route}</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">avg {compact(row.avgDurationMs)}ms • max {compact(row.maxDurationMs)}ms • {compact(row.count)} calls</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Top Error Routes</p>
            {(analytics.topErrorRoutes || []).length ? (analytics.topErrorRoutes || []).slice(0, 8).map((row) => (
              <div key={row.route} className="flex items-center justify-between rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 px-3 py-2 text-xs">
                <span className="truncate text-slate-700 dark:text-slate-200">{row.route}</span>
                <span className="flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400"><AlertTriangle className="h-3.5 w-3.5" /> {compact(row.errors)}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">No 4xx/5xx routes recorded yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trends</CardTitle>
          <CardDescription>Daily and hourly request movement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Last 7 Days</p>
          <div className="grid gap-2 md:grid-cols-2">
            {(analytics.visitsLast7Days || []).map((row) => (
              <div key={row.date} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
                <p className="text-slate-500 dark:text-slate-400">{row.date}</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{compact(row.count)} requests</p>
                <p className="text-slate-600 dark:text-slate-300">{compact(row.uniqueVisitors)} unique IPs</p>
              </div>
            ))}
          </div>
          <p className="pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Last 24 Hours (hourly)</p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(analytics.requestsLast24Hours || []).map((row, idx) => (
              <div key={`${row.hour}-${idx}`} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 text-[11px]">
                <p className="text-slate-500 dark:text-slate-400">{row.hour}:00</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{compact(row.count)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Requests</CardTitle>
          <CardDescription>Latest live API activity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          {(analytics.recentRequests || []).slice(0, 20).map((row, idx) => (
            <div key={`${row.at}-${idx}`} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{row.method} {row.route}</p>
                <p className="text-slate-600 dark:text-slate-300">{new Date(row.at).toLocaleString()}</p>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-slate-600 dark:text-slate-300">
                <span>Status: {row.statusCode}</span>
                <span>Time: {compact(row.durationMs)}ms</span>
                <span>IP: {row.ip || '-'}</span>
                <span>Source: {row.referrer || 'direct'}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
