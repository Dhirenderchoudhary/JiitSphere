'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TOKEN_KEY, PORTAL_VERIFIED_KEY, LOGIN_AT_KEY } from './constants';
import { PortalShell } from './components';

/** Parse JWT exp and normalize to epoch milliseconds (supports seconds or ms). */
const parseJwtExpMs = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4 || 4)) % 4)}`;
    const payload = JSON.parse(atob(padded));
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    return exp > 1_000_000_000_000 ? exp : exp * 1000;
  } catch (_e) {
    return null;
  }
};

const isTokenExpired = (token) => {
  const expMs = parseJwtExpMs(token);
  return expMs !== null && Date.now() >= expMs;
};

export default function PortalPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(PORTAL_VERIFIED_KEY);
    window.localStorage.removeItem(LOGIN_AT_KEY);
    setToken('');
  }, []);

  useEffect(() => {
    setIsMounted(true);
    const verified = window.localStorage.getItem(PORTAL_VERIFIED_KEY) === 'true';
    const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';

    if (!verified || !savedToken) {
      clearSession();
      router.replace('/login');
      return;
    }

    if (isTokenExpired(savedToken)) {
      clearSession();
      router.replace('/login');
      return;
    }

    setToken(savedToken);
  }, [clearSession, router]);

  // Re-check token expiry whenever the tab regains focus
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';
      if (savedToken && isTokenExpired(savedToken)) {
        clearSession();
        router.replace('/login');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [clearSession, router]);

  const handleLogout = useCallback(() => {
    clearSession();
    router.replace('/login');
  }, [clearSession, router]);

  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-3 animate-pulse">
           <div className="size-3 border-2 border-primary/50 rotate-45 shadow-sm" />
           <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Igniting Engine</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-3 animate-pulse">
           <div className="size-3 border-2 border-primary/50 rotate-45 shadow-sm" />
           <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Authenticating</p>
        </div>
      </div>
    );
  }

  return <PortalShell token={token} onLogout={handleLogout} />;
}
