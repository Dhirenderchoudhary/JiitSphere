'use client';

import { useState, useEffect } from 'react';
import { Lock, LogOut, Upload, CheckCircle2, AlertCircle, FileUp, Sparkles } from 'lucide-react';
import CollegeBrand from 'components/CollegeBrand';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { Input } from 'components/ui/input';
import { Badge } from 'components/ui/badge';

const DEGREE_OPTIONS = ['BTech', 'MTech', 'BCA', 'MCA'];
const BRANCH_OPTIONS = ['CSE', 'ECE', 'IT', 'EE', 'ME', 'CE', 'BIO', 'AIML', 'ECM', 'CYBER SECURITY'];
const YEAR_OPTIONS = [1, 2, 3, 4, 5];
const SEMESTER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RESOURCE_TYPE_OPTIONS = ['Slides', 'Lectures', 'Tutorials', 'PYQs', 'Solutions'];

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

/* ── Admin Login ─────────────────────────────────────────────── */
function AdminLogin({ onSuccess }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Login failed');
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Restricted Area</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight">Admin Login</h1>
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
                <label htmlFor="admin-id" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admin ID</label>
                <Input id="admin-id" placeholder="Enter admin ID" value={id} onChange={(e) => setId(e.target.value)} required autoComplete="username" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="admin-password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</label>
                <Input id="admin-password" type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
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

/* ── Combo Field (select + custom input) ─────────────────────── */
function ComboField({ label, value, onChange, options, placeholder }) {
  const [custom, setCustom] = useState(false);
  const isCustom = custom || (value && !options.includes(value) && !options.map(String).includes(String(value)));

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      {isCustom ? (
        <div className="flex gap-1.5">
          <Input placeholder={`Enter ${label}`} value={value} onChange={(e) => onChange(e.target.value)} required className="flex-1" />
          <button type="button" onClick={() => { setCustom(false); onChange(''); }}
            className="shrink-0 rounded-xl border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted transition">
            List
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
            className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{placeholder || `Select ${label}`}</option>
            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <button type="button" onClick={() => { setCustom(true); onChange(''); }}
            className="shrink-0 rounded-xl border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted transition"
            title={`Add new ${label}`}>
            + New
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Admin Page ─────────────────────────────────────────── */
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [form, setForm] = useState({
    title: '', degree: '', branch: '', year: '', semester: '', subject: '', resourceType: ''
  });
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (getCookie('admin_auth') === '1') setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api/v1'}/materials/filters/options`)
      .then((r) => r.json())
      .then((d) => { if (d.data?.subjects) setSubjects(d.data.subjects); })
      .catch(() => {});
  }, [authed]);

  const handleLogout = async () => {
    await fetch('/api/auth/admin', { method: 'DELETE' });
    setAuthed(false);
  };

  if (!authed) return <AdminLogin onSuccess={() => setAuthed(true)} />;

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const filledCount = Object.values(form).filter(Boolean).length;

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');
    setLoading(true);
    setUploadProgress(10);

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    payload.append('file', file);

    try {
      setUploadProgress(40);
      const response = await fetch('/api/admin/upload', { method: 'POST', body: payload });
      setUploadProgress(80);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Upload failed');
      setUploadProgress(100);
      setMessage('Material uploaded successfully!');
      setMessageType('success');
      setFile(null);
      // Reset form after success
      setTimeout(() => setUploadProgress(0), 2000);
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell max-w-3xl py-7">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <CollegeBrand />
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground gap-1.5">
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </div>

      {/* Title section */}
      <div className="mesh-overlay relative mb-5 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-[#0f5d88] p-5 text-white shadow-glow md:p-6">
        <div className="absolute inset-0 dot-grid opacity-[0.06]" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black">Upload Study Material</h2>
            <p className="text-sm text-white/60">Add notes, slides, PYQs, and more for students</p>
          </div>
          {filledCount > 0 && (
            <Badge className="ml-auto bg-white/20 text-white border-0">{filledCount}/7 fields</Badge>
          )}
        </div>
      </div>

      {/* Upload form */}
      <Card className="gradient-border bg-card/95 backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</label>
              <Input placeholder="e.g. Unit 1 - Introduction to OS" value={form.title} onChange={(e) => set('title', e.target.value)} required />
            </div>

            {/* Row 1: Degree + Branch */}
            <div className="grid gap-4 md:grid-cols-2">
              <ComboField label="Degree" value={form.degree} onChange={(v) => set('degree', v)} options={DEGREE_OPTIONS} />
              <ComboField label="Branch" value={form.branch} onChange={(v) => set('branch', v)} options={BRANCH_OPTIONS} />
            </div>

            {/* Row 2: Year + Semester */}
            <div className="grid gap-4 md:grid-cols-2">
              <ComboField label="Year" value={form.year} onChange={(v) => set('year', v)} options={YEAR_OPTIONS} />
              <ComboField label="Semester" value={form.semester} onChange={(v) => set('semester', v)} options={SEMESTER_OPTIONS} />
            </div>

            {/* Row 3: Subject + Resource Type */}
            <div className="grid gap-4 md:grid-cols-2">
              <ComboField label="Subject" value={form.subject} onChange={(v) => set('subject', v)} options={subjects} />
              <ComboField label="Resource Type" value={form.resourceType} onChange={(v) => set('resourceType', v)} options={RESOURCE_TYPE_OPTIONS} />
            </div>

            {/* File upload area */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">File</label>
              <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/20 p-6 transition-all hover:border-primary hover:bg-primary/5">
                <FileUp className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <p className="mt-2 text-sm font-bold group-hover:text-primary transition-colors">
                  {file ? file.name : 'Click to upload a file'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'PDF, PPT, DOC, XLS, or any document'}
                </p>
                <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} required={!file} />
              </label>
            </div>

            {/* Progress bar */}
            {uploadProgress > 0 && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <><span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Uploading...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Upload Material</>
              )}
            </Button>
          </form>

          {/* Status message */}
          {message && (
            <div className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
              messageType === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300'
            }`}>
              {messageType === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              {message}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
