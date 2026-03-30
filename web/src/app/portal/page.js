'use client';

import { useEffect, useState } from 'react';
import { TOKEN_KEY, PORTAL_VERIFIED_KEY } from './constants';
import { LoginView, PortalShell } from './components';

export default function PortalPage() {
  const [token, setToken] = useState('');

  useEffect(() => {
    const verified = window.localStorage.getItem(PORTAL_VERIFIED_KEY) === 'true';
    const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';
    if (!verified) {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken('');
      return;
    }
    setToken(savedToken);
  }, []);

  const handleAuth = (nextToken) => {
    setToken(nextToken);
  };

  const handleLogout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(PORTAL_VERIFIED_KEY);
    setToken('');
  };

  if (!token) {
    return <LoginView onAuth={handleAuth} />;
  }

  return <PortalShell token={token} onLogout={handleLogout} />;
}
