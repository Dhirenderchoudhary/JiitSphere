'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LogOut, RefreshCw, BarChart2, Menu, ChevronDown } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';
import { Button } from 'components/ui/button';
import { fetchMe, fetchPortalSdkSession } from 'lib/api';
import { SessionExpiredError } from 'lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from 'lib/utils';
import {
  tabs,
  adminTabs,
  SHOW_PORTAL_DIAGNOSTICS,
  STALE_ON_FOCUS_MS,
  AUTO_REFRESH_INTERVAL_MS
} from '../constants';
import HydrationStatusPanel from './HydrationStatusPanel';

const tabLoadingState = (
  <div className="flex min-h-[400px] w-full items-center justify-center p-6 text-sm text-muted-foreground font-mono uppercase tracking-widest">
    <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Initializing payload...
  </div>
);

const AttendanceView = dynamic(() => import('./AttendanceView'), { loading: () => tabLoadingState });
const GradesView = dynamic(() => import('./GradesView'), { loading: () => tabLoadingState });
const ExamsView = dynamic(() => import('./ExamsView'), { loading: () => tabLoadingState });
const SubjectsView = dynamic(() => import('./SubjectsView'), { loading: () => tabLoadingState });
const FeesView = dynamic(() => import('./FeesView'), { loading: () => tabLoadingState });
const ProfileView = dynamic(() => import('./ProfileView'), { loading: () => tabLoadingState });
const AnalyticsView = dynamic(() => import('./AnalyticsView'), { loading: () => tabLoadingState });

const formatAgo = (ms) => {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hr ago`;
};

export default function PortalShell({ token, onLogout }) {
  const [activeTab, setActiveTab] = useState('attendance');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sdkSession, setSdkSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [cachedPhoto, setCachedPhoto] = useState('');
  const [cachedProfileName, setCachedProfileName] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [agoLabel, setAgoLabel] = useState('just now');
  const [customSidebar, setCustomSidebar] = useState(null);
  const lastHiddenAt = useRef(null);

  const onExpired = useCallback(() => {
    onLogout();
  }, [onLogout]);

  const syncCachedIdentity = useCallback(() => {
    try {
      const identityMode = String(window.localStorage.getItem('jaypee_buddy_identity_mode') || '').toLowerCase();
      const inDemoSession = String(sdkSession?.mode || '').toLowerCase() === 'public-demo' || identityMode === 'demo';
      const savedPhoto = window.localStorage.getItem('jaypee_buddy_cached_photo') || '';
      const savedName = window.localStorage.getItem('jaypee_buddy_cached_profile_name') || '';

      if (!inDemoSession && savedPhoto === '/demo-student-profile.png') {
        window.localStorage.removeItem('jaypee_buddy_cached_photo');
        setCachedPhoto('');
      } else {
        setCachedPhoto(savedPhoto);
      }

      setCachedProfileName(savedName);
    } catch (_error) {
      setCachedPhoto('');
      setCachedProfileName('');
    }
  }, [sdkSession?.mode]);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastRefreshedAt(Date.now());
    setAgoLabel('just now');
  }, []);

  useEffect(() => {
    setIsRefreshing(true);
    fetchPortalSdkSession(token, false)
      .then((response) => {
        setSdkSession(response?.data || null);
        setIsRefreshing(false);
      })
      .catch((err) => {
        setIsRefreshing(false);
        if (err instanceof SessionExpiredError) {
          onExpired();
        } else {
          // Suppress automatic logout on raw network/server errors (500/502).
          // Allow the UI to ride out transient backend blips without destroying user tokens.
          console.warn("Portal Sync Transient Warning:", err?.message || 'Unknown error');
        }
      });
  }, [token, onLogout, onExpired, refreshKey]);

  useEffect(() => {
    fetchMe(token)
      .then((response) => setCurrentUser(response?.data?.user || null))
      .catch((err) => {
        if (err instanceof SessionExpiredError) onExpired();
        else setCurrentUser(null);
      });
  }, [token, onExpired]);

  useEffect(() => {
    syncCachedIdentity();
  }, [activeTab, syncCachedIdentity]);

  useEffect(() => {
    const handleIdentityUpdate = () => {
      syncCachedIdentity();
    };
    window.addEventListener('jaypee-buddy-identity-updated', handleIdentityUpdate);
    return () => {
      window.removeEventListener('jaypee-buddy-identity-updated', handleIdentityUpdate);
    };
  }, [syncCachedIdentity]);

  useEffect(() => {
    const id = setInterval(triggerRefresh, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [triggerRefresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const away = lastHiddenAt.current ? Date.now() - lastHiddenAt.current : Infinity;
        if (away >= STALE_ON_FOCUS_MS) {
          triggerRefresh();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [triggerRefresh]);

  useEffect(() => {
    const id = setInterval(() => {
      setAgoLabel(formatAgo(Date.now() - lastRefreshedAt));
    }, 30_000);
    return () => clearInterval(id);
  }, [lastRefreshedAt]);

  const semester = sdkSession?.latestSemester?.registration_id;
  const semesters = useMemo(() => sdkSession?.semesters || [], [sdkSession]);
  const displayName = cachedProfileName || currentUser?.name || 'Student';

  const displayedTabs = currentUser?.role === 'admin' ? adminTabs : tabs;

  useEffect(() => {
    if (!displayedTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('attendance');
    }
  }, [activeTab, displayedTabs]);

  const content = useMemo(() => {
    const viewProps = { token, onExpired, setCustomSidebar };
    if (activeTab === 'attendance') return <AttendanceView key={refreshKey} {...viewProps} />;
    if (activeTab === 'grades') return <GradesView key={refreshKey} {...viewProps} />;
    if (activeTab === 'exams') return <ExamsView key={refreshKey} {...viewProps} semesters={semesters} />;
    if (activeTab === 'subjects') return <SubjectsView key={refreshKey} {...viewProps} semesters={semesters} defaultSemester={semester} />;
    if (activeTab === 'fees') return <FeesView key={refreshKey} {...viewProps} semesters={semesters} />;
    if (activeTab === 'analytics') return <AnalyticsView key={refreshKey} {...viewProps} />;
    return <ProfileView key={refreshKey} {...viewProps} />;
  }, [activeTab, semester, semesters, token, onExpired, refreshKey]);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Desktop Main Left Sidebar */}
      <aside className="w-[280px] flex-shrink-0 border-r border-border bg-card flex-col z-20 hidden lg:flex shadow-sm">
        {/* Logo Section */}
        <div className="p-6 pb-2">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
             <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-inner">
                <BarChart2 className="w-5 h-5 text-primary-foreground" />
             </div>
             <span className="font-black text-2xl font-[var(--font-instrument-sans)] tracking-tighter">JiitSphere</span>
          </Link>
        </div>
        
        {/* Navigation Wrapper / Custom Contextual Sidebar */}
        {customSidebar ? customSidebar : (
          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar mt-6">
            <div className="px-6 py-2 mb-2">
               <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em]">Platform Core</span>
            </div>
            
            <nav className="px-4 space-y-1">
               {displayedTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = tab.id === activeTab;
                  return (
                     <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id)} 
                        className={cn(
                          "w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 relative", 
                          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                     >
                        <Icon className={cn("w-4 h-4", active ? "opacity-100" : "opacity-60")} />
                        {tab.label}
                        {active && (
                          <motion.div 
                            layoutId="active-sidebar-tab"
                            className="absolute left-0 top-[15%] bottom-[15%] w-1 bg-primary rounded-r-full"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          />
                        )}
                     </button>
                  )
               })}
            </nav>
          </div>
        )}
        
        {/* Persistent User Profile Footer */}
        <div className="p-5 border-t border-border bg-muted/10">
           <button 
               onClick={() => setActiveTab('profile')} 
               className="w-full flex items-center gap-3 px-2 py-1.5 cursor-pointer group hover:bg-muted/50 rounded-xl transition-all"
           >
               <div className="w-10 h-10 shrink-0 rounded-full bg-secondary border border-border shadow-sm flex items-center justify-center overflow-hidden group-hover:border-primary/20 transition-colors">
                  {cachedPhoto ? (
                      <img src={cachedPhoto} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                      <span className="text-sm font-black text-foreground group-hover:text-primary transition-colors">{displayName?.charAt(0) || "S"}</span>
                  )}
               </div>
               <div className="flex flex-col text-left flex-1 min-w-0">
                    <span className="text-sm font-bold truncate group-hover:text-primary transition-colors">{displayName}</span>
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest truncate">View Profile</span>
               </div>
               <div 
                   onClick={(e) => { e.stopPropagation(); onLogout(); }}
                   className="p-1.5 rounded-md hover:bg-rose-500/10 transition-colors"
               >
                   <LogOut className="w-4 h-4 text-muted-foreground/40 hover:text-rose-500 transition-colors" />
               </div>
           </button>
        </div>
      </aside>

      {/* Main Right Content Pipeline */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#fafafa] dark:bg-background/95">
        
        {/* Top Header Bar */}
        <header className="flex items-center justify-between px-4 sm:px-6 lg:px-10 py-4 sm:py-5 bg-card border-b border-border z-10 shrink-0">
           <div className="flex items-center gap-3 sm:gap-4">
              {/* Mobile-only Logo */}
              <Link href="/" className="flex lg:hidden items-center gap-2 hover:opacity-80 transition-opacity">
                 <div className="w-8 h-8 sm:w-9 sm:h-9 bg-primary rounded-lg shadow-inner flex items-center justify-center shrink-0">
                    <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                 </div>
                 <span className="font-black text-xl font-[var(--font-instrument-sans)] tracking-tighter text-foreground pr-2 border-r border-border/50 hidden sm:block">JiitSphere</span>
              </Link>
              
              <div className="flex flex-col min-w-0 justify-center lg:hidden relative">
                 <button 
                     onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                     className="flex items-center gap-2 px-3 py-2 bg-secondary/40 hover:bg-secondary/70 border border-border/60 rounded-xl transition-colors shadow-sm"
                 >
                     <Menu className="w-4 h-4 text-foreground" />
                     <span className="text-sm font-bold truncate max-w-[100px] sm:max-w-[150px]">
                         {displayedTabs.find(t => t.id === activeTab)?.label || 'Menu'}
                     </span>
                     <ChevronDown className="w-3.5 h-3.5 text-muted-foreground opacity-70" />
                 </button>

                 <AnimatePresence>
                     {mobileMenuOpen && (
                         <>
                             <motion.div 
                                 initial={{ opacity: 0 }}
                                 animate={{ opacity: 1 }}
                                 exit={{ opacity: 0 }}
                                 className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm lg:hidden"
                                 onClick={() => setMobileMenuOpen(false)}
                             />
                             <motion.div 
                                 initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                 animate={{ opacity: 1, y: 0, scale: 1 }}
                                 exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                 transition={{ duration: 0.2 }}
                                 className="absolute top-12 left-0 w-64 bg-card border border-border shadow-2xl rounded-2xl z-50 overflow-hidden flex flex-col p-2 space-y-1 lg:hidden origin-top-left"
                             >
                                 {displayedTabs.map(t => {
                                     const TIcon = t.icon;
                                     const isActive = t.id === activeTab;
                                     return (
                                         <button
                                             key={t.id}
                                             onClick={() => { setActiveTab(t.id); setMobileMenuOpen(false); }}
                                             className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors w-full text-left", isActive ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground")}
                                         >
                                             <TIcon className="w-4 h-4" />
                                             {t.label}
                                         </button>
                                     )
                                 })}
                             </motion.div>
                         </>
                     )}
                 </AnimatePresence>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
               <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hidden sm:inline">Synced {agoLabel}</span>
               <div className="h-5 w-px bg-border/50 mx-1 hidden sm:block" />
               <TopPanelTools />
               <Button variant="secondary" size="sm" onClick={triggerRefresh} disabled={isRefreshing} className="h-9 gap-2 shadow-sm rounded-lg font-bold ml-2">
                   <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                   <span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Sync'}</span>
               </Button>
           </div>
        </header>
        
        {/* Dynamic Content Body */}
        <div className={cn("flex-1 relative p-4 lg:p-6 xl:p-8", activeTab === 'attendance' ? "overflow-hidden" : "overflow-y-auto custom-scrollbar")}>
           {SHOW_PORTAL_DIAGNOSTICS ? <HydrationStatusPanel diagnostics={sdkSession?.diagnostics} /> : null}
           {content}
        </div>
      </main>

      {/* Mobile Bottom Navigation Fallback (Visible only < lg screens) */}
      <nav className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 flex w-[min(96vw,420px)] justify-between items-center bg-card/90 backdrop-blur-xl border border-border shadow-2xl rounded-2xl z-50 p-1.5 gap-1">
        {displayedTabs.slice(0, 5).map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn("flex flex-1 flex-col items-center justify-center rounded-xl py-2.5 transition-all relative", active ? "text-primary bg-primary/5" : "text-muted-foreground hover:bg-muted/50")}
            >
              <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
            </button>
          );
        })}
        
        {/* Mobile Profile Navigation Link */}
        <button
          onClick={() => setActiveTab('profile')}
          className={cn("flex flex-1 flex-col items-center justify-center rounded-xl py-2.5 transition-all relative", activeTab === 'profile' ? "bg-primary/5" : "hover:bg-muted/50")}
        >
            <div className={cn("w-[22px] h-[22px] rounded-full overflow-hidden border-2 transition-all flex items-center justify-center bg-secondary", activeTab === 'profile' ? "border-primary scale-110" : "border-border")}>
               {cachedPhoto ? (
                   <img src={cachedPhoto} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                   <span className="text-[10px] font-black text-foreground leading-none">{displayName?.charAt(0) || "S"}</span>
               )}
            </div>
        </button>
      </nav>
    </div>
  );
}
