import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, LayoutDashboard } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="mesh-overlay relative w-full overflow-hidden rounded-3xl border border-border bg-white/80 dark:bg-slate-900/65 p-6 shadow-glow backdrop-blur md:p-10">
        <div className="relative z-10">
          <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="overflow-hidden rounded-2xl border border-border bg-white/90 dark:bg-slate-900/80 shadow-sm">
                <Image src="/JIIT-Noida-Logo.webp" alt="Jaypee logo" width={56} height={56} priority />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">JIIT Student Space</p>
                <h1 className="font-[var(--font-archivo)] text-2xl font-black leading-tight md:text-4xl">Your Jaypee Buddy</h1>
              </div>
            </div>
            <TopPanelTools />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Link
              href="/portal"
              className="group rounded-2xl border border-border bg-white dark:bg-slate-900/75 p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <h2 className="font-[var(--font-archivo)] text-2xl font-extrabold">Portal</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Login and access the integrated student portal experience inspired by JIIT Web Kiosk.
              </p>
              <span className="mt-5 inline-flex items-center text-sm font-semibold text-primary">
                Open Portal <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>

            <Link
              href="/study-material"
              className="group rounded-2xl border border-border bg-white dark:bg-slate-900/75 p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/20 text-accent-foreground">
                <BookOpen className="h-5 w-5" />
              </div>
              <h2 className="font-[var(--font-archivo)] text-2xl font-extrabold">Study Material</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Continue with the same study material flow and filters exactly as you are using now.
              </p>
              <span className="mt-5 inline-flex items-center text-sm font-semibold text-primary">
                Open Study Material <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
