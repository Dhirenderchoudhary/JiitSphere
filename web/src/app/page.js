import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, LayoutDashboard, Sparkles, GraduationCap, Users, FileText } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';

export default function HomePage() {
  return (
    <main className="page-shell relative py-8 sm:py-10">
      <section className="relative w-full space-y-6">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="gradient-border overflow-hidden rounded-2xl bg-card/90 p-0.5">
              <Image src="/jiitsphere-logo.png" alt="JiitSphere logo" width={56} height={56} priority className="rounded-[14px]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">JIIT Student Workspace</p>
              <h1 className="font-[var(--font-archivo)] text-3xl font-black leading-tight md:text-4xl">JiitSphere</h1>
            </div>
          </div>
          <TopPanelTools />
        </div>

        {/* ── Hero banner ─────────────────────────────────────── */}
        <div className="mesh-overlay relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-[#0f5d88] p-6 text-white md:p-8">
          <div className="absolute inset-0 dot-grid opacity-[0.06]" />
          <div className="relative z-10">
            <p className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] backdrop-blur-sm">
              <Sparkles className="mr-2 h-3.5 w-3.5" /> Your Jaypee Buddy
            </p>
            <h2 className="mt-3 max-w-2xl font-[var(--font-archivo)] text-2xl font-black leading-tight md:text-3xl">
              Academic essentials in one polished student dashboard.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Move between portal analytics and curated material libraries without friction. Fast, mobile-ready, and built for daily student workflows.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portal</p>
            <p className="mt-1 text-sm text-foreground">Attendance, grades, exams, profile and fee insights.</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study Hub</p>
            <p className="mt-1 text-sm text-foreground">Sem-wise notes, slides, PYQs and downloadable resources.</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guest Access</p>
            <p className="mt-1 text-sm text-foreground">Quick preview mode with limits and safe fallback sign-in.</p>
          </div>
        </div>

        {/* ── Feature cards ───────────────────────────────────── */}
        <div className="grid gap-4 pb-6 md:grid-cols-2">
          <Link
            href="/portal"
            className="spotlight-card gradient-border group relative overflow-hidden rounded-2xl bg-card p-6 shadow-sm transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
            aria-label="Open student portal"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <h2 className="font-[var(--font-archivo)] text-xl font-black">Student Portal</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Access attendance, grades, exam schedules, and more all in a beautiful, modern interface.
            </p>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Attendance</span>
              <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" /> Grades</span>
            </div>
            <span className="mt-5 inline-flex items-center text-sm font-bold text-primary">
              Open Portal <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            href="/study-material"
            className="spotlight-card gradient-border group relative overflow-hidden rounded-2xl bg-card p-6 shadow-sm transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
            aria-label="Open study material hub"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <h2 className="font-[var(--font-archivo)] text-xl font-black">Study Material</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Browse notes, slides, PYQs, tutorials and solutions organized by year, semester, and branch.
            </p>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> 1300+ files</span>
              <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> 40+ subjects</span>
            </div>
            <span className="mt-5 inline-flex items-center text-sm font-bold text-primary">
              Browse Materials <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
