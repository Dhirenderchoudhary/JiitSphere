'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronRight, BookOpen, Download, RotateCcw, Sparkles,
  FileText, StickyNote, ClipboardList, PenTool, Layers,
  GraduationCap, Calendar, GitBranch, BookMarked, ArrowRight, AlertTriangle
} from 'lucide-react';
import CollegeBrand from 'components/CollegeBrand';
import SignOutButton from 'components/SignOutButton';
import TopPanelTools from 'components/TopPanelTools';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { fetchBrowseOptions, fetchFilterOptions, fetchMaterials } from 'lib/api';

/* ── constants ──────────────────────────────────────────────── */
const GUEST_DOWNLOAD_LIMIT = 5;
const STORAGE_KEY = 'guest_downloads';

const YEAR_META = {
  1: { label: '1st Year', sub: 'Foundation courses', icon: '🎯' },
  2: { label: '2nd Year', sub: 'Core subjects', icon: '📚' },
  3: { label: '3rd Year', sub: 'Advanced topics', icon: '🚀' },
  4: { label: '4th Year', sub: 'Specializations', icon: '🎓' },
};
const SEM_LABELS = { 1: 'Sem 1', 2: 'Sem 2', 3: 'Sem 3', 4: 'Sem 4', 5: 'Sem 5', 6: 'Sem 6', 7: 'Sem 7', 8: 'Sem 8' };

const RESOURCE_TYPES = {
  Slides: {
    icon: Layers,
    gradient: 'from-blue-500 to-blue-600',
    bg: 'bg-blue-500/8 dark:bg-blue-500/15',
    border: 'border-blue-500/25 dark:border-blue-400/20',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    cardHover: 'hover:border-blue-400/50',
    description: 'Presentation slides from lectures',
  },
  Lectures: {
    icon: BookOpen,
    gradient: 'from-violet-500 to-purple-600',
    bg: 'bg-violet-500/8 dark:bg-violet-500/15',
    border: 'border-violet-500/25 dark:border-violet-400/20',
    text: 'text-violet-700 dark:text-violet-300',
    badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    cardHover: 'hover:border-violet-400/50',
    description: 'Detailed lecture notes & recordings',
  },
  Tutorials: {
    icon: PenTool,
    gradient: 'from-emerald-500 to-green-600',
    bg: 'bg-emerald-500/8 dark:bg-emerald-500/15',
    border: 'border-emerald-500/25 dark:border-emerald-400/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    cardHover: 'hover:border-emerald-400/50',
    description: 'Practice problems & tutorial sheets',
  },
  PYQs: {
    icon: ClipboardList,
    gradient: 'from-amber-500 to-orange-600',
    bg: 'bg-amber-500/8 dark:bg-amber-500/15',
    border: 'border-amber-500/25 dark:border-amber-400/20',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    cardHover: 'hover:border-amber-400/50',
    description: 'Previous year question papers',
  },
  Solutions: {
    icon: StickyNote,
    gradient: 'from-rose-500 to-pink-600',
    bg: 'bg-rose-500/8 dark:bg-rose-500/15',
    border: 'border-rose-500/25 dark:border-rose-400/20',
    text: 'text-rose-700 dark:text-rose-300',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    cardHover: 'hover:border-rose-400/50',
    description: 'Answer keys & solved papers',
  },
};

const TYPE_ORDER = ['Slides', 'Lectures', 'Tutorials', 'PYQs', 'Solutions'];
const STEP_ICONS = { year: Calendar, semester: GraduationCap, branch: GitBranch, subject: BookMarked };

/* ── guest helpers ──────────────────────────────────────────── */
function getGuestDownloads() {
  try { return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10); } catch { return 0; }
}
function incrementGuestDownloads() {
  const count = getGuestDownloads() + 1;
  try { localStorage.setItem(STORAGE_KEY, String(count)); } catch { /* noop */ }
  return count;
}
async function triggerDownload(url, fallbackName) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fallbackName || url.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}

/* ── step flow ──────────────────────────────────────────────── */
const STEPS = ['year', 'semester', 'branch', 'subject'];

export default function StudyMaterialClient({ user = null, isGuest = false }) {
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({ degree: 'BTech' });
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [optionsRefreshKey, setOptionsRefreshKey] = useState(0);
  const [supportsRichEffects, setSupportsRichEffects] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [downloadsUsed, setDownloadsUsed] = useState(() => (isGuest ? getGuestDownloads() : 0));

  const limitReached = isGuest && downloadsUsed >= GUEST_DOWNLOAD_LIMIT;
  const currentStepIndex = STEPS.findIndex((key) => !filters[key]);
  const currentStep = currentStepIndex === -1 ? 'done' : STEPS[currentStepIndex];
  const allSelected = currentStep === 'done';

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
    const update = () => setSupportsRichEffects(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  const handleSpotlightMove = useCallback((e) => {
    if (!supportsRichEffects) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  }, [supportsRichEffects]);

  /* ── data fetching ────────────────────────────────────────── */
  useEffect(() => {
    setOptionsLoading(true);
    setOptionsError('');

    fetchFilterOptions()
      .then((data) => setOptions(data.data || {}))
      .catch((error) => {
        setOptions({});
        setOptionsError(error?.message || 'Failed to load filter options.');
      })
      .finally(() => {
        setOptionsLoading(false);
      });
  }, [optionsRefreshKey]);

  useEffect(() => {
    if (!filters.year) return;

    setOptionsError('');

    fetchBrowseOptions({ degree: filters.degree, year: filters.year, semester: filters.semester, branch: filters.branch, subject: filters.subject })
      .then((data) => setOptions((prev) => ({ ...prev, ...(data.data || {}) })))
      .catch((error) => {
        setOptionsError(error?.message || 'Failed to load browse options.');
      });
  }, [filters.degree, filters.year, filters.semester, filters.branch, filters.subject]);

  const loadMaterials = useCallback(async (f) => {
    setLoading(true);
    try {
      const response = await fetchMaterials({ ...f, limit: 200 });
      setMaterials(response.data || []);
    } catch {
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allSelected) {
      loadMaterials(filters);
      setActiveTab(null); // reset tab when subject changes
    } else {
      setMaterials([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.year, filters.semester, filters.branch, filters.subject, allSelected]);

  /* ── handlers ─────────────────────────────────────────────── */
  const selectOption = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: key === 'year' || key === 'semester' ? Number(value) : value };
      const stepIdx = STEPS.indexOf(key);
      for (let i = stepIdx + 1; i < STEPS.length; i++) delete next[STEPS[i]];
      return next;
    });
  };

  const goBackTo = (key) => {
    setFilters((prev) => {
      const next = { ...prev };
      const stepIdx = STEPS.indexOf(key);
      for (let i = stepIdx; i < STEPS.length; i++) delete next[STEPS[i]];
      return next;
    });
    setMaterials([]);
    setActiveTab(null);
  };

  const resetAll = () => {
    setFilters({ degree: 'BTech' });
    setMaterials([]);
    setActiveTab(null);
  };

  /* ── group materials ──────────────────────────────────────── */
  const grouped = {};
  materials.forEach((m) => {
    const type = m.resourceType || 'Other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(m);
  });
  const sortedTypes = [...TYPE_ORDER.filter((t) => grouped[t]), ...Object.keys(grouped).filter((t) => !TYPE_ORDER.includes(t))];

  // Set default active tab once materials load
  useEffect(() => {
    if (sortedTypes.length > 0 && activeTab === null) {
      setActiveTab(sortedTypes[0]);
    }
  }, [sortedTypes.length, activeTab, sortedTypes]);

  /* ── option lists ─────────────────────────────────────────── */
  const optionMap = {
    year: (options.years || []).map((v) => ({ value: v, ...(YEAR_META[v] || { label: `Year ${v}`, sub: '', icon: '📖' }) })),
    semester: (options.semesters || []).map((v) => ({ value: v, label: SEM_LABELS[v] || `Semester ${v}` })),
    branch: (options.branches || []).map((v) => ({ value: v, label: v })),
    subject: (options.subjects || []).map((v) => ({ value: v, label: v })),
  };

  const stepPrompts = { year: 'Which year are you in?', semester: 'Pick your semester', branch: 'Choose your branch', subject: 'Select a subject' };
  const stepSubtext = { year: 'Select your current academic year', semester: 'Which semester are you studying?', branch: 'Your specialization', subject: `${(optionMap.subject || []).length} subjects available` };

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8 pb-16">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <CollegeBrand />
        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/75 dark:bg-card/75 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
              {user.image && <Image src={user.image} alt={user.name || 'User'} width={22} height={22} className="rounded-full" unoptimized />}
              <span className="max-w-[160px] truncate text-muted-foreground">{user.email}</span>
              <SignOutButton />
            </div>
          ) : isGuest ? (
            <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/50 px-3 py-1.5 text-xs font-medium shadow-sm">
              <span className="text-amber-700 dark:text-amber-300">Guest Mode</span>
            </div>
          ) : null}
          <TopPanelTools />
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="mesh-overlay relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-[#0f5d88] p-6 text-white shadow-glow md:p-8">
        <div className="absolute inset-0 dot-grid opacity-[0.08]" />
        <div className="relative z-10">
          <p className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] backdrop-blur-sm">
            <Sparkles className="mr-2 h-3.5 w-3.5" /> JIIT Study Hub
          </p>
          <h2 className="mt-3 font-[var(--font-archivo)] text-2xl font-black leading-tight md:text-3xl">
            Tap through to find your material
          </h2>
          <p className="mt-1.5 flex items-center gap-2 text-sm text-white/60">
            {STEPS.map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <ArrowRight className="h-3 w-3 text-white/30" />}
                <span className={filters[s] ? 'text-white font-semibold' : ''}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* ── Breadcrumb trail ────────────────────────────────────── */}
      {STEPS.some((k) => filters[k]) && (
        <nav className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/80 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <button onClick={resetAll} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          {STEPS.map((key) => {
            if (!filters[key]) return null;
            const StepIcon = STEP_ICONS[key];
            const label = key === 'year' ? (YEAR_META[filters[key]]?.label || `Year ${filters[key]}`) : key === 'semester' ? (SEM_LABELS[filters[key]] || `Sem ${filters[key]}`) : filters[key];
            return (
              <span key={key} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <button
                  onClick={() => goBackTo(key)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 font-semibold text-primary transition hover:bg-primary/20"
                >
                  <StepIcon className="h-3 w-3" /> {label}
                </button>
              </span>
            );
          })}
        </nav>
      )}

      {/* ── Step selection ──────────────────────────────────────── */}
      {!allSelected && (
        <section className="mt-6">
          <div className="mb-4">
            <h3 className="text-xl font-black">{stepPrompts[currentStep]}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{stepSubtext[currentStep]}</p>
          </div>

          {optionsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite" aria-busy="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl border border-border bg-card/70" />
              ))}
            </div>
          ) : null}

          {!optionsLoading && optionsError ? (
            <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Unable to load options</p>
                  <p className="mt-0.5 text-xs opacity-90">{optionsError}</p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setOptionsRefreshKey((key) => key + 1)}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {/* Year cards — big, visual */}
          {!optionsLoading && currentStep === 'year' && (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              {optionMap.year.map((opt, i) => (
                <button
                  key={opt.value}
                  onClick={() => selectOption('year', opt.value)}
                  aria-label={`Select ${opt.label}`}
                  className={`spotlight-card gradient-border group relative rounded-2xl bg-card p-5 text-left shadow-sm transition-all duration-200 hover:shadow-lg hover:scale-[1.03] active:scale-[0.98] ${supportsRichEffects ? 'stagger-item' : ''}`}
                  style={{ animationDelay: `${i * 80}ms` }}
                  onMouseMove={supportsRichEffects ? handleSpotlightMove : undefined}
                >
                  <span className="text-3xl">{opt.icon}</span>
                  <p className="mt-3 text-base font-black group-hover:text-primary transition-colors">{opt.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{opt.sub}</p>
                  <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground/30 transition-all group-hover:text-primary group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}

          {/* Semester — pill buttons */}
          {!optionsLoading && currentStep === 'semester' && (
            <div className="flex flex-wrap gap-3">
              {optionMap.semester.map((opt, i) => (
                <button
                  key={opt.value}
                  onClick={() => selectOption('semester', opt.value)}
                  aria-label={`Select ${opt.label}`}
                  className={`group relative rounded-xl border border-border bg-card px-6 py-3 font-bold shadow-sm transition-all duration-200 hover:border-primary hover:shadow-md hover:scale-[1.04] active:scale-[0.97] ${supportsRichEffects ? 'stagger-item' : ''}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="group-hover:text-primary transition-colors">{opt.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Branch — colored cards */}
          {!optionsLoading && currentStep === 'branch' && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {optionMap.branch.map((opt, i) => (
                <button
                  key={opt.value}
                  onClick={() => selectOption('branch', opt.value)}
                  aria-label={`Select branch ${opt.label}`}
                  className={`spotlight-card group relative overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:border-primary hover:shadow-lg hover:scale-[1.03] active:scale-[0.98] ${supportsRichEffects ? 'stagger-item' : ''}`}
                  style={{ animationDelay: `${i * 70}ms` }}
                  onMouseMove={supportsRichEffects ? handleSpotlightMove : undefined}
                >
                  <GitBranch className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <p className="mt-2 text-sm font-black group-hover:text-primary transition-colors">{opt.label}</p>
                  <ArrowRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground/20 group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}

          {/* Subject — list-style cards */}
          {!optionsLoading && currentStep === 'subject' && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {optionMap.subject.map((opt, i) => (
                <button
                  key={opt.value}
                  onClick={() => selectOption('subject', opt.value)}
                  aria-label={`Select subject ${opt.label}`}
                  className={`group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary hover:shadow-md hover:bg-primary/5 ${supportsRichEffects ? 'stagger-item' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BookMarked className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-bold group-hover:text-primary transition-colors">{opt.label}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition group-hover:text-primary" />
                </button>
              ))}
            </div>
          )}

          {!optionsLoading && (optionMap[currentStep] || []).length === 0 && !optionsError && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
              <p className="text-sm text-muted-foreground">No options available for this selection yet. Try another filter or refresh.</p>
            </div>
          )}
        </section>
      )}

      {/* ── Materials — tabbed by resource type ─────────────────── */}
      {allSelected && (
        <section className="mt-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-3 text-sm text-muted-foreground">Loading materials…</p>
            </div>
          ) : sortedTypes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No materials found for <strong>{filters.subject}</strong>.</p>
            </div>
          ) : (
            <>
              {/* Guest banner */}
              {isGuest && (
                <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${limitReached ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                  {limitReached ? 'Download limit reached. Sign in for unlimited.' : `Guest: ${downloadsUsed}/${GUEST_DOWNLOAD_LIMIT} downloads used.`}
                </div>
              )}

              {/* Resource type tabs */}
              <div className="mb-5 flex flex-wrap gap-2">
                {sortedTypes.map((type) => {
                  const meta = RESOURCE_TYPES[type] || RESOURCE_TYPES.Slides;
                  const Icon = meta.icon;
                  const isActive = activeTab === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setActiveTab(type)}
                      aria-label={`View ${type} materials`}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
                        isActive
                          ? `${meta.border} ${meta.bg} ${meta.text} shadow-sm scale-[1.02]`
                          : 'border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {type}
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${isActive ? meta.badge : 'bg-muted text-muted-foreground'}`}>
                        {grouped[type]?.length || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active tab content */}
              {activeTab && grouped[activeTab] && (() => {
                const meta = RESOURCE_TYPES[activeTab] || RESOURCE_TYPES.Slides;
                const Icon = meta.icon;
                const items = grouped[activeTab];

                return (
                  <div>
                    {/* Section header with gradient accent */}
                    <div className={`mb-4 flex items-center gap-3 rounded-xl ${meta.bg} border ${meta.border} px-4 py-3`}>
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${meta.gradient} text-white shadow-sm`}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className={`text-sm font-black ${meta.text}`}>{activeTab}</p>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                      </div>
                      <Badge className={`ml-auto ${meta.badge} border-0`}>{items.length} {items.length === 1 ? 'file' : 'files'}</Badge>
                    </div>

                    {/* File grid */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((item, i) => (
                        <div
                          key={item._id}
                          className={`spotlight-card group rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 ${meta.cardHover} hover:shadow-md ${supportsRichEffects ? 'stagger-item' : ''}`}
                          style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                          onMouseMove={supportsRichEffects ? handleSpotlightMove : undefined}
                        >
                          <div className="mb-3">
                            <h4 className="line-clamp-2 text-sm font-bold leading-snug">{item.title}</h4>
                            <Badge variant="outline" className="mt-1.5 text-[10px] px-1.5 py-0 font-medium">{item.fileType?.toUpperCase()}</Badge>
                          </div>
                          <div className="flex gap-2">
                            <Link href={`/material/${item._id}`} className="flex-1">
                              <Button className="w-full" size="sm" variant="secondary">
                                <BookOpen className="mr-1.5 h-3.5 w-3.5" /> View
                              </Button>
                            </Link>
                            {limitReached ? (
                              <Button size="sm" disabled className="flex-1">
                                <Download className="mr-1.5 h-3.5 w-3.5" /> Limit
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  if (isGuest) setDownloadsUsed(incrementGuestDownloads());
                                  triggerDownload(item.fileUrl, `${item.title || item.subject}.${item.fileType}`);
                                }}
                              >
                                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </section>
      )}
    </main>
  );
}
