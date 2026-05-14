'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TOKEN_KEY, PORTAL_VERIFIED_KEY } from '../portal/constants';
import LoginView from '../portal/components/LoginView';

export default function LoginPage() {
  const router = useRouter();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const verified = window.localStorage.getItem(PORTAL_VERIFIED_KEY) === 'true';
    const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';

    // If fully verified and we have a token, instantly redirect.
    if (verified && savedToken) {
      router.replace('/portal');
    } else {
      setShouldRender(true);
    }
  }, [router]);

  const handleAuth = (token) => {
    router.push('/portal');
  };

  // Only show the blank background until we confirm no valid session exists.
  // This prevents the "Igniting Engine" flash while still avoiding a flash of the login screen.
  if (!shouldRender) {
    return <div className="min-h-screen bg-background" />;
  }

  return <LoginView onAuth={handleAuth} />;
}
