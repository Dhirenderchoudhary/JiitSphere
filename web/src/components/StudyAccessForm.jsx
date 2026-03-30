'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import TopPanelTools from 'components/TopPanelTools';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';

/* Google "G" SVG mark — inline so there's no external image dependency */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function StudyAccessForm({ nextPath = '/study-material' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signIn('google', { callbackUrl: nextPath });
    } catch (_err) {
      setError('Could not start sign-in. Please try again.');
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="mesh-overlay relative w-full overflow-hidden rounded-3xl border border-border bg-white/80 dark:bg-slate-900/65 p-6 shadow-glow backdrop-blur md:p-10">
        <div className="relative z-10 space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Secure Access</p>
              <h1 className="font-[var(--font-archivo)] text-3xl font-black leading-tight md:text-4xl">Study Material Access</h1>
            </div>
            <TopPanelTools />
          </div>

          <Card className="max-w-xl bg-card/95">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                JIIT Student Sign In
              </CardTitle>
              <CardDescription>
                Sign in with your JIIT Google account (<span className="font-medium text-foreground">@mail.jiit.ac.in</span>) to access study material.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                  {error}
                </p>
              ) : null}

              <Button
                size="lg"
                className="w-full gap-3"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <GoogleIcon />
                )}
                {loading ? 'Redirecting to Google...' : 'Continue with Google'}
                {!loading && <ArrowRight className="ml-auto h-4 w-4" />}
              </Button>

              <Button variant="ghost" className="w-full" asChild>
                <Link href="/">Back to Home</Link>
              </Button>
            </CardContent>
          </Card>

          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Only <span className="font-semibold">@mail.jiit.ac.in</span> accounts are permitted.
          </p>
        </div>
      </section>
    </main>
  );
}
