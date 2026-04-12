'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import TopPanelTools from 'components/TopPanelTools';
import { cn } from 'lib/utils';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 py-4 md:px-12',
        scrolled 
          ? 'backdrop-blur-md bg-background/80 border-b border-border/40 py-3' 
          : 'bg-transparent py-6'
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-9 w-9 overflow-hidden rounded-lg bg-secondary border border-border/50 shadow-sm transition-transform group-hover:scale-105">
            <Image 
              src="/jiitsphere-logo.png" 
              alt="JiitSphere logo" 
              width={36} 
              height={36} 
              priority 
              className="object-cover" 
            />
          </div>
          <div className="flex flex-col">
            <h1 className="font-bold text-lg tracking-tighter text-foreground leading-none font-[var(--font-instrument-sans)]">
              JiitSphere
            </h1>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <TopPanelTools className={cn(
            "transition-all duration-200 p-1.5 rounded-xl border",
            scrolled ? "bg-muted/40 border-transparent" : "bg-card/5 border-border/20"
          )} />
        </div>
      </div>
    </nav>
  );
}
