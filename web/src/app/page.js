import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, LayoutDashboard, Sparkles, GraduationCap, Users, FileText } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';

export default function HomePage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="relative w-full">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="gradient-border overflow-hidden rounded-2xl bg-card/90 dark:bg-card/80 shadow-sm p-0.5">
              <Image src="/jiitsphere-logo.png" alt="JiitSphere logo" width={56} height={56} priority className="rounded-[14px]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">JIIT Student Space</p>
              <h1 className="font-[var(--font-archivo)] text-3xl font-black leading-tight md:text-4xl">JiitSphere</h1>
            </div>
          </div>
          <TopPanelTools />
        </div>

        {/* ── Hero banner ─────────────────────────────────────── */}
        <div className="mesh-overlay relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-[#0f5d88] p-6 text-white shadow-glow md:p-8 mb-6">
          <div className="absolute inset-0 dot-grid opacity-[0.06]" />
          <div className="relative z-10">
            <p className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] backdrop-blur-sm">
              <Sparkles className="mr-2 h-3.5 w-3.5" /> Your Jaypee Buddy
            </p>
            <h2 className="mt-3 font-[var(--font-archivo)] text-2xl font-black leading-tight md:text-3xl">
              Everything you need, one place.
            </h2>
            <p className="mt-2 max-w-md text-sm text-white/60">
              Access your portal, study materials, notes, PYQs, and more — built by JIIT students, for JIIT students.
            </p>
          </div>
        </div>

        {/* ── Feature cards ───────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/portal"
            className="spotlight-card gradient-border group relative overflow-hidden rounded-2xl bg-card p-6 shadow-sm transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
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
