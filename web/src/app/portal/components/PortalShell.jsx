'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { LogOut, RefreshCw } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';
import { Button } from 'components/ui/button';
import { fetchMe, fetchPortalSdkSession } from 'lib/api';
import { SessionExpiredError } from 'lib/api';
import { motion } from 'framer-motion';
import { cn } from 'lib/utils';
import {
  tabs,
  adminTabs,
  glassPanel,
  darkPanel,
  SHOW_PORTAL_DIAGNOSTICS,
  STALE_ON_FOCUS_MS,
  AUTO_REFRESH_INTERVAL_MS
} from '../constants';
import HydrationStatusPanel from './HydrationStatusPanel';

const tabLoadingState = (
  <div className="surface-card flex min-h-[220px] items-center justify-center p-6 text-sm text-muted-foreground">
    Loading section...
  </div>
);

const AttendanceView = dynamic(() => import('./AttendanceView'), { loading: () => tabLoadingState });
const GradesView = dynamic(() => import('./GradesView'), { loading: () => tabLoadingState });
const ExamsView = dynamic(() => import('./ExamsView'), { loading: () => tabLoadingState });
const SubjectsView = dynamic(() => import('./SubjectsView'), { loading: () => tabLoadingState });
const FeesView = dynamic(() => import('./FeesView'), { loading: () => tabLoadingState });
const ProfileView = dynamic(() => import('./ProfileView'), { loading: () => tabLoadingState });
const AnalyticsView = dynamic(() => import('./AnalyticsView'), { loading: () => tabLoadingState });

/** Format milliseconds ago into a human label like "just now", "3 min ago", "2 hr ago" */
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
  const [sdkSession, setSdkSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [agoLabel, setAgoLabel] = useState('just now');
  const lastHiddenAt = useRef(null);

  const onExpired = useCallback(() => {
    onLogout();
  }, [onLogout]);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastRefreshedAt(Date.now());
    setAgoLabel('just now');
  }, []);

  // ── Initial SDK session + user fetch ──────────────────────────────
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
          onLogout();
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

  // ── Auto-refresh every AUTO_REFRESH_INTERVAL_MS ───────────────────
  useEffect(() => {
    const id = setInterval(triggerRefresh, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [triggerRefresh]);

  // ── Refresh when tab becomes visible after STALE_ON_FOCUS_MS ──────
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

  // ── Tick the "X min ago" label every 30 s ────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setAgoLabel(formatAgo(Date.now() - lastRefreshedAt));
    }, 30_000);
    return () => clearInterval(id);
  }, [lastRefreshedAt]);

  const semester = sdkSession?.latestSemester?.registration_id;
  const semesters = useMemo(() => sdkSession?.semesters || [], [sdkSession]);

  const displayedTabs = currentUser?.role === 'admin' ? adminTabs : tabs;

  useEffect(() => {
    if (!displayedTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('attendance');
    }
  }, [activeTab, displayedTabs]);

  const content = useMemo(() => {
    const viewProps = { token, onExpired };
    if (activeTab === 'attendance') return <AttendanceView key={refreshKey} {...viewProps} />;
    if (activeTab === 'grades') return <GradesView key={refreshKey} {...viewProps} />;
    if (activeTab === 'exams') return <ExamsView key={refreshKey} {...viewProps} semesters={semesters} />;
    if (activeTab === 'subjects') return <SubjectsView key={refreshKey} {...viewProps} semesters={semesters} defaultSemester={semester} />;
    if (activeTab === 'fees') return <FeesView key={refreshKey} {...viewProps} semesters={semesters} />;
    if (activeTab === 'analytics') return <AnalyticsView key={refreshKey} {...viewProps} />;
    return <ProfileView key={refreshKey} {...viewProps} />;
  }, [activeTab, semester, semesters, token, onExpired, refreshKey]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 pb-40 sm:px-6 sm:pb-36 lg:px-8">
      <header className={`mb-8 p-6 sm:p-8 ${glassPanel}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">INSTITUTIONAL PORTAL</p>
            <h1 className="font-[var(--font-instrument-sans)] text-3xl font-bold tracking-tightest sm:text-4xl text-foreground">JPortal</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TopPanelTools />
            <div className="h-8 w-px bg-border/40 mx-1" />
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="secondary"
                disabled={isRefreshing}
                onClick={triggerRefresh}
                size="sm"
                className="rounded-none border-border/50 h-9 font-bold"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'REFRESHING...' : 'REFRESH'}
              </Button>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Sync: {agoLabel}</span>
            </div>
          </div>
        </div>
      </header>

      {SHOW_PORTAL_DIAGNOSTICS ? <HydrationStatusPanel diagnostics={sdkSession?.diagnostics} /> : null}

      <div className="relative z-10">
        {content}
      </div>

      <nav aria-label="Portal sections" className={`fixed bottom-10 left-1/2 z-40 flex w-[min(940px,94vw)] -translate-x-1/2 items-center justify-between gap-1 p-2 ${darkPanel}`}>
        {displayedTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              aria-label={`Open ${tab.label}`}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-none py-3 text-[10px] font-bold uppercase tracking-widest transition-all duration-300 relative ${
                active ? 'text-primary' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <Icon className={cn("h-4 w-4", active ? "scale-110" : "opacity-60")} />
              <span className="hidden sm:inline">{tab.label}</span>
              {active && (
                <motion.div 
                  layoutId="portal-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </main>
  );
}
