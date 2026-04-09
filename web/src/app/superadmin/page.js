'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Shield, LogOut, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { Input } from 'components/ui/input';

const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false });
const LineChart = dynamic(() => import('recharts').then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });

const fmt = (n) => Number(n || 0).toLocaleString();

const COLORS = ['#34d399', '#60a5fa', '#f87171', '#fbbf24', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9'];

function aggregate(days, count) {
  const slice = days.slice(-count);
  return {
    visitors: slice.reduce((s, d) => s + d.visitors, 0),
    portalVisitors: slice.reduce((s, d) => s + (d.portalVisitors || 0), 0),
    studyMaterialVisitors: slice.reduce((s, d) => s + (d.studyMaterialVisitors || 0), 0),
    pageViews: slice.reduce((s, d) => s + d.views, 0)
  };
}

/* ───────── STAT CARD ───────── */
function StatCard({ title, value, accent }) {
  return (
    <div className="spotlight-card rounded-2xl border border-border bg-card/95 p-5 backdrop-blur">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className={`mt-1 text-3xl font-extrabold ${accent || 'text-primary'}`}>{value}</p>
    </div>
  );
}

/* ───────── CHART CARD ───────── */
function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-border bg-card/95 p-5 backdrop-blur">
      <h3 className="text-lg font-bold">{title}</h3>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* ───────── CUSTOM TOOLTIP ───────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-muted-foreground">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-mono">{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

/* ───────── BAR ROW ───────── */
function BarRow({ label, value, max, color = '#34d399' }) {
  const w = max ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">{label}</span>
      <div className="flex-1">
        <div className="h-5 rounded" style={{ width: `${w}%` }}>
          <div className="h-5 rounded" style={{ backgroundColor: color }} />
        </div>
      </div>
      <span className="w-12 text-right font-mono text-xs text-muted-foreground">{fmt(value)}</span>
    </div>
  );
}

/* ───────── LOGIN ───────── */
function LoginView({ onLogin }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/superadmin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Login failed');
      onLogin(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Restricted Area</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight">Superadmin</h1>
          </div>
        </div>

        <Card className="gradient-border bg-card/95 backdrop-blur shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)]">
          <CardContent className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/50 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="superadmin-id" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admin ID</label>
                <Input id="superadmin-id" placeholder="Enter admin ID" value={id} onChange={(e) => setId(e.target.value)} required autoComplete="username" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="superadmin-password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</label>
                <Input id="superadmin-password" type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Verifying...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/* ───────── DASHBOARD ───────── */
function Dashboard({ token, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('Last 7 days');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/superadmin/analytics', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok || !json.success) { if (res.status === 401) onLogout(); return; }
      setData(json.data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [token, onLogout]);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 30000); return () => clearInterval(t); }, [fetchData]);

  if (loading) return <main className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground animate-pulse">Loading analytics...</p></main>;
  if (!data) return <main className="flex min-h-screen items-center justify-center"><p className="text-red-500">Failed to load analytics</p></main>;

  const days30 = data.pv?.last30Days || [];
  const periodSlice = period === 'Last 7 days' ? 7 : period === 'Last 30 days' ? 30 : 1;
  const periodDays = days30.slice(-periodSlice);
  const agg = aggregate(days30, periodSlice);

  const chartData = periodDays.map((d) => ({
    date: d.date.slice(5),
    Visitors: d.visitors,
    Portal: d.portalVisitors || 0,
    'Study Material': d.studyMaterialVisitors || 0,
    'Page Views': d.views
  }));

  const browserData = (data.pv?.topBrowsers || []).filter((b) => b.count > 0).map((b) => ({ name: b.name, value: b.count }));
  const osData = (data.pv?.topOs || []).filter((o) => o.count > 0).map((o) => ({ name: o.name, value: o.count }));
  const deviceData = Object.entries(data.pv?.byDevice || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const referrerData = (data.pv?.topReferrers || []).filter((r) => r.count > 0);
  const maxRef = referrerData.length ? Math.max(...referrerData.map((r) => r.count)) : 1;

  const pvSection = data.pv?.sectionVisitors || {};
  const materials = data.materials || {};

  const hourlyData = (data.pv?.last24Hours || []).map((h) => ({ time: `${h.hour}:00`, Visitors: h.visitors || 0, Views: h.views || 0 }));

  return (
    <main className="page-shell min-h-screen py-5 sm:py-6">
      {/* Header */}
      <header className="sticky top-0 z-30 mb-5 rounded-2xl border border-border bg-card/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <button onClick={() => window.history.back()} className="text-muted-foreground hover:text-foreground transition">&larr;</button>
            <h1 className="text-lg font-bold">JiitSphere</h1>
          </div>
          <div className="flex items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              className="rounded-xl border border-input bg-background px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option>Today</option>
              <option>Last 7 days</option>
              <option>Last 30 days</option>
            </select>
            <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={onLogout} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-6 pb-20">
        {/* Title Banner */}
        <div className="mesh-overlay relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-glow md:p-6">
          <div className="absolute inset-0 dot-grid opacity-[0.06]" />
          <div className="relative z-10">
            <h2 className="text-2xl font-extrabold">Web Analytics Dashboard</h2>
            <p className="text-sm text-white/60">Tracking since {data.startedAt?.slice(0, 10)} &middot; Auto-refreshes every 30s</p>
          </div>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard title="Total Visitors" value={fmt(agg.visitors)} />
          <StatCard title="Total Page Views" value={fmt(agg.pageViews)} />
          <StatCard title="Portal Visitors" value={fmt(agg.portalVisitors)} />
          <StatCard title="Study Material Visitors" value={fmt(agg.studyMaterialVisitors)} />
        </div>

        {/* All-time section visitors */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'All-time Visitors', val: data.pv?.totalVisitors || 0 },
            { label: 'Portal (all-time)', val: pvSection.portal || 0 },
            { label: 'Study Material (all-time)', val: pvSection.studyMaterial || 0 },
            { label: 'Materials Uploaded', val: materials.total || 0 }
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card/95 px-4 py-3 backdrop-blur">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold">{fmt(s.val)}</p>
            </div>
          ))}
        </div>

        {/* Visitors Over Time */}
        <ChartCard title="Visitors Over Time" subtitle={`Total visitor count — ${period.toLowerCase()}`}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="Visitors" stroke="#34d399" strokeWidth={2} fill="url(#gVisitors)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Page Views Over Time */}
        <ChartCard title="Page Views Over Time" subtitle={`Total page view count — ${period.toLowerCase()}`}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gPageViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="Page Views" stroke="#60a5fa" strokeWidth={2} fill="url(#gPageViews)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Portal vs Study Material Visitors */}
        <ChartCard title="Section Visitors Over Time" subtitle="Portal vs Study Material unique visitors">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="Portal" stroke="#34d399" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Study Material" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span><span className="mr-1.5 inline-block h-2 w-4 rounded" style={{ background: '#34d399' }} />Portal</span>
            <span><span className="mr-1.5 inline-block h-2 w-4 rounded" style={{ background: '#60a5fa' }} />Study Material</span>
          </div>
        </ChartCard>

        {/* Browser & OS Donut Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Browser Distribution" subtitle="Breakdown of visitors by browser">
            <div className="flex flex-col items-center">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={browserData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" stroke="none">
                      {browserData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 w-full space-y-1.5">
                {browserData.map((b, i) => {
                  const maxB = Math.max(...browserData.map((x) => x.value));
                  return <BarRow key={b.name} label={b.name} value={b.value} max={maxB} color={COLORS[i % COLORS.length]} />;
                })}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Operating System Distribution" subtitle="Breakdown of visitors by operating system">
            <div className="flex flex-col items-center">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={osData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" stroke="none">
                      {osData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 w-full space-y-1.5">
                {osData.map((o, i) => {
                  const maxO = Math.max(...osData.map((x) => x.value));
                  return <BarRow key={o.name} label={o.name} value={o.value} max={maxO} color={COLORS[i % COLORS.length]} />;
                })}
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Device Distribution */}
        <ChartCard title="Device Distribution" subtitle="Breakdown of visitors by device type">
          <div className="flex flex-col items-center">
            <div className="h-64 w-full max-w-md mx-auto">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deviceData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" stroke="none">
                    {deviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 w-full max-w-md space-y-1.5">
              {deviceData.map((d, i) => {
                const maxD = Math.max(...deviceData.map((x) => x.value));
                return <BarRow key={d.name} label={d.name} value={d.value} max={maxD} color={COLORS[i % COLORS.length]} />;
              })}
            </div>
          </div>
        </ChartCard>

        {/* Hourly Visitors */}
        <ChartCard title="Visitors by Hour" subtitle="Unique visitors per hour — last 24 hours">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="gHourly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="Visitors" stroke="#fbbf24" strokeWidth={2} fill="url(#gHourly)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Referrers */}
        <ChartCard title="Top Referrers" subtitle="Where visitors are coming from">
          <div className="space-y-2">
            {referrerData.length ? referrerData.map((r) => (
              <BarRow key={r.source} label={r.source} value={r.count} max={maxRef} color="bg-violet-500" />
            )) : <p className="text-sm text-muted-foreground">No referrer data yet.</p>}
          </div>
        </ChartCard>

        {/* Top Pages */}
        {(data.pv?.topPages || []).length > 0 && (
          <ChartCard title="Top Pages" subtitle="Most visited pages">
            <div className="space-y-2">
              {(data.pv.topPages || []).map((p) => (
                <BarRow key={p.page} label={p.page} value={p.count} max={data.pv.topPages[0]?.count || 1} color="bg-cyan-500" />
              ))}
            </div>
          </ChartCard>
        )}

        {/* Materials Stats */}
        {materials.total > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Materials by Degree" subtitle={`${fmt(materials.total)} total uploaded`}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={(materials.byDegree || []).map((d) => ({ name: d.name, value: d.count }))} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" nameKey="name" stroke="none">
                      {(materials.byDegree || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1">
                {(materials.byDegree || []).map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{d.name}</span>
                    <span className="font-mono font-bold text-muted-foreground">{fmt(d.count)}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
            <ChartCard title="Materials by Type" subtitle="Resource type breakdown">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={(materials.byType || []).map((t) => ({ name: t.name, value: t.count }))} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" nameKey="name" stroke="none">
                      {(materials.byType || []).map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1">
                {(materials.byType || []).map((t, i) => (
                  <div key={t.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[(i + 3) % COLORS.length] }} />{t.name}</span>
                    <span className="font-mono font-bold text-muted-foreground">{fmt(t.count)}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        )}
      </div>
    </main>
  );
}

/* ───────── MAIN ───────── */
export default function SuperadminPage() {
  const [token, setToken] = useState(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('superadmin_token');
    if (saved) setToken(saved);
  }, []);

  const handleLogin = (t) => { sessionStorage.setItem('superadmin_token', t); setToken(t); };
  const handleLogout = () => { sessionStorage.removeItem('superadmin_token'); setToken(null); };

  if (!token) return <LoginView onLogin={handleLogin} />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}
