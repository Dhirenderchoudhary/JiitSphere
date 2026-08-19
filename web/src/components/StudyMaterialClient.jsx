'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  BookOpen,
  Download,
  RotateCcw,
  Sparkles,
  FileText,
  StickyNote,
  ClipboardList,
  PenTool,
  Layers,
  GraduationCap,
  Calendar,
  GitBranch,
  BookMarked,
  ArrowRight,
  AlertTriangle,
  Target,
  LibraryBig,
  Rocket,
  LogOut,
} from 'lucide-react';
import CollegeBrand from 'components/CollegeBrand';
import SignOutButton from 'components/SignOutButton';
import TopPanelTools from 'components/TopPanelTools';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { fetchBrowseOptions, fetchFilterOptions, fetchMaterials, materialAccessUrl } from 'lib/api';
import { toast } from 'sonner';

/* ── constants ──────────────────────────────────────────────── */
const MATERIAL_PAGE_SIZE = 24;

const YEAR_META = {
  1: { label: '1st Year', sub: 'Foundation courses', icon: Target },
  2: { label: '2nd Year', sub: 'Core subjects', icon: LibraryBig },
  3: { label: '3rd Year', sub: 'Advanced topics', icon: Rocket },
  4: { label: '4th Year', sub: 'Specializations', icon: GraduationCap },
};
const SEM_LABELS = {
  1: 'Sem 1',
  2: 'Sem 2',
  3: 'Sem 3',
  4: 'Sem 4',
  5: 'Sem 5',
  6: 'Sem 6',
  7: 'Sem 7',
  8: 'Sem 8',
};

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

/**
 * Selected tab when the server could not tell us which resource types exist.
 * In that mode materials are fetched unfiltered and the tabs fall back to
 * whatever types the loaded page happens to contain.
 */
const ALL_TYPES = '__all__';

const STEP_ICONS = {
  year: Calendar,
  semester: GraduationCap,
  branch: GitBranch,
  subject: BookMarked,
};

function saveBlob(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 150);
}

/**
 * Fetching the file as a blob is what makes the browser honour `filename`, but
 * the CDN does not send CORS headers, so the fetch can be blocked outright.
 * Fall back to a plain navigation, which always works — the user just gets the
 * CDN's own filename.
 */
async function triggerDownload(url, fallbackName) {
  const filename = fallbackName || url.split('/').pop() || 'download';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Download failed');
    saveBlob(await res.blob(), filename);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Open a connection to the file CDN as soon as we know where the files live.
 *
 * DNS, TCP and TLS to the CDN would otherwise only start once the viewer page
 * has rendered and the iframe begins loading. Doing it here moves that setup —
 * easily a few hundred ms on mobile — off the critical path, and it costs no
 * bandwidth, unlike prefetching the files themselves.
 */
function usePreconnectToFileHost(materials) {
  const originRef = useRef('');

  useEffect(() => {
    const fileUrl = materials.find((item) => item?.fileUrl)?.fileUrl;
    if (!fileUrl) return undefined;

    let origin;
    try {
      origin = new URL(fileUrl).origin;
    } catch {
      return undefined;
    }

    if (origin === window.location.origin || origin === originRef.current) return undefined;
    originRef.current = origin;

    const links = ['preconnect', 'dns-prefetch'].map((rel) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (rel === 'preconnect') link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      return link;
    });

    return () => links.forEach((link) => link.remove());
  }, [materials]);
}

/* ── step flow ──────────────────────────────────────────────── */
const STEPS = ['year', 'semester', 'branch', 'subject'];

export default function StudyMaterialClient({ user = null, isGuest = false }) {
  const router = useRouter();
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({ degree: 'BTech' });
  const [materials, setMaterials] = useState([]);
  const [materialsError, setMaterialsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [browseOptionsLoading, setBrowseOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [optionsRefreshKey, setOptionsRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState(null);
  // The resourceType actually sent to the API. Normally tracks activeTab, but
  // stays ALL_TYPES when the server could not tell us which types exist, so
  // clicking a tab in that mode filters locally instead of refetching.
  const [fetchType, setFetchType] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMaterials, setHasMoreMaterials] = useState(false);
  const [currentMaterialPage, setCurrentMaterialPage] = useState(1);
  const [guestSignOutLoading, setGuestSignOutLoading] = useState(false);
  const browseRequestIdRef = useRef(0);
  const materialsRequestIdRef = useRef(0);

  usePreconnectToFileHost(materials);

  const stepOptionsLoading = optionsLoading || browseOptionsLoading;
  const currentStepIndex = STEPS.findIndex((key) => !filters[key]);
  const currentStep = currentStepIndex === -1 ? 'done' : STEPS[currentStepIndex];
  const allSelected = currentStep === 'done';

  /* ── data fetching ────────────────────────────────────────── */
  useEffect(() => {
    setOptionsLoading(true);
    setOptionsError('');

    fetchFilterOptions()
      .then((data) => {
        setOptions(data.data || {});
        setOptionsError('');
      })
      .catch((error) => {
        setOptions({});
        setOptionsError(error?.message || 'Failed to load filter options.');
      })
      .finally(() => {
        setOptionsLoading(false);
      });
  }, [optionsRefreshKey]);

  useEffect(() => {
    if (!filters.year) {
      setBrowseOptionsLoading(false);
      return;
    }

    const requestId = browseRequestIdRef.current + 1;
    browseRequestIdRef.current = requestId;
    setOptionsError('');
    setBrowseOptionsLoading(true);

    fetchBrowseOptions({
      degree: filters.degree,
      year: filters.year,
      semester: filters.semester,
      branch: filters.branch,
      subject: filters.subject,
    })
      .then((data) => {
        if (browseRequestIdRef.current !== requestId) return;
        setOptions((prev) => ({ ...prev, ...(data.data || {}) }));
      })
      .catch((error) => {
        if (browseRequestIdRef.current !== requestId) return;
        setOptionsError(error?.message || 'Failed to load browse options.');
        // Empty (not undefined) counts unblock the fetch in fallback mode,
        // without discarding counts an earlier step already resolved.
        setOptions((prev) => ({ ...prev, resourceTypeCounts: prev.resourceTypeCounts || {} }));
      })
      .finally(() => {
        if (browseRequestIdRef.current !== requestId) return;
        setBrowseOptionsLoading(false);
      });
  }, [filters.degree, filters.year, filters.semester, filters.branch, filters.subject]);

  const loadMaterials = useCallback(async (f, { page = 1, append = false, resourceType } = {}) => {
    // Switching tabs starts a new request while the previous one may still be
    // in flight; only the newest may touch state.
    const requestId = materialsRequestIdRef.current + 1;
    materialsRequestIdRef.current = requestId;

    setLoading(page === 1 && !append);
    setLoadingMore(page > 1 || append);
    setMaterialsError('');
    try {
      const response = await fetchMaterials({
        ...f,
        resourceType: resourceType === ALL_TYPES ? undefined : resourceType,
        page,
        limit: MATERIAL_PAGE_SIZE,
      });
      if (materialsRequestIdRef.current !== requestId) return;
      const nextItems = Array.isArray(response.data) ? response.data : [];
      const pagination = response.pagination || {};

      setMaterials((prev) => {
        const merged = append ? [...prev, ...nextItems] : nextItems;
        const deduped = [];
        const seen = new Set();
        merged.forEach((item) => {
          if (!item?._id || seen.has(item._id)) return;
          seen.add(item._id);
          deduped.push(item);
        });
        return deduped;
      });
      setCurrentMaterialPage(page);
      setHasMoreMaterials(
        Boolean(
          pagination.totalPages
            ? page < pagination.totalPages
            : nextItems.length === MATERIAL_PAGE_SIZE
        )
      );
    } catch (error) {
      if (materialsRequestIdRef.current !== requestId) return;
      setMaterials([]);
      setMaterialsError(error?.message || 'Failed to load materials.');
    } finally {
      if (materialsRequestIdRef.current === requestId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!allSelected || !fetchType) {
      setMaterials([]);
      setHasMoreMaterials(false);
      setCurrentMaterialPage(1);
      return;
    }
    loadMaterials(filters, { page: 1, append: false, resourceType: fetchType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.year, filters.semester, filters.branch, filters.subject, allSelected, fetchType]);

  /* ── handlers ─────────────────────────────────────────────── */
  const selectOption = (key, value) => {
    setOptionsError('');
    setBrowseOptionsLoading(true);

    if (key === 'year' || key === 'semester' || key === 'branch') {
      setOptions((prev) => {
        const next = { ...prev };
        if (key === 'year') {
          next.semesters = [];
          next.branches = [];
          next.subjects = [];
        } else if (key === 'semester') {
          next.branches = [];
          next.subjects = [];
        } else if (key === 'branch') {
          next.subjects = [];
        }
        return next;
      });
    }

    setFilters((prev) => {
      const next = { ...prev, [key]: key === 'year' || key === 'semester' ? Number(value) : value };
      const stepIdx = STEPS.indexOf(key);
      for (let i = stepIdx + 1; i < STEPS.length; i++) delete next[STEPS[i]];
      return next;
    });
  };

  const goBackTo = (key) => {
    if (key === 'year' || key === 'semester' || key === 'branch') {
      setOptions((prev) => {
        const next = { ...prev };
        if (key === 'year') {
          next.semesters = [];
          next.branches = [];
          next.subjects = [];
        } else if (key === 'semester') {
          next.branches = [];
          next.subjects = [];
        } else if (key === 'branch') {
          next.subjects = [];
        }
        return next;
      });
      setBrowseOptionsLoading(true);
    }

    setFilters((prev) => {
      const next = { ...prev };
      const stepIdx = STEPS.indexOf(key);
      for (let i = stepIdx; i < STEPS.length; i++) delete next[STEPS[i]];
      return next;
    });
    setMaterials([]);
    setMaterialsError('');
    setFetchType(null);
  };

  const resetAll = () => {
    setFilters({ degree: 'BTech' });
    setMaterials([]);
    setMaterialsError('');
    setActiveTab(null);
    setFetchType(null);
    setOptions({});
    setOptionsError('');
    setBrowseOptionsLoading(false);
  };

  const handleGuestSignOut = async () => {
    setGuestSignOutLoading(true);
    try {
      await fetch('/api/auth/guest/signout', { method: 'POST' });
    } catch {
      // ignore and still proceed with local cleanup
    } finally {
      setGuestSignOutLoading(false);
      router.replace('/study-access?next=/study-material');
    }
  };

  /* ── group materials ──────────────────────────────────────── */
  const grouped = useMemo(() => {
    const groupedItems = {};
    materials.forEach((m) => {
      const type = m.resourceType || 'Other';
      if (!groupedItems[type]) groupedItems[type] = [];
      groupedItems[type].push(m);
    });
    return groupedItems;
  }, [materials]);

  const sortedTypes = useMemo(
    () => [
      ...TYPE_ORDER.filter((t) => grouped[t]),
      ...Object.keys(grouped).filter((t) => !TYPE_ORDER.includes(t)),
    ],
    [grouped]
  );

  /* ── resource type tabs ───────────────────────────────────── */
  /**
   * Tabs come from the server's per-type counts, not from the materials that
   * happen to be on screen. Deriving them from the loaded page meant a subject
   * whose first 24 files were all lectures showed only a Lectures tab —
   * Tutorials and PYQs appeared only after paging to the end of the list.
   */
  const resourceCounts = options.resourceTypeCounts || null;

  const tabTypes = useMemo(() => {
    if (!resourceCounts) return [];
    const present = Object.keys(resourceCounts).filter((type) => resourceCounts[type] > 0);
    return [
      ...TYPE_ORDER.filter((type) => present.includes(type)),
      ...present.filter((type) => !TYPE_ORDER.includes(type)).sort(),
    ];
  }, [resourceCounts]);

  // True once the server has told us the types: each tab then fetches its own
  // page, so "Load more" pages within a tab instead of across all of them.
  const serverFiltered = tabTypes.length > 0;

  useEffect(() => {
    if (!allSelected || !resourceCounts) return;
    if (!tabTypes.length) {
      setFetchType(ALL_TYPES);
      return;
    }
    // A tab that survives the new selection keeps its place, which lets its
    // materials load in parallel with the counts request.
    if (activeTab && tabTypes.includes(activeTab)) {
      setFetchType(activeTab);
      return;
    }
    // Choosing a default, though, has to wait for counts that belong to this
    // selection — otherwise the previous subject's types pick the tab.
    if (browseOptionsLoading) return;
    setActiveTab(tabTypes[0]);
    setFetchType(tabTypes[0]);
  }, [allSelected, resourceCounts, tabTypes, activeTab, browseOptionsLoading]);

  // Fallback only: without counts the tabs are whatever the unfiltered page
  // contained, so the selection has to follow that list.
  useEffect(() => {
    if (serverFiltered) return;
    if (sortedTypes.length > 0 && (!activeTab || !sortedTypes.includes(activeTab))) {
      setActiveTab(sortedTypes[0]);
    }
    if (!sortedTypes.length && activeTab !== null) {
      setActiveTab(null);
    }
  }, [activeTab, sortedTypes, serverFiltered]);

  // Until fetchType is settled the tab set still belongs to the previous
  // selection, so render nothing rather than let stale tabs flash.
  const tabsSettled = Boolean(fetchType);
  const availableTypes = serverFiltered ? tabTypes : sortedTypes;
  const tabTypesToRender = tabsSettled ? availableTypes : [];
  const materialsPending = loading || (allSelected && !tabsSettled);
  const visibleItems = serverFiltered ? materials : grouped[activeTab] || [];
  const tabCount = (type) =>
    serverFiltered ? resourceCounts?.[type] || 0 : grouped[type]?.length || 0;

  const selectTab = (type) => {
    if (type === activeTab) return;
    setActiveTab(type);
    if (!serverFiltered) return;
    // The fetch is kicked off by an effect, which runs after paint. Clearing
    // here keeps the previous tab's files from showing for a frame under the
    // newly selected tab.
    setMaterials([]);
    setLoading(true);
    setFetchType(type);
  };

  /* ── option lists ─────────────────────────────────────────── */
  const optionMap = {
    year: (options.years || []).map((v) => ({
      value: v,
      ...(YEAR_META[v] || { label: `Year ${v}`, sub: '' }),
    })),
    semester: (options.semesters || []).map((v) => ({
      value: v,
      label: SEM_LABELS[v] || `Semester ${v}`,
    })),
    branch: (options.branches || []).map((v) => ({ value: v, label: v })),
    subject: (options.subjects || []).map((v) => ({ value: v, label: v })),
  };

  const stepPrompts = {
    year: 'Which year are you in?',
    semester: 'Pick your semester',
    branch: 'Choose your branch',
    subject: 'Select a subject',
  };
  const stepSubtext = {
    year: 'Select your current academic year',
    semester: 'Which semester are you studying?',
    branch: 'Your specialization',
    subject: `${(optionMap.subject || []).length} subjects available`,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8 pb-16">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <CollegeBrand />
        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/75 dark:bg-card/75 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
              {user.image && (
                <Image
                  src={user.image}
                  alt={user.name || 'User'}
                  width={22}
                  height={22}
                  className="rounded-full"
                />
              )}
              <span className="max-w-[160px] truncate text-muted-foreground">{user.email}</span>
              <SignOutButton />
            </div>
          ) : isGuest ? (
            <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/50 px-2 py-1.5 text-xs font-medium shadow-sm">
              <span className="text-amber-700 dark:text-amber-300">Guest Mode</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
                onClick={handleGuestSignOut}
                disabled={guestSignOutLoading}
                title="Exit guest mode"
              >
                <LogOut className="size-[3.5]" />
                <span>{guestSignOutLoading ? 'Exiting...' : 'Sign out'}</span>
              </Button>
            </div>
          ) : null}
          <TopPanelTools />
        </div>
      </div>

      {/* ── Header Area ───────────────────────────────── */}
      <section className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 max-w-3xl">
          <div className="flex items-center gap-3">
            <div className="flex bg-primary/10 p-2 rounded-lg">
              <BookOpen className="size-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Study Material
            </h1>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Filter by your current academic level sequentially to retrieve specific lectures,
            tutorials, and past year papers.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground border border-border/50 w-max">
            {STEPS.map((s, i) => {
              const isActive = !!filters[s];
              const isCurrent = currentStep === s;
              return (
                <span key={s} className="flex items-center gap-2">
                  <span
                    className={
                      isActive
                        ? 'text-foreground font-semibold'
                        : isCurrent
                          ? 'text-primary font-semibold'
                          : ''
                    }
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {i < STEPS.length - 1 && <ChevronRight className="size-[3.5] opacity-50" />}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Breadcrumb trail ────────────────────────────────────── */}
      {STEPS.some((k) => filters[k]) && (
        <nav className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/80 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="size-3" /> Reset
          </button>
          {STEPS.map((key) => {
            if (!filters[key]) return null;
            const StepIcon = STEP_ICONS[key];
            const label =
              key === 'year'
                ? YEAR_META[filters[key]]?.label || `Year ${filters[key]}`
                : key === 'semester'
                  ? SEM_LABELS[filters[key]] || `Sem ${filters[key]}`
                  : filters[key];
            return (
              <span key={key} className="flex items-center gap-1">
                <ChevronRight className="size-3 text-muted-foreground/50" />
                <button
                  type="button"
                  onClick={() => goBackTo(key)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 font-semibold text-primary transition hover:bg-primary/20"
                >
                  <StepIcon className="size-3" /> {label}
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

          {stepOptionsLoading ? (
            <div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              aria-live="polite"
              aria-busy="true"
            >
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-2xl border border-border bg-card/70"
                />
              ))}
            </div>
          ) : null}

          {!stepOptionsLoading && optionsError ? (
            <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
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
          {!stepOptionsLoading && currentStep === 'year' && (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              {optionMap.year.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => selectOption('year', opt.value)}
                  aria-label={`Select ${opt.label}`}
                  className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all duration-200 hover:border-primary hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:bg-primary/20 transition-colors">
                    {typeof opt.icon === 'function' ? (
                      <opt.icon className="size-6" />
                    ) : (
                      <BookOpen className="size-6" />
                    )}
                  </div>
                  <p className="text-base font-bold group-hover:text-primary transition-colors">
                    {opt.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{opt.sub}</p>
                  <ArrowRight className="absolute bottom-6 right-6 size-4 text-muted-foreground/30 transition-all group-hover:text-primary group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}

          {/* Semester — pill buttons */}
          {!stepOptionsLoading && currentStep === 'semester' && (
            <div className="flex flex-wrap gap-3">
              {optionMap.semester.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => selectOption('semester', opt.value)}
                  aria-label={`Select ${opt.label}`}
                  className="group relative rounded-xl border border-border bg-card px-6 py-3 font-bold shadow-sm transition-all duration-200 hover:border-primary hover:shadow-md hover:scale-[1.04] active:scale-[0.97]"
                >
                  <span className="group-hover:text-primary transition-colors">{opt.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Branch — colored cards */}
          {!stepOptionsLoading && currentStep === 'branch' && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {optionMap.branch.map((opt, i) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => selectOption('branch', opt.value)}
                  aria-label={`Select branch ${opt.label}`}
                  className="group relative flex items-center justify-between rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all duration-200 hover:border-primary hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                      <GitBranch className="size-5" />
                    </div>
                    <p className="text-sm font-bold group-hover:text-primary transition-colors">
                      {opt.label}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground/20 group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}

          {/* Subject — list-style cards */}
          {!stepOptionsLoading && currentStep === 'subject' && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {optionMap.subject.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => selectOption('subject', opt.value)}
                  aria-label={`Select subject ${opt.label}`}
                  className="group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary hover:shadow-md hover:bg-primary/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BookMarked className="size-4" />
                    </div>
                    <span className="text-sm font-bold group-hover:text-primary transition-colors">
                      {opt.label}
                    </span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/30 transition group-hover:text-primary" />
                </button>
              ))}
            </div>
          )}

          {!stepOptionsLoading && (optionMap[currentStep] || []).length === 0 && !optionsError && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No options available for this selection yet. Try another filter or refresh.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Materials — tabbed by resource type ─────────────────── */}
      {allSelected && (
        <section className="mt-6">
          {materialsError ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
              <p className="font-semibold">Unable to load materials</p>
              <p className="mt-1 text-xs opacity-90">{materialsError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() =>
                  loadMaterials(filters, { page: 1, append: false, resourceType: fetchType })
                }
              >
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Guest banner */}
              {isGuest && (
                <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  You are browsing as a guest. Sign in with your college account to keep your access
                  across devices.
                </div>
              )}

              {/* Resource type tabs — rendered from the server's counts, so the
                  full set is present before any material has loaded, and it
                  stays put while a tab is fetching. */}
              {tabTypesToRender.length > 0 && (
                <div className="mb-5 flex flex-wrap gap-2">
                  {tabTypesToRender.map((type) => {
                    const meta = RESOURCE_TYPES[type] || RESOURCE_TYPES.Slides;
                    const Icon = meta.icon;
                    const isActive = activeTab === type;
                    return (
                      <button
                        type="button"
                        key={type}
                        onClick={() => selectTab(type)}
                        aria-label={`View ${type} materials`}
                        aria-pressed={isActive}
                        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
                          isActive
                            ? `${meta.border} ${meta.bg} ${meta.text} shadow-sm scale-[1.02]`
                            : 'border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/50'
                        }`}
                      >
                        <Icon className="size-4" />
                        {type}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${isActive ? meta.badge : 'bg-muted text-muted-foreground'}`}
                        >
                          {tabCount(type)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {materialsPending ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[7.5rem] animate-pulse rounded-xl border border-border bg-card/70"
                    />
                  ))}
                </div>
              ) : tabTypesToRender.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <FileText className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    No materials found for <strong>{filters.subject}</strong>.
                  </p>
                </div>
              ) : (
                activeTab &&
                (() => {
                  const meta = RESOURCE_TYPES[activeTab] || RESOURCE_TYPES.Slides;
                  const Icon = meta.icon;
                  const total = tabCount(activeTab) || visibleItems.length;

                  return (
                    <div>
                      {/* Section header with gradient accent */}
                      <div
                        className={`mb-4 flex items-center gap-3 rounded-xl ${meta.bg} border ${meta.border} px-4 py-3`}
                      >
                        <div
                          className={`flex size-9 items-center justify-center rounded-lg bg-gradient-to-br ${meta.gradient} text-white shadow-sm`}
                        >
                          <Icon className="size-[4.5]" />
                        </div>
                        <div>
                          <p className={`text-sm font-black ${meta.text}`}>{activeTab}</p>
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                        </div>
                        <Badge className={`ml-auto ${meta.badge} border-0`}>
                          {total} {total === 1 ? 'file' : 'files'}
                        </Badge>
                      </div>

                      {/* File grid */}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {visibleItems.map((item) => (
                          <div
                            key={item._id}
                            className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary hover:shadow-md"
                          >
                            <div className="mb-3">
                              <h4 className="line-clamp-2 text-sm font-bold leading-snug">
                                {item.title}
                              </h4>
                              <Badge
                                variant="outline"
                                className="mt-1.5 text-[10px] px-1.5 py-0 font-medium"
                              >
                                {item.fileType?.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="flex gap-2">
                              <Link href={`/material/${item._id}`} className="flex-1">
                                <Button
                                  type="button"
                                  className="w-full"
                                  size="sm"
                                  variant="secondary"
                                >
                                  <BookOpen className="mr-1.5 size-[3.5]" /> View
                                </Button>
                              </Link>
                              <Button
                                type="button"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  const filename = `${item.title || item.subject}.${item.fileType}`;
                                  toast.info('Downloading...', { description: filename });
                                  // The list response already carries fileUrl, so go
                                  // straight to the CDN instead of paying for a
                                  // round trip through the access route.
                                  triggerDownload(
                                    item.fileUrl || materialAccessUrl(item._id, 'download'),
                                    filename
                                  );
                                }}
                              >
                                <Download className="mr-1.5 size-[3.5]" /> Download
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {hasMoreMaterials && (
                        <div className="mt-5 flex justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              loadMaterials(filters, {
                                page: currentMaterialPage + 1,
                                append: true,
                                resourceType: fetchType,
                              })
                            }
                            disabled={loadingMore}
                          >
                            {loadingMore ? 'Loading more…' : 'Load more materials'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
