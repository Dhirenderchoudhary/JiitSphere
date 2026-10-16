'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';
import { cn } from 'lib/utils';

const navLinks = [
  { href: '/portal', label: 'Student Portal' },
  { href: '/study-material', label: 'Study Material' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      // Only setState on crossings to avoid re-render on every scroll frame.
      setScrolled((prev) => {
        const next = window.scrollY > 10;
        return prev === next ? prev : next;
      });
    };
    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    // Check initial position once (deep links) without adding cost per frame.
    update();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      <nav
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-colors duration-200 px-4 sm:px-6 py-3.5 sm:py-4 md:px-12',
          scrolled
            ? 'bg-background border-b border-border/40 py-2.5 sm:py-3 shadow-[0_8px_30px_-22px_rgba(0,0,0,0.35)]'
            : 'bg-transparent py-4 sm:py-6 border-b border-transparent'
        )}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative size-8 sm:size-9 overflow-hidden rounded-lg bg-secondary border border-border/50 shadow-sm transition-transform group-hover:scale-105">
              <Image
                src="/jiitsphere-logo.png"
                alt="JiitSphere logo"
                width={32}
                height={32}
                priority
                className="object-cover"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="font-bold text-base sm:text-lg tracking-tighter text-foreground leading-none font-[var(--font-instrument-sans)]">
                JiitSphere
              </h1>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                prefetch
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <TopPanelTools
              className={cn(
                'transition-all duration-200 p-1.5 rounded-xl border',
                scrolled ? 'bg-muted/40 border-transparent' : 'bg-card/5 border-border/20'
              )}
            />

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex items-center justify-center size-10 rounded-xl border border-border/40 bg-card touch-manipulation"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay — CSS-only fade/slide, no backdrop-blur (GPU killer on scroll) */}
      <div
        className={cn(
          'fixed inset-0 z-40 md:hidden transition-opacity duration-200',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="absolute inset-0 bg-background" onClick={() => setMobileOpen(false)} />
        <div
          className={cn(
            'relative flex flex-col items-center justify-center min-h-screen gap-8 px-6 transition-transform duration-200',
            mobileOpen ? 'translate-y-0' : '-translate-y-4'
          )}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="text-2xl font-bold text-foreground hover:text-primary transition-colors min-h-[44px] flex items-center"
              prefetch
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
