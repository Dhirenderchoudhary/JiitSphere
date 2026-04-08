'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';
import { Button } from 'components/ui/button';
import { fetchMe, fetchPortalSdkSession } from 'lib/api';
import { SessionExpiredError } from 'lib/api';
import {
  tabs,
  adminTabs,
  glassPanel,
  darkPanel,
  SHOW_PORTAL_DIAGNOSTICS,
  STALE_ON_FOCUS_MS,
  AUTO_REFRESH_INTERVAL_MS
} from '../constants';
import AttendanceView from './AttendanceView';
import GradesView from './GradesView';
import ExamsView from './ExamsView';
import SubjectsView from './SubjectsView';
import FeesView from './FeesView';
import ProfileView from './ProfileView';
import AnalyticsView from './AnalyticsView';
import HydrationStatusPanel from './HydrationStatusPanel';

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
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-5 pb-36 sm:px-6 sm:pb-32 lg:px-8">
      <header className={`mb-5 p-4 sm:p-5 ${glassPanel}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Your Jaypee Buddy</p>
            <h1 className="font-[var(--font-archivo)] text-2xl font-black sm:text-3xl">JPortal</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TopPanelTools />
            <div className="flex flex-col items-end gap-0.5">
              <Button
                variant="secondary"
                disabled={isRefreshing}
                onClick={triggerRefresh}
                size="sm"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
              <span className="text-[10px] text-muted-foreground">Updated {agoLabel}</span>
            </div>
            <Button variant="ghost" onClick={onLogout} size="sm" className="text-muted-foreground">
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Logout
            </Button>
          </div>
        </div>
      </header>

      {SHOW_PORTAL_DIAGNOSTICS ? <HydrationStatusPanel diagnostics={sdkSession?.diagnostics} /> : null}

      {content}

      <nav className={`fixed bottom-9 left-1/2 z-30 flex w-[min(980px,96vw)] -translate-x-1/2 items-center justify-between gap-1 p-1.5 sm:bottom-10 sm:w-[min(900px,92vw)] sm:p-2 ${darkPanel}`}>
        {displayedTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-all duration-200 sm:px-2 sm:text-[11px] ${
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
