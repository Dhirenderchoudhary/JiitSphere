'use client';

import { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';
import { Button } from 'components/ui/button';
import { fetchMe, fetchPortalSdkSession } from 'lib/api';
import { tabs, adminTabs, glassPanel, darkPanel, SHOW_PORTAL_DIAGNOSTICS } from '../constants';
import AttendanceView from './AttendanceView';
import GradesView from './GradesView';
import ExamsView from './ExamsView';
import SubjectsView from './SubjectsView';
import FeesView from './FeesView';
import ProfileView from './ProfileView';
import AnalyticsView from './AnalyticsView';
import HydrationStatusPanel from './HydrationStatusPanel';

export default function PortalShell({ token, onLogout }) {
  const [activeTab, setActiveTab] = useState('attendance');
  const [sdkSession, setSdkSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    fetchPortalSdkSession(token, false)
      .then((response) => setSdkSession(response?.data || null))
      .catch(() => {
        onLogout();
      });
  }, [token, onLogout]);

  useEffect(() => {
    fetchMe(token)
      .then((response) => setCurrentUser(response?.data?.user || null))
      .catch(() => setCurrentUser(null));
  }, [token]);

  const semester = sdkSession?.latestSemester?.registration_id;
  const semesters = useMemo(() => sdkSession?.semesters || [], [sdkSession]);

  const displayedTabs = currentUser?.role === 'admin' ? adminTabs : tabs;

  useEffect(() => {
    if (!displayedTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('attendance');
    }
  }, [activeTab, displayedTabs]);

  const content = useMemo(() => {
    if (activeTab === 'attendance') return <AttendanceView token={token} />;
    if (activeTab === 'grades') return <GradesView token={token} />;
    if (activeTab === 'exams') return <ExamsView token={token} semesters={semesters} />;
    if (activeTab === 'subjects') return <SubjectsView token={token} semesters={semesters} defaultSemester={semester} />;
    if (activeTab === 'fees') return <FeesView token={token} semesters={semesters} />;
    if (activeTab === 'analytics') return <AnalyticsView token={token} />;
    return <ProfileView token={token} />;
  }, [activeTab, semester, semesters, token]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-[radial-gradient(circle_at_10%_0%,rgba(14,165,233,0.10),transparent_40%),radial-gradient(circle_at_90%_100%,rgba(251,191,36,0.08),transparent_35%)] px-4 py-5 pb-28 sm:px-6 sm:pb-24 lg:px-8">
      <header className={`mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${glassPanel}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Your Jaypee Buddy</p>
          <h1 className="font-[var(--font-archivo)] text-3xl font-black">JPortal</h1>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <TopPanelTools />
          <Button variant="secondary" onClick={onLogout} className="w-full border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 sm:w-auto">
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      {SHOW_PORTAL_DIAGNOSTICS ? <HydrationStatusPanel diagnostics={sdkSession?.diagnostics} /> : null}

      {content}

      <nav className={`fixed bottom-2 left-1/2 z-30 flex w-[min(980px,96vw)] -translate-x-1/2 items-center justify-between gap-1 p-1.5 sm:bottom-3 sm:w-[min(900px,92vw)] sm:p-2 ${darkPanel}`}>
        {displayedTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition sm:px-2 sm:text-[11px] ${
                active ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-cyan-50 dark:hover:bg-slate-800'
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
