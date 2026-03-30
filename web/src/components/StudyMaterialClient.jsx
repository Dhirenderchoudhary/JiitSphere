'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Sparkles } from 'lucide-react';
import CollegeBrand from 'components/CollegeBrand';
import FilterStepper from 'components/FilterStepper';
import MaterialList from 'components/MaterialList';
import SignOutButton from 'components/SignOutButton';
import StatsStrip from 'components/StatsStrip';
import TopPanelTools from 'components/TopPanelTools';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { Input } from 'components/ui/input';
import { fetchBrowseOptions, fetchFilterOptions, fetchMaterials } from 'lib/api';

const stepKeys = ['degree', 'branch', 'year', 'semester', 'subject', 'resourceType'];

const resetLowerSteps = (currentKey, draft) => {
  const index = stepKeys.indexOf(currentKey);
  if (index < 0) return draft;
  const next = { ...draft };
  for (let i = index + 1; i < stepKeys.length; i += 1) {
    delete next[stepKeys[i]];
  }
  return next;
};

export default function StudyMaterialClient({ user = null }) {
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({});
  const [materials, setMaterials] = useState([]);
  const [lastTotal, setLastTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFilterOptions()
      .then((data) => setOptions(data.data || {}))
      .catch(() => setOptions({}));
  }, []);

  useEffect(() => {
    const scopedFilters = {
      degree: filters.degree,
      branch: filters.branch,
      year: filters.year,
      semester: filters.semester,
      subject: filters.subject
    };

    fetchBrowseOptions(scopedFilters)
      .then((data) => {
        setOptions((prev) => ({ ...prev, ...(data.data || {}) }));
      })
      .catch(() => undefined);
  }, [filters.degree, filters.branch, filters.year, filters.semester, filters.subject]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => {
      const draft = { ...prev, [key]: value };
      return resetLowerSteps(key, draft);
    });
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await fetchMaterials({ ...filters, search });
      setMaterials(response.data || []);
      setLastTotal(response.pagination?.total || 0);
    } catch (_error) {
      setMaterials([]);
      setLastTotal(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
      <section className="mesh-overlay relative overflow-hidden rounded-3xl border border-border bg-white/70 dark:bg-slate-900/60 p-6 shadow-glow backdrop-blur md:p-8">
        <div className="relative z-10 space-y-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CollegeBrand />
            <div className="flex flex-wrap items-center gap-2">
              {user ? (
                <div className="flex items-center gap-2 rounded-full border border-border bg-white/60 dark:bg-slate-800/60 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
                  {user.image ? (
                    <Image src={user.image} alt={user.name || 'User'} width={22} height={22} className="rounded-full" unoptimized />
                  ) : null}
                  <span className="max-w-[160px] truncate text-muted-foreground">{user.email}</span>
                  <SignOutButton />
                </div>
              ) : null}
              <TopPanelTools />
            </div>
          </div>
          <div className="max-w-2xl space-y-4">
            <p className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-secondary-foreground">
              <Sparkles className="mr-2 h-3.5 w-3.5" /> Public Portal for JIIT Students
            </p>
            <h2 className="font-[var(--font-archivo)] text-3xl font-black leading-tight md:text-5xl">
              One place for notes, slides, PYQs, and lecture material across all semesters.
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              Select program details, search instantly, and open content directly in the app viewer.
            </p>
          </div>
          <StatsStrip total={lastTotal} degrees={options.degrees?.length || 0} subjects={options.subjects?.length || 0} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card className="animate-fadeInUp bg-white/92 dark:bg-slate-900/70 backdrop-blur">
          <CardHeader>
            <CardTitle>Find Study Material</CardTitle>
            <CardDescription>Follow the academic path to narrow down exactly what you need.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FilterStepper filters={filters} onChange={handleFilterChange} options={options} />
            <Input
              placeholder="Search by title or subject"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button onClick={handleSearch} disabled={loading} className="w-full" size="lg">
              {loading ? 'Searching...' : 'Search Materials'} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary to-[#0f5d88] text-white shadow-[0_14px_35px_-18px_rgba(14,116,144,0.55)]">
          <CardHeader>
            <CardTitle className="text-white">How It Works</CardTitle>
            <CardDescription className="text-white/80">Designed for daily student workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm text-white/90">
              <li>1. Pick your degree and branch.</li>
              <li>2. Select year, semester, and subject.</li>
              <li>3. Choose resource type and search.</li>
              <li>4. Open material directly in built-in viewer.</li>
            </ol>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="bg-white/90 dark:bg-slate-900/70 backdrop-blur">
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>{lastTotal ? `${lastTotal} records found` : 'Run search to load materials'}</CardDescription>
          </CardHeader>
          <CardContent>
            <MaterialList items={materials} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
