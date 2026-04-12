import { CalendarClock, ClipboardList, GraduationCap, UserCircle2, BookCopy, DollarSign } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const TOKEN_KEY = 'jaypee_buddy_token';
export const LAST_PORTAL_USER_ID = 'jaypee_buddy_portal_user';
export const PORTAL_VERIFIED_KEY = 'jaypee_buddy_portal_verified';
export const ATTENDANCE_TARGET_KEY_PREFIX = 'jaypee_buddy_attendance_target';
export const LOGIN_AT_KEY = 'jaypee_buddy_login_at';

/** How long (ms) before we treat cached portal data as stale on tab focus */
export const STALE_ON_FOCUS_MS = 5 * 60 * 1000; // 5 minutes
/** Auto-refresh interval (ms) while the portal tab is open */
export const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const envFlag = (value: string | undefined, fallback = 'false') =>
  String(value || fallback).toLowerCase() === 'true';

export const ALLOW_UNVERIFIED_PORTAL_LOGIN =
  envFlag(process.env.NEXT_PUBLIC_ALLOW_UNVERIFIED_PORTAL_LOGIN, 'false');
export const SHOW_PORTAL_DIAGNOSTICS =
  envFlag(process.env.NEXT_PUBLIC_SHOW_PORTAL_DIAGNOSTICS, 'false');
export const SHOW_PORTAL_LOGIN_DIAGNOSTICS =
  envFlag(process.env.NEXT_PUBLIC_SHOW_PORTAL_LOGIN_DIAGNOSTICS, 'false');
export const SHOW_TECHNICAL_DETAILS =
  envFlag(process.env.NEXT_PUBLIC_SHOW_TECHNICAL_DETAILS, 'false');

export type PortalTabId =
  | 'attendance'
  | 'grades'
  | 'exams'
  | 'subjects'
  | 'fees'
  | 'profile'
  | 'analytics';

export type PortalTab = {
  id: PortalTabId;
  label: string;
  icon: LucideIcon;
};

export const tabs: PortalTab[] = [
  { id: 'attendance', label: 'Attendance', icon: ClipboardList },
  { id: 'grades', label: 'Grades', icon: GraduationCap },
  { id: 'exams', label: 'Exams', icon: CalendarClock },
  { id: 'subjects', label: 'Subjects', icon: BookCopy },
  { id: 'fees', label: 'Fees', icon: DollarSign },
  { id: 'profile', label: 'Profile', icon: UserCircle2 }
];

export const adminTabs: PortalTab[] = [
  ...tabs,
  { id: 'analytics', label: 'Analytics', icon: CalendarClock }
];

export const glassPanel = 'rounded-2xl border border-border/40 bg-card shadow-sm';
export const darkPanel = 'rounded-2xl border border-border/40 bg-card/95 shadow-xl backdrop-blur-lg';
