'use client';

import { useEffect, useCallback, useState, useLayoutEffect } from 'react';
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

// Hook for SSR-safe synchronous layout check
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function PortalPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [isRoutingAway, setIsRoutingAway] = useState(false);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(PORTAL_VERIFIED_KEY);
    window.localStorage.removeItem(LOGIN_AT_KEY);
    setToken('');
  }, []);

  // Use synchronous layout effect to prevent any blank screen or flash on valid sessions
  useIsomorphicLayoutEffect(() => {
    const verified = window.localStorage.getItem(PORTAL_VERIFIED_KEY) === 'true';
    const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';

    if (!verified || !savedToken || isTokenExpired(savedToken)) {
      clearSession();
      setIsRoutingAway(true);
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
        setIsRoutingAway(true);
        router.replace('/login');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [clearSession, router]);

  const handleLogout = useCallback(() => {
    clearSession();
    setIsRoutingAway(true);
    router.replace('/login');
  }, [clearSession, router]);

  // If we are routing away or don't have a token yet (very briefly on mount)
  if (isRoutingAway || !token) {
    return <div className="min-h-screen bg-background" />;
  }

  // Instantly mount the shell
  return <PortalShell token={token} onLogout={handleLogout} />;
}
