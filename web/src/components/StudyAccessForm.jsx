'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import HistoryBackButton from 'components/HistoryBackButton';

/* Google "G" SVG mark */
function GoogleIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export default function StudyAccessForm({ nextPath = '/study-material' }) {
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [authError, setAuthError] = useState('');
  const searchParams = useSearchParams();

  const mapAuthError = (code) => {
    const value = String(code || '').trim();
    if (!value) return '';
    if (value === 'AccessDenied') {
      return 'Only @mail.jiit.ac.in accounts are allowed for study material access.';
    }
    if (value === 'OAuthSignin' || value === 'OAuthCallback' || value === 'OAuthCreateAccount') {
      return 'Google sign-in failed. Please retry in a moment.';
    }
    if (value === 'OAuthAccountNotLinked') {
      return 'This Google account is not linked for study material access.';
    }
    if (value === 'Configuration') {
      return 'Sign-in is temporarily unavailable. Please contact support.';
    }
    return 'Sign-in could not be completed. Please try again.';
  };

  useEffect(() => {
    const error = searchParams?.get('error') || '';
    setAccessDenied(error === 'AccessDenied');
    setAuthError(error ? mapAuthError(error) : '');
  }, [searchParams]);

  const handleGoogleSignIn = () => {
    setLoading(true);
    setAccessDenied(false);
    setAuthError('');
    const url = `/api/auth/google/start?next=${encodeURIComponent(nextPath)}`;
    window.location.href = url;
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      if (res.ok) {
        window.location.assign(nextPath);
      }
    } catch (_err) {
      // ignore
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        {/* Logo + title */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="overflow-hidden rounded-2xl border border-border bg-card/90 dark:bg-card/80 shadow-sm">
            <Image src="/jiitsphere-logo.png" alt="JiitSphere" width={56} height={56} priority />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Jaypee Institute of IT</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight">Study Material</h1>
          </div>
        </div>

        {/* Card */}
        <Card className="bg-card/90 dark:bg-card/80 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] backdrop-blur">
          <CardContent className="space-y-5 p-6">

          {authError ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/50">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{authError}</p>
            </div>
          ) : null}

          {/* Error banner — wrong account domain */}
          {accessDenied ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Access denied</p>
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">
                  Only <span className="font-bold">@mail.jiit.ac.in</span> accounts are allowed.
                  Please use your JIIT G-Suite college ID.
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <h2 className="text-base font-bold">Sign in with Google</h2>
            <p className="text-sm text-muted-foreground">
              Use your college account{' '}
              <span className="font-semibold text-foreground">@mail.jiit.ac.in</span>{' '}
              to access study material.
            </p>
          </div>

          <Button
            size="lg"
            className="w-full gap-3 text-sm font-semibold"
            onClick={handleGoogleSignIn}
            disabled={loading}
            aria-label="Continue with Google account"
          >
            {loading ? <Spinner /> : <GoogleIcon />}
            {loading ? 'Redirecting to Google…' : 'Continue with Google'}
          </Button>

          <div className="relative flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            size="lg"
            variant="outline"
            className="w-full gap-3 text-sm font-semibold"
            onClick={handleGuestLogin}
            disabled={guestLoading}
            aria-label="Continue as guest with limited downloads"
          >
            {guestLoading ? <Spinner /> : <UserRound className="h-5 w-5" />}
            {guestLoading ? 'Entering…' : 'Continue as Guest'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Guest access is limited to 5 downloads.
          </p>

          <HistoryBackButton fallbackHref="/" className="w-full text-muted-foreground">
            ← Back
          </HistoryBackButton>
          </CardContent>
        </Card>

        {/* Footer note */}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Only <span className="font-semibold text-foreground">@mail.jiit.ac.in</span> accounts are permitted.
        </p>
      </div>
    </main>
  );
}


