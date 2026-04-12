'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, BookOpen, Clock3, Globe2, Laptop2, Smartphone, Tablet, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { fetchAdminAnalytics, fetchStudyAnalytics } from 'lib/api';
import { cn } from 'lib/utils';

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
    <div className="space-y-6 pb-28 sm:pb-24">
      {/* ── Study Material Google Auth Analytics ──────────────────── */}
      <Card className="rounded-none border-emerald-500/30 bg-emerald-500/5 spotlight-card shadow-xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-emerald-500/20 bg-emerald-500/5">
          <CardTitle className="flex items-center gap-3 text-lg font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-[var(--font-instrument-sans)]">
            <BookOpen className="h-5 w-5" /> REPOSITORY DISCOVERY
          </CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-60">Verified student access telemetry for Study Vault</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {studyAnalytics ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="border border-emerald-500/20 p-4 bg-background/40">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-600/60 mb-1">TOTAL AUTHORIZATIONS</p>
                  <p className="text-3xl font-black text-emerald-600 font-[var(--font-instrument-sans)] leading-none">{compact(studyAnalytics.totalSignIns)}</p>
                </div>
                <div className="border border-emerald-500/20 p-4 bg-background/40">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-600/60 mb-1">IDENTIFIED STUDENTS</p>
                  <p className="text-3xl font-black text-emerald-600 font-[var(--font-instrument-sans)] leading-none flex items-center gap-2">
                     {compact(studyAnalytics.uniqueUsers)}
                     <Users className="h-5 w-5 opacity-40" />
                  </p>
                </div>
                <div className="border border-emerald-500/20 p-4 bg-background/40 sm:col-span-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-600/60 mb-3">ACTIVITY SPECTRUM // 7D</p>
                  <div className="grid grid-cols-7 gap-1.5 h-12">
                    {(studyAnalytics.last7Days || []).map((day) => (
                      <div key={day.date} className="relative group flex items-end h-full">
                        <div
                          className="w-full bg-emerald-500/20 border-t border-emerald-500/40 relative"
                          style={{
                            height: `${Math.max(15, (day.count / Math.max(...(studyAnalytics.last7Days || []).map((d) => d.count), 1)) * 100)}%`,
                            opacity: day.count > 0 ? 1 : 0.2
                          }}
                        >
                           {day.count > 0 && <div className="absolute inset-0 bg-emerald-400 group-hover:block hidden animate-pulse" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center border border-dashed border-emerald-500/20">
               <p className="text-[10px] font-black text-emerald-600/40 uppercase tracking-widest">NO TELEMETRY DISCOVERED</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── API Traffic Metrics ───────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
         <Card className="rounded-none border-border/40 bg-card/40 spotlight-card shadow-2xl">
            <CardHeader className="pb-4 border-b border-border/10">
               <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> BOT THROUGHPUT
               </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">TOTAL REQUESTS</span>
                     <p className="text-xl font-black text-foreground">{compact(analytics.totalRequests)}</p>
                  </div>
                  <div className="space-y-1">
                     <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">ACTIVE IDENTITIES</span>
                     <p className="text-xl font-black text-foreground">{compact(analytics.uniqueVisitors)}</p>
                  </div>
               </div>
               <div className="pt-4 border-t border-border/5 space-y-2">
                  <div className="flex justify-between items-center text-[10px]">
                     <span className="font-bold text-muted-foreground uppercase tracking-tighter">P95 LATENCY</span>
                     <span className="font-black text-primary">{compact(analytics.p95ResponseTimeMs)}ms</span>
                  </div>
                  <div className="h-1 bg-border/20 w-full rounded-none overflow-hidden">
                     <div className="h-full bg-primary" style={{ width: '85%' }} />
                  </div>
               </div>
            </CardContent>
         </Card>

         <Card className="rounded-none border-border/40 bg-card/40 spotlight-card shadow-2xl">
            <CardHeader className="pb-4 border-b border-border/10">
               <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <Activity className="h-4 w-4" /> RUNTIME STATUS
               </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
               <div className="grid grid-cols-2 gap-2">
                  {statusBreakdown.map((item) => (
                    <div key={item.label} className="border border-border/40 p-3 bg-muted/5 flex flex-col justify-between">
                      <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest">{item.label} FAMILY</span>
                      <p className={cn("text-lg font-black mt-1", item.color)}>{compact(item.value)}</p>
                    </div>
                  ))}
               </div>
            </CardContent>
         </Card>

         <Card className="rounded-none border-border/40 bg-card/40 spotlight-card shadow-2xl md:col-span-2 lg:col-span-1">
            <CardHeader className="pb-4 border-b border-border/10">
               <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <Laptop2 className="h-4 w-4" /> DEVICE SPECTRUM
               </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
               {[
                 { icon: Laptop2, label: 'DESKTOP', val: analytics.byDevice?.desktop },
                 { icon: Smartphone, label: 'MOBILE', val: analytics.byDevice?.mobile },
                 { icon: Tablet, label: 'TABLET', val: analytics.byDevice?.tablet }
               ].map((d) => (
                  <div key={d.label} className="flex items-center gap-4">
                     <d.icon className="h-4 w-4 text-muted-foreground/40" />
                     <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-end">
                           <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{d.label}</span>
                           <span className="text-[10px] font-black">{compact(d.val)}</span>
                        </div>
                        <div className="h-1 w-full bg-border/20 rounded-none overflow-hidden">
                           <div 
                              className="h-full bg-primary" 
                              style={{ width: `${(d.val / analytics.totalRequests) * 200}%` }} 
                           />
                        </div>
                     </div>
                  </div>
               ))}
            </CardContent>
         </Card>
      </div>

      <Card className="rounded-none border-border/40 bg-card/40 spotlight-card shadow-2xl">
        <CardHeader className="pb-4 border-b border-border/10">
          <CardTitle className="text-lg font-black uppercase tracking-[0.3em] text-primary font-[var(--font-instrument-sans)]">
             LIVE ACTIVITY FEED
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-y-auto overflow-x-hidden border-b border-border/10">
             {(analytics.recentRequests || []).slice(0, 30).map((row, idx) => (
               <div key={`${row.at}-${idx}`} className="grid grid-cols-[80px_1fr_120px] items-center gap-4 px-6 py-4 border-b border-border/5 hover:bg-primary/5 transition-colors group">
                  <div className={cn(
                     "text-[9px] font-black text-center py-1 border",
                     row.statusCode >= 400 ? "border-red-500/50 text-red-500 bg-red-500/5" : "border-emerald-500/50 text-emerald-500 bg-emerald-500/5"
                  )}>
                     HTTP {row.statusCode}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                     <p className="text-[11px] font-black text-foreground truncate uppercase tracking-widest group-hover:text-primary transition-colors">
                        {row.method} {row.route}
                     </p>
                     <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter opacity-40">
                        VIA {row.referrer || 'DIRECT LINK'} • {row.ip || '0.0.0.0'}
                     </p>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] font-black text-foreground">{compact(row.durationMs)}ms</p>
                     <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{new Date(row.at).toLocaleTimeString([], { hour12: false })}</p>
                  </div>
               </div>
             ))}
          </div>
          <div className="p-4 bg-muted/5 flex justify-between items-center">
             <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">TELEMETRY STREAM ACTIVE</span>
             <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">PAGE SIZE: 30</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
