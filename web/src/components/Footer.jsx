import Image from 'next/image';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="w-full border-t border-border/40 bg-card/30 backdrop-blur-xl py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          {/* Brand & Mission */}
          <div className="md:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative size-10 overflow-hidden rounded-xl bg-card shadow-glow p-0.5 border border-border/50">
                <Image
                  src="/jiitsphere-logo.png"
                  alt="JiitSphere logo"
                  width={40}
                  height={40}
                  loading="lazy"
                  className="rounded-[8px]"
                />
              </div>
              <span className="font-[var(--font-archivo)] text-xl font-black tracking-tight text-foreground">
                JiitSphere
              </span>
            </div>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              Academic essentials in one polished student workspace. Built for the daily workflows
              of JIIT students.
            </p>
          </div>

          {/* Navigation */}
          <div className="space-y-6">
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">
              QUICK LINKS
            </h4>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/portal"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Student Portal
                </Link>
              </li>
              <li>
                <Link
                  href="/study-material"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Study Material
                </Link>
              </li>
            </ul>
          </div>

          {/* Credits */}
          <div className="space-y-6">
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">
              COMMUNITY
            </h4>
            <div className="flex flex-col gap-4 text-sm text-muted-foreground">
              <p>
                Made with ❤️ by{' '}
                <a
                  href="https://www.DhirenderChoudhary.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary hover:underline underline-offset-4"
                >
                  Dhirender Choudhary
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 md:mt-16 pt-8 border-t border-border/20 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <p className="text-[11px] font-medium text-muted-foreground opacity-60">
            &copy; {new Date().getFullYear()} JiitSphere. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <p className="text-[11px] font-medium text-muted-foreground opacity-60">
              Not affiliated with Jaypee Institute of Information Technology.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
