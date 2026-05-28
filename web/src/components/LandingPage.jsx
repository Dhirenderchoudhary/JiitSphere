'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Bell, FileText, Download, AlertCircle, Wallet, Search } from 'lucide-react';
import Navbar from 'components/Navbar';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';

const container = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const item = {
  // Keep content visible at first paint so hydration/animation issues never result in a blank screen.
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const springConfig = { type: 'spring', stiffness: 300, damping: 30 };

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-background selection:bg-primary selection:text-primary-foreground overflow-x-hidden font-[var(--font-manrope)]">
      <Navbar />

      {/* Background Architectural Patterns */}
      <div className="fixed inset-0 dot-grid opacity-[0.15] pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-b from-background via-transparent to-background pointer-events-none" />

      <div className="relative pt-24 pb-20 sm:pt-28 sm:pb-24 md:pt-40 md:pb-32 lg:pt-56 lg:pb-40">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative w-full space-y-16 sm:space-y-20 md:space-y-32 lg:space-y-40 px-5 sm:px-6 md:px-12 max-w-7xl mx-auto"
        >
          {/* ── Monumental Hero Section ─────────────────────────── */}
          <motion.section
            variants={item}
            className="max-w-5xl mx-auto text-center space-y-8 md:space-y-10"
          >
            <div className="space-y-5 md:space-y-6">
              <h2 className="text-[2.5rem] sm:text-6xl md:text-8xl lg:text-9xl font-bold tracking-tightest leading-[0.96] md:leading-[0.95] text-foreground font-[var(--font-instrument-sans)]">
                The academic <br />
                <span className="text-primary font-medium tracking-tight">dashboard</span>
                <br />
                <span className="opacity-90">for JIIT students.</span>
              </h2>

              <p className="max-w-2xl mx-auto text-[15px] sm:text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
                Consolidate your attendance, grades, and materials into a high-performance private
                workspace. Built for the daily workflows of JIIT students.
              </p>
            </div>
          </motion.section>

          {/* ── Flagship Product Cards ────────────────────────── */}
          <motion.section
            variants={item}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 max-w-5xl mx-auto"
          >
            {/* Student Portal */}
            <Link
              href="/portal"
              className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              <div className="relative h-full rounded-[1.6rem] sm:rounded-[2rem] border border-border/40 bg-card overflow-hidden transition-all duration-500 hover:border-primary/30 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] active:scale-[0.995]">
                {/* Mini dashboard preview */}
                <div className="px-6 pt-6 sm:px-8 sm:pt-8 md:px-10 md:pt-10">
                  <div className="rounded-xl border border-border/40 bg-secondary/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full bg-green-500" />
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                          Live Dashboard
                        </span>
                      </div>
                      <div className="text-[9px] font-mono text-muted-foreground/40">v2.4</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-card border border-border/30 p-2.5 text-center">
                        <div className="text-lg font-black text-foreground font-[var(--font-instrument-sans)] leading-none">
                          81%
                        </div>
                        <div className="text-[7px] font-bold text-muted-foreground/50 uppercase mt-1 tracking-wider">
                          Attend.
                        </div>
                      </div>
                      <div className="rounded-lg bg-card border border-border/30 p-2.5 text-center">
                        <div className="text-lg font-black text-foreground font-[var(--font-instrument-sans)] leading-none">
                          8.4
                        </div>
                        <div className="text-[7px] font-bold text-muted-foreground/50 uppercase mt-1 tracking-wider">
                          SGPA
                        </div>
                      </div>
                      <div className="rounded-lg bg-card border border-border/30 p-2.5 text-center">
                        <div className="text-lg font-black text-primary font-[var(--font-instrument-sans)] leading-none">
                          +2
                        </div>
                        <div className="text-[7px] font-bold text-muted-foreground/50 uppercase mt-1 tracking-wider">
                          Safe
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[8px] font-medium text-muted-foreground/60">
                        <span>Data Structures</span>
                        <span className="font-black text-foreground/40">92%</span>
                      </div>
                      <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                        <div className="h-full w-[92%] rounded-full bg-foreground/15" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 sm:p-8 md:p-10 pt-5 sm:pt-6 md:pt-6 space-y-4">
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight leading-none text-foreground font-[var(--font-instrument-sans)]">
                      Student Portal
                    </h3>
                    <p className="text-sm text-muted-foreground font-medium mt-2 leading-relaxed">
                      Attendance, grades, exams, and fees in one place.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="gap-2 group-hover:gap-3 transition-all duration-300 min-h-10"
                  >
                    Enter Portal <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            </Link>

            {/* Material Vault */}
            <Link
              href="/study-material"
              className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
            >
              <div className="relative h-full rounded-[1.6rem] sm:rounded-[2rem] border border-border/40 bg-card overflow-hidden transition-all duration-500 hover:border-primary/30 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] active:scale-[0.995]">
                {/* Document stack preview */}
                <div className="px-6 pt-6 sm:px-8 sm:pt-8 md:px-10 md:pt-10">
                  <div className="relative h-36 flex items-end justify-center">
                    {/* Back doc */}
                    <div className="absolute bottom-0 left-4 right-8 h-28 rounded-t-xl bg-secondary/50 border border-border/30 border-b-0 translate-y-1" />
                    {/* Middle doc */}
                    <div className="absolute bottom-0 left-2 right-6 h-30 rounded-t-xl bg-secondary/70 border border-border/40 border-b-0" />
                    {/* Front doc */}
                    <div className="relative w-full rounded-t-xl bg-card border border-border/50 border-b-0 p-4 space-y-2.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[10px] font-black text-foreground tracking-tight">
                            Data Structures — MST-1
                          </span>
                        </div>
                        <span className="text-[8px] font-bold text-muted-foreground/40 uppercase">
                          PDF
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-1.5 w-full bg-muted/40 rounded-full" />
                        <div className="h-1.5 w-[85%] bg-muted/40 rounded-full" />
                        <div className="h-1.5 w-[60%] bg-muted/40 rounded-full" />
                      </div>
                      <div className="flex gap-1.5 pt-0.5">
                        <div className="px-1.5 py-0.5 rounded bg-primary/10 text-[7px] font-bold text-primary uppercase">
                          PYQ
                        </div>
                        <div className="px-1.5 py-0.5 rounded bg-muted/50 text-[7px] font-bold text-muted-foreground uppercase">
                          CSE
                        </div>
                        <div className="px-1.5 py-0.5 rounded bg-muted/50 text-[7px] font-bold text-muted-foreground uppercase">
                          Sem 3
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 sm:p-8 md:p-10 pt-5 sm:pt-6 md:pt-6 space-y-4">
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight leading-none text-foreground font-[var(--font-instrument-sans)]">
                      Material Vault
                    </h3>
                    <p className="text-sm text-muted-foreground font-medium mt-2 leading-relaxed">
                      1,300+ slides, PYQs, and solutions indexed by course.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="gap-2 group-hover:gap-3 transition-all duration-300 min-h-10"
                  >
                    Browse Library <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            </Link>
          </motion.section>

          {/* ── Extreme Fidelity Interactive Bento Features Grid ── */}
          <motion.section variants={item} className="space-y-12 sm:space-y-16">
            <div className="text-center space-y-4">
              <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground font-[var(--font-instrument-sans)] underline decoration-primary/20 underline-offset-8">
                The Full Suite
              </h3>
              <p className="text-muted-foreground font-medium max-w-xl mx-auto">
                Consolidated functional dashboard for the JIIT ecosystem.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 auto-rows-[20rem]">
              {/* Feature 1: Smart Alerts (Notification Inbox) */}
              <SmartAlertsElite />

              {/* Feature 2: Grade Analytics (2x1 WIDE - Exact GPA UI) */}
              <motion.div
                whileHover="hover"
                className="bento-card group p-8 flex flex-col md:flex-row justify-between spotlight-card md:col-span-2"
              >
                <div className="flex-1 space-y-4 flex flex-col justify-center">
                  <div className="space-y-2">
                    <motion.div
                      variants={{ hover: { y: -2 } }}
                      transition={springConfig}
                      className="flex items-baseline gap-2"
                    >
                      <span className="text-5xl font-black text-primary font-[var(--font-instrument-sans)]">
                        8.41
                      </span>
                      <span className="text-xs font-bold text-muted-foreground uppercase opacity-40 tracking-widest">
                        SGPA
                      </span>
                    </motion.div>
                    <h4 className="text-2xl font-bold tracking-tight font-[var(--font-instrument-sans)]">
                      Grade Analytics
                    </h4>
                    <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-sm">
                      Visual trends across semesters with high-accuracy GPA prediction engine.
                    </p>
                  </div>
                </div>
                <div className="flex-1 flex items-end justify-end gap-2 pb-2">
                  {[35, 60, 40, 85, 50, 95, 45, 100].map((h, i) => (
                    <motion.div
                      key={i}
                      variants={{ hover: { height: h, opacity: 1 } }}
                      initial={{ height: 15, opacity: 0.2 }}
                      transition={{ ...springConfig, delay: i * 0.04 }}
                      className="w-4 bg-primary rounded-t-sm"
                    />
                  ))}
                </div>
              </motion.div>

              {/* Feature 3: PYQ Hub (1x2 TALL - Document UI) */}
              <motion.div
                whileHover="hover"
                className="bento-card group p-8 flex flex-col justify-between spotlight-card md:row-span-2"
              >
                <div className="flex-1 flex items-center justify-center relative pt-24 pb-8">
                  <div className="relative">
                    <motion.div
                      variants={{ hover: { rotate: -18, x: -25, y: -10 } }}
                      transition={springConfig}
                      className="absolute inset-0 h-40 w-28 bg-secondary rounded-xl border border-border/80 shadow-md flex items-center justify-center -rotate-6 z-0 group-hover:opacity-60 transition-opacity"
                    >
                      <div className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-widest -rotate-90">
                        15B17CI311
                      </div>
                    </motion.div>
                    <motion.div
                      variants={{ hover: { rotate: 18, x: 25, y: -10 } }}
                      transition={springConfig}
                      className="absolute inset-0 h-40 w-28 bg-secondary rounded-xl border border-border/80 shadow-md flex items-center justify-center rotate-6 z-10 group-hover:opacity-60 transition-opacity"
                    >
                      <div className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-widest rotate-90">
                        15B11CI111
                      </div>
                    </motion.div>
                    <div className="relative h-40 w-28 bg-card rounded-xl border border-border/80 shadow-2xl flex flex-col items-center justify-center p-4 z-20 space-y-3">
                      <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <FileText className="size-5" />
                      </div>
                      <div className="space-y-1 w-full">
                        <div className="h-1 w-full bg-muted rounded-full" />
                        <div className="h-1 w-[80%] bg-muted rounded-full" />
                      </div>
                      <div className="text-[8px] font-black text-center text-primary/40 uppercase tracking-tighter pt-2">
                        Data Structures
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-2xl font-bold tracking-tight font-[var(--font-instrument-sans)]">
                    PYQ Hub
                  </h4>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                    Deep repository with 1300+ documents. Indexed by course codes for lightning-fast
                    retrieval during exams.
                  </p>
                </div>
              </motion.div>

              {/* Feature 4: Exam Manager (Exact Datesheet UI) */}
              <motion.div
                whileHover="hover"
                className="bento-card group p-8 flex flex-col justify-between spotlight-card"
              >
                <div className="flex-1 flex items-center justify-center pt-4">
                  <motion.div
                    variants={{ hover: { y: -5 } }}
                    transition={springConfig}
                    className="w-full max-w-[160px] rounded-xl border border-border shadow-xl bg-card overflow-hidden"
                  >
                    <div className="bg-secondary px-3 py-2 border-b border-border flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
                        Datesheet
                      </span>
                      <div className="relative flex items-center justify-center">
                        <div className="size-1.5 rounded-full bg-red-500 relative z-10" />
                        <motion.div
                          animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
                          transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                          className="absolute size-4 rounded-full border border-red-500/50"
                        />
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="text-[10px] font-bold text-foreground">T1: 15 Sep</div>
                        <div className="text-[8px] font-medium text-muted-foreground uppercase">
                          Row A2
                        </div>
                      </div>
                      <div className="h-px w-full bg-border/50" />
                      <div className="flex justify-between items-center opacity-40">
                        <div className="text-[10px] font-bold">T2: 22 Oct</div>
                        <div className="text-[8px] font-medium uppercase">TBA</div>
                      </div>
                    </div>
                  </motion.div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">
                    Exam Manager
                  </h4>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    Exact datesheets & seating plan tracking.
                  </p>
                </div>
              </motion.div>

              {/* Feature 5: Predictor (Exact Safety UI) */}
              <motion.div
                whileHover="hover"
                className="bento-card group p-8 flex flex-col justify-between spotlight-card"
              >
                <div className="flex-1 flex flex-col items-center justify-center pt-4 relative">
                  <div className="relative size-24 flex items-center justify-center">
                    <motion.svg className="size-full -rotate-90">
                      <motion.circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="transparent"
                        className="text-muted/20"
                      />
                      <motion.circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="6"
                        strokeDasharray="251"
                        variants={{
                          hover: {
                            strokeDashoffset: 50,
                            transition: { duration: 0.8, ease: 'circOut' },
                          },
                        }}
                        initial={{ strokeDashoffset: 251 }}
                        fill="transparent"
                        className="text-primary"
                      />
                    </motion.svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
                      <div className="text-2xl font-black text-foreground font-[var(--font-instrument-sans)] leading-none">
                        81%
                      </div>
                      <div className="text-[7px] font-bold text-green-500 uppercase tracking-[0.2em] mt-1">
                        +2 SAFE
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">
                    Margin Predictor
                  </h4>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    Calculate exact classes to miss for 75%.
                  </p>
                </div>
              </motion.div>

              {/* Feature 6: Fee Monitor (Exact Wallet UI) */}
              <motion.div
                whileHover="hover"
                className="bento-card group p-8 flex flex-col justify-between spotlight-card"
              >
                <div className="flex-1 flex items-center justify-center pt-4">
                  <motion.div
                    variants={{ hover: { scale: 1.05, rotate: 2 } }}
                    transition={springConfig}
                    className="w-full max-w-[140px] p-4 bg-secondary rounded-xl border border-border shadow-md space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <Wallet className="size-5 text-primary opacity-40" />
                      <div className="relative">
                        <motion.div
                          variants={{
                            hover: {
                              scale: 1,
                              opacity: 1,
                              rotate: -12,
                              transition: { type: 'spring', stiffness: 500, damping: 15 },
                            },
                          }}
                          initial={{ scale: 2, opacity: 0, rotate: 0 }}
                          className="px-2 py-0.5 border-2 border-green-500 text-green-500 text-[10px] font-black rounded-sm uppercase tracking-tighter"
                        >
                          PAID
                        </motion.div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[14px] font-black text-foreground">₹2,10,500</div>
                      <div className="text-[8px] font-bold text-muted-foreground uppercase opacity-40 tracking-[0.1em]">
                        Hostel + Tuition
                      </div>
                    </div>
                  </motion.div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">
                    Fee Monitor
                  </h4>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    Real-time dues & receipt tracking.
                  </p>
                </div>
              </motion.div>

              <motion.div
                whileHover="hover"
                className="bento-card group p-8 flex flex-col justify-between spotlight-card"
              >
                <div className="flex-1 flex flex-col items-center justify-center pt-4 relative">
                  {/* Morphing Container (Stable Geometry) */}
                  <motion.div
                    layout
                    variants={{
                      hover: {
                        width: '100%',
                        height: '140px',
                        borderRadius: '0px',
                        backgroundColor: 'hsl(var(--card))',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        transition: { type: 'spring', stiffness: 200, damping: 35 },
                      },
                    }}
                    initial={{
                      width: '160px',
                      height: '38px',
                      borderRadius: '0px',
                      backgroundColor: 'hsl(var(--secondary))',
                    }}
                    className="relative border border-border flex flex-col overflow-hidden shadow-sm"
                  >
                    {/* Pre-filled Subject ID (Glides smoothly from center) */}
                    <motion.div layout className="flex-1 flex flex-col h-full">
                      <motion.div
                        layout
                        className={cn(
                          'flex h-full',
                          'group-hover:justify-between group-hover:p-4 justify-center items-center group-hover:items-start'
                        )}
                      >
                        <motion.div
                          layout
                          className="text-[10px] font-black text-primary tracking-tighter"
                        >
                          15B17CI311
                        </motion.div>

                        <motion.div
                          variants={{ hover: { opacity: 1, x: 0 } }}
                          initial={{ opacity: 0, x: 10 }}
                          className="hidden group-hover:block"
                        >
                          <Badge variant="secondary" className="text-[7px] px-1.5 py-0 font-bold">
                            4 CREDITS
                          </Badge>
                        </motion.div>
                      </motion.div>

                      <motion.div
                        variants={{ hover: { opacity: 1, y: 0, transition: { delay: 0.1 } } }}
                        initial={{ opacity: 0, y: 10 }}
                        className="px-4 pb-4 space-y-3 -mt-6 hidden group-hover:block"
                      >
                        <div className="space-y-1">
                          <div className="text-[11px] font-bold text-foreground">
                            Data Structures
                          </div>
                          <div className="text-[8px] font-medium text-muted-foreground opacity-60">
                            Core Course • CS/IT
                          </div>
                        </div>

                        <motion.div
                          variants={{
                            hover: { opacity: 1, scaleX: 1, transition: { delay: 0.2 } },
                          }}
                          initial={{ opacity: 0, scaleX: 0 }}
                          className="h-1 w-full bg-muted rounded-full overflow-hidden origin-left"
                        >
                          <div className="h-full w-[85%] bg-primary" />
                        </motion.div>
                      </motion.div>
                    </motion.div>

                    {/* Search Icon (Absolute Overlay for Pill State) */}
                    <motion.div
                      variants={{ hover: { opacity: 0, scale: 0.5 } }}
                      className="absolute right-4 top-3 group-hover:hidden"
                    >
                      <Search className="size-3 text-muted-foreground/40" />
                    </motion.div>
                  </motion.div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">
                    Subject Lookup
                  </h4>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed tracking-tight">
                    Access complete course syllabi.
                  </p>
                </div>
              </motion.div>

              {/* Feature 8: PWA App (Multi-Device Visual - Laptop, Tablet, Phone) */}
              <motion.div
                whileHover="hover"
                className="bento-card group p-8 flex flex-col justify-between spotlight-card md:col-span-2 overflow-hidden"
              >
                <div className="flex-1 flex items-center justify-center pt-8 relative w-full h-full lg:px-12">
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Laptop Frame */}
                    <motion.div
                      variants={{ hover: { y: -10, opacity: 1, scale: 1.05 } }}
                      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                      className="relative w-72 h-44 bg-card/40 border-[4px] border-border rounded-xl shadow-2xl flex flex-col overflow-hidden z-0 backdrop-blur-sm"
                    >
                      <div className="h-4 bg-muted/50 border-b border-border flex items-center px-2 gap-1">
                        <div className="size-1 rounded-full bg-red-400" />
                        <div className="size-1 rounded-full bg-amber-400" />
                        <div className="size-1 rounded-full bg-green-400" />
                      </div>
                      <div className="flex-1 p-3 space-y-2">
                        <div className="h-2 w-1/3 bg-primary/20 rounded-full" />
                        <div className="grid grid-cols-3 gap-2">
                          <div className="h-10 bg-muted/30 rounded-lg" />
                          <div className="h-10 bg-muted/30 rounded-lg" />
                          <div className="h-10 bg-muted/30 rounded-lg" />
                        </div>
                        <div className="h-12 w-full bg-primary/5 rounded-lg border border-primary/10" />
                      </div>
                      {/* Keyboard Base */}
                      <div className="absolute -bottom-1 left-0 right-0 h-2 bg-border/50" />
                    </motion.div>

                    {/* Tablet Frame */}
                    <motion.div
                      variants={{ hover: { x: -40, y: 15, rotate: -2, scale: 1.05 } }}
                      transition={{ type: 'spring', stiffness: 250, damping: 25, delay: 0.05 }}
                      className="absolute bottom-4 left-1/4 w-32 h-44 bg-card border-[3px] border-border rounded-2xl shadow-xl z-20 backdrop-blur-md overflow-hidden"
                    >
                      <div className="h-full p-2 flex flex-col gap-2">
                        <div className="h-1 w-8 bg-muted rounded-full mx-auto" />
                        <div className="h-10 w-full bg-primary/10 rounded-md" />
                        <div className="h-10 w-full bg-muted/40 rounded-md" />
                        <div className="h-10 w-full bg-muted/40 rounded-md" />
                      </div>
                    </motion.div>

                    {/* Phone Frame */}
                    <motion.div
                      variants={{ hover: { x: 45, y: 25, rotate: 3, scale: 1.1 } }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
                      className="absolute bottom-2 right-1/4 w-20 h-40 bg-card border-[3px] border-border rounded-2xl shadow-2xl z-30 backdrop-blur-md overflow-hidden"
                    >
                      <div className="h-full p-2 flex flex-col gap-2">
                        <div className="h-0.5 w-6 bg-muted rounded-full mx-auto mb-1" />
                        <div className="h-24 w-full bg-primary/20 rounded-lg flex items-center justify-center">
                          <Download className="size-4 text-primary opacity-50" />
                        </div>
                        <div className="h-1.5 w-full bg-muted/50 rounded-full" />
                        <div className="h-1.5 w-[80%] bg-muted/50 rounded-full" />
                      </div>
                    </motion.div>

                    {/* Sync Glow */}
                    <motion.div
                      animate={{ opacity: [0, 0.5, 0] }}
                      transition={{ repeat: Infinity, duration: 4 }}
                      className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-primary/10 to-transparent blur-3xl -z-10"
                    />
                  </div>
                </div>
                <div className="space-y-1 relative z-40">
                  <h4 className="text-xl font-bold tracking-tight font-[var(--font-instrument-sans)]">
                    PWA Ready
                  </h4>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    Install as a native-grade app on{' '}
                    <span className="text-foreground font-bold italic">all your devices</span>.
                    Cross-platform sync and lightning-fast offline access enabled.
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.section>
        </motion.div>
      </div>
    </main>
  );
}

function SmartAlertsElite() {
  return (
    <motion.div
      whileHover="hover"
      className="bento-card group p-8 flex flex-col justify-between spotlight-card"
    >
      <div className="flex-1 flex items-center justify-center pt-6">
        <div className="relative w-full max-w-[200px] h-[140px]">
          {/* Card 3 (Bottom) — Fees */}
          <motion.div
            variants={{
              hover: {
                y: -55,
                x: 18,
                rotate: 8,
                scale: 0.92,
                opacity: 1,
                transition: { type: 'spring', stiffness: 280, damping: 22 },
              },
            }}
            initial={{ opacity: 0.3, rotate: 2 }}
            className="absolute inset-x-0 top-4 h-[52px] rounded-xl border border-amber-500/15 bg-card/60 backdrop-blur-sm shadow-sm p-3 flex items-center gap-3"
          >
            <div className="shrink-0 size-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Wallet className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-black text-foreground/50 tracking-tight">
                Fees Due
              </div>
              <div className="text-[8px] font-medium text-muted-foreground/40 truncate">
                ₹2,400 pending
              </div>
            </div>
          </motion.div>

          {/* Card 2 (Middle) — Datesheet */}
          <motion.div
            variants={{
              hover: {
                y: -28,
                x: -14,
                rotate: -6,
                scale: 0.96,
                opacity: 1,
                transition: { type: 'spring', stiffness: 280, damping: 22, delay: 0.04 },
              },
            }}
            initial={{ opacity: 0.5, rotate: -1 }}
            className="absolute inset-x-0 top-4 h-[52px] rounded-xl border border-blue-500/15 bg-card/70 backdrop-blur-sm shadow-md p-3 flex items-center gap-3 z-10"
          >
            <div className="shrink-0 size-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Bell className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[9px] font-black text-foreground/60 tracking-tight">
                  Datesheet
                </span>
                <span className="text-[7px] font-medium text-muted-foreground/30">18m</span>
              </div>
              <div className="text-[8px] font-medium text-muted-foreground/50 truncate">
                MST-1 schedule released
              </div>
            </div>
          </motion.div>

          {/* Card 1 (Top) — Attendance Alert (hero card) */}
          <motion.div
            variants={{
              hover: {
                y: 8,
                scale: 1.04,
                transition: { type: 'spring', stiffness: 350, damping: 25, delay: 0.06 },
              },
            }}
            className="absolute inset-x-0 top-4 rounded-xl border border-red-500/20 bg-card shadow-[0_8px_30px_-8px_rgba(239,68,68,0.15)] backdrop-blur-md p-3.5 z-20 overflow-hidden"
          >
            <div className="flex items-center gap-3">
              <div className="shrink-0 size-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="size-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-black text-foreground tracking-tight">
                    Attendance Alert
                  </span>
                  <span className="text-[7px] font-medium text-red-400/60">2m ago</span>
                </div>
                <div className="text-[8px] font-medium text-muted-foreground mt-0.5">
                  Section B dropped to <span className="text-red-500 font-black">74.2%</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-2.5 h-1 w-full bg-muted/30 rounded-full overflow-hidden">
              <motion.div
                variants={{
                  hover: {
                    width: '74.2%',
                    transition: { duration: 1.2, ease: 'circOut', delay: 0.15 },
                  },
                }}
                initial={{ width: '0%' }}
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-400"
              />
            </div>
          </motion.div>
        </div>
      </div>

      <div className="space-y-1">
        <h4 className="text-xl font-bold tracking-tight font-[var(--font-instrument-sans)] flex items-center gap-2">
          Smart Alerts
          <div className="size-1.5 rounded-full bg-red-500 animate-pulse" />
        </h4>
        <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
          Real-time attendance warnings and schedule updates.
        </p>
      </div>
    </motion.div>
  );
}
