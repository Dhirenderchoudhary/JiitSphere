'use client';

import { useEffect, useState } from 'react';
import { Activity, BarChart3, BookOpen, Laptop2, Smartphone, Tablet, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { fetchAdminAnalytics, fetchStudyAnalytics } from 'lib/api';
import { cn } from 'lib/utils';

export default function AnalyticsView({ token }) {
  const [analytics, setAnalytics] = useState(null);
  const [studyAnalytics, setStudyAnalytics] = useState(null);
  const [error, setError] = useState('');

  const compact = (value) => Number(value || 0).toLocaleString('en-IN');

  const statusBreakdown = [
    { label: '2xx', value: analytics?.byStatusFamily?.['2xx'] || 0, color: 'text-emerald-500' },
    { label: '3xx', value: analytics?.byStatusFamily?.['3xx'] || 0, color: 'text-foreground' },
    { label: '4xx', value: analytics?.byStatusFamily?.['4xx'] || 0, color: 'text-amber-500' },
    { label: '5xx', value: analytics?.byStatusFamily?.['5xx'] || 0, color: 'text-red-500' },
  ];
  const share = (value, total) => (total ? Math.min(100, (Number(value || 0) / total) * 100) : 0);

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

  const last7Days = studyAnalytics?.last7Days || [];
  const busiestDay = Math.max(1, ...last7Days.map((day) => day.count));

  return (
    <div className="space-y-6 pb-28 sm:pb-24">
      <Card className="rounded-xl border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="pb-4 border-b border-border">
          <CardTitle className="flex items-center gap-3 text-lg font-bold text-foreground">
            <BookOpen className="h-5 w-5 text-primary" /> Study material sign-ins
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Students who signed in with Google to open the study material
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {studyAnalytics ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">Total sign-ins</p>
                <p className="text-3xl font-bold text-foreground leading-none">
                  {compact(studyAnalytics.totalSignIns)}
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">Unique students</p>
                <p className="text-3xl font-bold text-foreground leading-none flex items-center gap-2">
                  {compact(studyAnalytics.uniqueUsers)}
                  <Users className="h-5 w-5 text-muted-foreground" />
                </p>
              </div>
              <div className="rounded-lg border border-border p-4 sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  Sign-ins, last 7 days
                </p>
                {last7Days.some((day) => day.count > 0) ? (
                  <div className="grid grid-cols-7 gap-1.5 h-12">
                    {last7Days.map((day) => (
                      <div
                        key={day.date}
                        className="flex items-end h-full"
                        title={`${day.date}: ${compact(day.count)}`}
                      >
                        <div
                          className="w-full rounded-sm bg-primary"
                          style={{ height: `${(day.count / busiestDay) * 100}%` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No sign-ins in the last 7 days.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-lg border border-dashed border-border">
              <p className="text-sm text-muted-foreground">No sign-in data yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardHeader className="pb-4 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> API traffic
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Requests</span>
                <p className="text-xl font-bold text-foreground">
                  {compact(analytics.totalRequests)}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Unique visitors</span>
                <p className="text-xl font-bold text-foreground">
                  {compact(analytics.uniqueVisitors)}
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-border flex justify-between items-center text-xs">
              <span className="text-muted-foreground">P95 response time</span>
              <span className="font-semibold text-foreground">
                {compact(analytics.p95ResponseTimeMs)} ms
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardHeader className="pb-4 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Responses by status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-2">
              {statusBreakdown.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-border p-3 flex flex-col justify-between"
                >
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <p className={cn('text-lg font-bold mt-1', item.color)}>{compact(item.value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border bg-card shadow-sm md:col-span-2 lg:col-span-1">
          <CardHeader className="pb-4 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Laptop2 className="h-4 w-4 text-primary" /> Devices
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {[
              { icon: Laptop2, label: 'Desktop', val: analytics.byDevice?.desktop },
              { icon: Smartphone, label: 'Mobile', val: analytics.byDevice?.mobile },
              { icon: Tablet, label: 'Tablet', val: analytics.byDevice?.tablet },
            ].map((d) => (
              <div key={d.label} className="flex items-center gap-4">
                <d.icon className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-end">
                    <span className="text-xs text-muted-foreground">{d.label}</span>
                    <span className="text-xs font-medium">{compact(d.val)}</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${share(d.val, analytics.totalRequests)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardHeader className="pb-4 border-b border-border">
          <CardTitle className="text-lg font-bold text-foreground">Recent requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto overflow-x-hidden border-b border-border">
            {(analytics.recentRequests || []).slice(0, 30).map((row, idx) => (
              <div
                key={`${row.at}-${idx}`}
                className="grid grid-cols-[80px_1fr_120px] items-center gap-4 px-6 py-4 border-b border-border hover:bg-muted/50 transition-colors"
              >
                <div
                  className={cn(
                    'text-xs font-semibold text-center py-1 rounded border',
                    row.statusCode >= 400
                      ? 'border-red-500/50 text-red-500'
                      : 'border-emerald-500/50 text-emerald-500'
                  )}
                >
                  {row.statusCode}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate font-mono">
                    {row.method} {row.route}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.referrer || 'Direct'} · {row.ip || 'unknown IP'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-foreground">
                    {compact(row.durationMs)} ms
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.at).toLocaleTimeString([], { hour12: false })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="p-4 text-xs text-muted-foreground">Showing the latest 30 requests.</p>
        </CardContent>
      </Card>
    </div>
  );
}
