'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight, 
  BookOpen, 
  LayoutDashboard, 
  Activity, 
  TrendingUp, 
  History, 
  Shield, 
  Smartphone, 
  Zap,
  Lock,
  Bell,
  BarChart3,
  FileText,
  Download,
  AlertCircle,
  Calendar,
  Layers,
  Wallet,
  Calculator,
  Search,
  CheckCircle2,
  Orbit,
  Cpu
} from 'lucide-react';
import Navbar from 'components/Navbar';
import { Badge } from 'components/ui/badge';
import { cn } from 'lib/utils';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
};

const springConfig = { type: 'spring', stiffness: 300, damping: 30 };

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-background selection:bg-primary selection:text-primary-foreground overflow-x-hidden font-[var(--font-manrope)]">
      <Navbar />
      
      {/* Background Architectural Patterns */}
      <div className="fixed inset-0 dot-grid opacity-[0.15] pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-b from-background via-transparent to-background pointer-events-none" />

      <div className="relative pt-32 pb-24 md:pt-48 md:pb-40 lg:pt-56">
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="relative w-full space-y-24 md:space-y-40 px-6 md:px-12 max-w-7xl mx-auto"
        >
          {/* ── Monumental Hero Section ─────────────────────────── */}
          <motion.section variants={item} className="max-w-5xl mx-auto text-center space-y-10">
            <div className="space-y-6">
              <h2 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tightest leading-[0.95] text-foreground font-[var(--font-instrument-sans)]">
                 The academic <br />
                 <span className="text-primary font-medium tracking-tight">dashboard</span><br />
                 <span className="italic opacity-90">for Jiit students.</span>
              </h2>
              
              <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
                Consolidate your attendance, grades, and materials into a high-performance 
                private workspace. Built for the daily workflows of JIIT.
              </p>
            </div>
          </motion.section>

          {/* ── Refined Primary Flagship Cards ─────────────────── */}
          <motion.section variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 max-w-5xl mx-auto">
            <Link href="/portal" className="group block">
              <div className="h-full flex flex-col bg-card rounded-[2rem] border border-border/50 shadow-xl hover:border-primary/20 hover:shadow-2xl transition-all duration-500 spotlight-card overflow-hidden group">
                <div className="p-8 md:p-10 space-y-6 flex-1 relative z-10">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm border border-border/50 group-hover:border-primary/20">
                    <LayoutDashboard className="h-7 w-7" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-4xl font-bold tracking-tight leading-none group-hover:translate-x-1 transition-transform duration-500 text-foreground font-[var(--font-instrument-sans)]">
                      Student Portal
                    </h3>
                    <p className="text-muted-foreground leading-relaxed max-w-sm text-base font-medium opacity-80">
                      Clear insights into your attendance, grades, and academic standing.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                     <Badge variant="outline" className="px-3 py-1 bg-muted/40 border-border/50 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">REAL-TIME SYNC</Badge>
                     <Badge variant="outline" className="px-3 py-1 bg-muted/40 border-border/50 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">ATTENDANCE MARGINS</Badge>
                  </div>
                </div>
                <div className="px-8 pb-8 md:px-10 md:pb-10 relative z-10">
                  <div className="pro-button rounded-xl h-16 flex items-center justify-center gap-2 group-hover:scale-[1.01] transition-all duration-300 text-lg font-bold group-hover:-translate-y-1">
                    Enter Portal <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/study-material" className="group block">
              <div className="h-full flex flex-col bg-card rounded-[2rem] border border-border/50 shadow-xl hover:border-primary/20 hover:shadow-2xl transition-all duration-500 spotlight-card overflow-hidden group">
                <div className="p-8 md:p-10 space-y-6 flex-1 relative z-10">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm border border-border/50 group-hover:border-primary/20">
                    <BookOpen className="h-7 w-7" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-4xl font-bold tracking-tight leading-none group-hover:translate-x-1 transition-transform duration-500 text-foreground font-[var(--font-instrument-sans)]">
                      Material Vault
                    </h3>
                    <p className="text-muted-foreground leading-relaxed max-w-sm text-base font-medium opacity-80">
                      The most curated collection of notes, PYQs, and solutions for JIIT.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                     <Badge variant="outline" className="px-3 py-1 bg-muted/40 border-border/50 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">SLIDES</Badge>
                     <Badge variant="outline" className="px-3 py-1 bg-muted/40 border-border/50 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">PYQS</Badge>
                     <Badge variant="outline" className="px-3 py-1 bg-muted/40 border-border/50 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">ALL RESOURCES</Badge>
                  </div>
                </div>
                <div className="px-8 pb-8 md:px-10 md:pb-10 relative z-10">
                  <div className="pro-button rounded-xl h-16 flex items-center justify-center gap-2 group-hover:scale-[1.01] transition-all duration-300 text-lg font-bold group-hover:-translate-y-1">
                    Browse Library <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.section>

          {/* ── Extreme Fidelity Interactive Bento Features Grid ── */}
          <motion.section variants={item} className="space-y-16">
            <div className="text-center space-y-4">
              <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground font-[var(--font-instrument-sans)] underline decoration-primary/20 underline-offset-8">The Full Suite</h3>
              <p className="text-muted-foreground font-medium max-w-xl mx-auto">Consolidated functional dashboard for the JIIT ecosystem.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[20rem]">
              
              {/* Feature 1: Smart Alerts (Exact Notification UI) */}
              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col justify-between spotlight-card">
                 <div className="flex-1 flex items-center justify-center pt-8">
                    <div className="relative w-full max-w-[180px] space-y-3">
                       <motion.div variants={{ hover: { x: 8, opacity: 1 } }} initial={{ opacity: 0.4 }} transition={springConfig} className="flex items-center gap-3 p-3 bg-secondary rounded-xl border border-border/50 shadow-sm">
                          <Bell className="h-4 w-4 text-primary" />
                          <div className="text-[10px] font-bold tracking-tight opacity-40">MST-1 Datesheet Out</div>
                       </motion.div>
                       <motion.div variants={{ hover: { scale: 1.05, x: -8 } }} transition={springConfig} className="flex items-center gap-3 p-3.5 bg-card border border-border shadow-2xl rounded-xl z-20">
                          <AlertCircle className="h-5 w-5 text-red-500 animate-pulse" />
                          <div className="space-y-0.5">
                             <div className="text-[11px] font-black text-foreground">Attendance Alert</div>
                             <div className="text-[9px] font-bold text-muted-foreground tracking-tight opacity-60">Section B: 74.2%</div>
                          </div>
                       </motion.div>
                    </div>
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-xl font-bold tracking-tight font-[var(--font-instrument-sans)]">Smart Alerts</h4>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">Real-time attendance warnings and schedule updates.</p>
                 </div>
              </motion.div>

              {/* Feature 2: Grade Analytics (2x1 WIDE - Exact GPA UI) */}
              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col md:flex-row justify-between spotlight-card md:col-span-2">
                 <div className="flex-1 space-y-4 flex flex-col justify-center">
                    <div className="space-y-2">
                       <motion.div variants={{ hover: { y: -2 } }} transition={springConfig} className="flex items-baseline gap-2">
                          <span className="text-5xl font-black text-primary font-[var(--font-instrument-sans)]">8.41</span>
                          <span className="text-xs font-bold text-muted-foreground uppercase opacity-40 tracking-widest">SGPA</span>
                       </motion.div>
                       <h4 className="text-2xl font-bold tracking-tight font-[var(--font-instrument-sans)]">Grade Analytics</h4>
                       <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-sm">
                         Visual trends across semesters with high-accuracy GPA prediction engine.
                       </p>
                    </div>
                 </div>
                 <div className="flex-1 flex items-end justify-end gap-2 pb-2">
                    {[35, 60, 40, 85, 50, 95, 45, 100].map((h, i) => (
                       <motion.div key={i} variants={{ hover: { height: h, opacity: 1 } }} initial={{ height: 15, opacity: 0.2 }} transition={{ ...springConfig, delay: i * 0.04 }} className="w-4 bg-primary rounded-t-sm" />
                    ))}
                 </div>
              </motion.div>

              {/* Feature 3: PYQ Hub (1x2 TALL - Document UI) */}
              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col justify-between spotlight-card md:row-span-2">
                 <div className="flex-1 flex items-center justify-center relative pt-24 pb-8">
                    <div className="relative">
                       <motion.div variants={{ hover: { rotate: -18, x: -25, y: -10 } }} transition={springConfig} className="absolute inset-0 h-40 w-28 bg-secondary rounded-xl border border-border/80 shadow-md flex items-center justify-center -rotate-6 z-0 group-hover:opacity-60 transition-opacity">
                          <div className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-widest -rotate-90">15B17CI311</div>
                       </motion.div>
                       <motion.div variants={{ hover: { rotate: 18, x: 25, y: -10 } }} transition={springConfig} className="absolute inset-0 h-40 w-28 bg-secondary rounded-xl border border-border/80 shadow-md flex items-center justify-center rotate-6 z-10 group-hover:opacity-60 transition-opacity">
                          <div className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-widest rotate-90">15B11CI111</div>
                       </motion.div>
                       <div className="relative h-40 w-28 bg-card rounded-xl border border-border/80 shadow-2xl flex flex-col items-center justify-center p-4 z-20 space-y-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><FileText className="h-5 w-5" /></div>
                          <div className="space-y-1 w-full">
                             <div className="h-1 w-full bg-muted rounded-full" />
                             <div className="h-1 w-[80%] bg-muted rounded-full" />
                          </div>
                          <div className="text-[8px] font-black text-center text-primary/40 uppercase tracking-tighter pt-2">Data Structures</div>
                       </div>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <h4 className="text-2xl font-bold tracking-tight font-[var(--font-instrument-sans)]">PYQ Hub</h4>
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                      Deep repository with 1300+ documents. Indexed by course codes for lightning-fast retrieval during exams.
                    </p>
                 </div>
              </motion.div>

              {/* Feature 4: Exam Manager (Exact Datesheet UI) */}
              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col justify-between spotlight-card">
                 <div className="flex-1 flex items-center justify-center pt-4">
                    <motion.div variants={{ hover: { y: -5 } }} transition={springConfig} className="w-full max-w-[160px] rounded-xl border border-border shadow-xl bg-card overflow-hidden">
                       <div className="bg-secondary px-3 py-2 border-b border-border flex justify-between items-center">
                          <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Datesheet</span>
                          <div className="relative flex items-center justify-center">
                             <div className="size-1.5 rounded-full bg-red-500 relative z-10" />
                             <motion.div 
                                animate={{ scale: [1, 2.5], opacity: [0.5, 0] }} 
                                transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                                className="absolute size-4 rounded-full border border-red-500/50" 
                             />
                          </div>
                       </div>
                       <div className="p-3 space-y-2">
                          <div className="flex justify-between items-center">
                             <div className="text-[10px] font-bold text-foreground">T1: 15 Sep</div>
                             <div className="text-[8px] font-medium text-muted-foreground uppercase">Row A2</div>
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
                    <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">Exam Manager</h4>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">Exact datesheets & seating plan tracking.</p>
                 </div>
              </motion.div>

              {/* Feature 5: Predictor (Exact Safety UI) */}
              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col justify-between spotlight-card">
                 <div className="flex-1 flex flex-col items-center justify-center pt-4 relative">
                    <div className="relative size-24 flex items-center justify-center">
                       <motion.svg className="size-full -rotate-90">
                          <motion.circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-muted/20" />
                          <motion.circle 
                             cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" strokeDasharray="251" 
                             variants={{ hover: { strokeDashoffset: 50, transition: { duration: 0.8, ease: "circOut" } } }} 
                             initial={{ strokeDashoffset: 251 }} 
                             fill="transparent" className="text-primary" />
                       </motion.svg>
                       <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
                          <div className="text-2xl font-black text-foreground font-[var(--font-instrument-sans)] leading-none">81%</div>
                          <div className="text-[7px] font-bold text-green-500 uppercase tracking-[0.2em] mt-1">+2 SAFE</div>
                       </div>
                    </div>
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">Margin Predictor</h4>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">Calculate exact classes to miss for 75%.</p>
                 </div>
              </motion.div>

              {/* Feature 6: Fee Monitor (Exact Wallet UI) */}
              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col justify-between spotlight-card">
                 <div className="flex-1 flex items-center justify-center pt-4">
                    <motion.div variants={{ hover: { scale: 1.05, rotate: 2 } }} transition={springConfig} className="w-full max-w-[140px] p-4 bg-secondary rounded-xl border border-border shadow-md space-y-4">
                       <div className="flex justify-between items-start">
                          <Wallet className="h-5 w-5 text-primary opacity-40" />
                          <div className="relative">
                             <motion.div 
                                variants={{ 
                                   hover: { 
                                      scale: 1, 
                                      opacity: 1,
                                      rotate: -12,
                                      transition: { type: "spring", stiffness: 500, damping: 15 }
                                   } 
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
                          <div className="text-[8px] font-bold text-muted-foreground uppercase opacity-40 tracking-[0.1em]">Hostel + Tuition</div>
                       </div>
                    </motion.div>
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">Fee Monitor</h4>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">Real-time dues & receipt tracking.</p>
                 </div>
              </motion.div>

              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col justify-between spotlight-card">
                 <div className="flex-1 flex flex-col items-center justify-center pt-4 relative">
                    {/* Morphing Container (Stable Geometry) */}
                    <motion.div 
                       layout
                       variants={{ 
                          hover: { 
                             width: "100%", 
                             height: "140px",
                             borderRadius: "0px",
                             backgroundColor: "hsl(var(--card))",
                             boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                             transition: { type: "spring", stiffness: 200, damping: 35 }
                          } 
                       }}
                       initial={{ 
                          width: "160px", 
                          height: "38px", 
                          borderRadius: "0px",
                          backgroundColor: "hsl(var(--secondary))"
                       }}
                       className="relative border border-border flex flex-col overflow-hidden shadow-sm"
                    >
                       {/* Pre-filled Subject ID (Glides smoothly from center) */}
                       <motion.div layout className="flex-1 flex flex-col h-full">
                          <motion.div 
                             layout
                             className={cn(
                                "flex h-full",
                                "group-hover:justify-between group-hover:p-4 justify-center items-center group-hover:items-start"
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
                                <Badge variant="secondary" className="text-[7px] px-1.5 py-0 font-bold">4 CREDITS</Badge>
                             </motion.div>
                          </motion.div>

                          <motion.div 
                             variants={{ hover: { opacity: 1, y: 0, transition: { delay: 0.1 } } }}
                             initial={{ opacity: 0, y: 10 }}
                             className="px-4 pb-4 space-y-3 -mt-6 hidden group-hover:block"
                          >
                             <div className="space-y-1">
                                <div className="text-[11px] font-bold text-foreground">Data Structures</div>
                                <div className="text-[8px] font-medium text-muted-foreground opacity-60">Core Course • CS/IT</div>
                             </div>

                             <motion.div 
                                variants={{ hover: { opacity: 1, scaleX: 1, transition: { delay: 0.2 } } }}
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
                          <Search className="h-3 w-3 text-muted-foreground/40" />
                       </motion.div>
                    </motion.div>
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">Subject Lookup</h4>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed tracking-tight">Access complete course syllabi.</p>
                 </div>
              </motion.div>

              {/* Feature 8: Privacy First (Vault Visual) */}
              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col justify-between spotlight-card">
                 <div className="flex-1 flex items-center justify-center pt-4">
                    <div className="relative">
                       <motion.div variants={{ hover: { rotate: 90, scale: 1.1 } }} transition={{ ...springConfig, duration: 1 }} className="size-16 rounded-full border-2 border-dashed border-primary/20 flex flex-col items-center justify-center">
                          <div className="size-2 bg-primary rounded-full animate-pulse" />
                       </motion.div>
                       <div className="absolute inset-0 flex items-center justify-center">
                          <Lock className="h-6 w-6 text-foreground group-hover:text-primary transition-colors" />
                       </div>
                    </div>
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">On-Device Zero</h4>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">No data ever leaves your device.</p>
                 </div>
              </motion.div>

              {/* Feature 9: PWA App (Exact Native UI) */}
              <motion.div whileHover="hover" className="bento-card group p-8 flex flex-col justify-between spotlight-card">
                 <div className="flex-1 flex items-center justify-center pt-8 overflow-hidden relative">
                    <motion.div variants={{ hover: { y: -10 } }} transition={springConfig} className="relative h-48 w-32 bg-[#050505] rounded-t-3xl border-x-[4px] border-t-[4px] border-border shadow-2xl p-4 translate-y-8">
                       <div className="h-1 w-10 bg-[#333] mx-auto rounded-full mb-6" />
                       <div className="size-10 rounded-xl bg-primary flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                          <Download className="h-5 w-5 text-primary-foreground" />
                       </div>
                       <motion.div variants={{ hover: { opacity: 1, y: 0 } }} initial={{ opacity: 0, y: 10 }} className="absolute inset-x-4 bottom-12 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-[8px] font-black uppercase tracking-widest text-muted-foreground">INSTALL</motion.div>
                    </motion.div>
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-lg font-bold tracking-tight font-[var(--font-instrument-sans)]">PWA Ready</h4>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">Native-grade cross-platform app.</p>
                 </div>
              </motion.div>

            </div>
          </motion.section>

        </motion.div>
      </div>
    </main>
  );
}
