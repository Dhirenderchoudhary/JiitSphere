'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TOKEN_KEY, PORTAL_VERIFIED_KEY } from '../portal/constants';
import LoginView from '../portal/components/LoginView';

export default function LoginPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const verified = window.localStorage.getItem(PORTAL_VERIFIED_KEY) === 'true';
    const savedToken = window.localStorage.getItem(TOKEN_KEY) || '';

    if (verified && savedToken) {
      router.replace('/portal');
    }
  }, [router]);

  const handleAuth = (token) => {
    router.push('/portal');
  };

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

  return <LoginView onAuth={handleAuth} />;
}
