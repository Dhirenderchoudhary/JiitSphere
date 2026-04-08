'use client';

import { useEffect, useCallback, useState } from 'react';
import { TOKEN_KEY, PORTAL_VERIFIED_KEY, LOGIN_AT_KEY } from './constants';
import { LoginView, PortalShell } from './components';

/** Parse the `exp` field from a base64url JWT without any library. */
const parseJwtExp = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded));
    return typeof payload?.exp === 'number' ? payload.exp : null;
  } catch (_e) {
    return null;
  }
};

const isTokenExpired = (token) => {
  const exp = parseJwtExp(token);
  return exp !== null && Date.now() > exp * 1000;
};

export default function PortalPage() {
  const [token, setToken] = useState('');

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(PORTAL_VERIFIED_KEY);
    window.localStorage.removeItem(LOGIN_AT_KEY);
    setToken('');
  }, []);

  useEffect(() => {
    const verified = window.localStorage.getItem(PORTAL_VERIFIED_KEY) === 'true';
    const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';

    if (!verified || !savedToken) {
      clearSession();
      return;
    }

    if (isTokenExpired(savedToken)) {
      clearSession();
      return;
    }

    setToken(savedToken);
  }, [clearSession]);

  // Re-check token expiry whenever the tab regains focus
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';
      if (savedToken && isTokenExpired(savedToken)) {
        clearSession();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [clearSession]);

  const handleAuth = (nextToken) => {
    window.localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
    setToken(nextToken);
  };

  const handleLogout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  if (!token) {
    return <LoginView onAuth={handleAuth} />;
  }

  return <PortalShell token={token} onLogout={handleLogout} />;
}
