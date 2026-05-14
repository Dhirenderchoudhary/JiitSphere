'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from 'components/ui/button';

export default function MaterialViewerError({ error, reset }) {
  return (
    <main className="page-shell flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" strokeWidth={1.5} />
        </div>

        <h1 className="mt-5 text-xl font-bold text-foreground">
          Unable to Load Material
        </h1>

        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Something went wrong while loading this study material. The file might be temporarily unavailable or there was a connection issue.
        </p>

        {error?.message && process.env.NEXT_PUBLIC_SHOW_TECHNICAL_DETAILS === 'true' && (
          <div className="mt-4 rounded-xl border border-red-200/50 bg-red-50/50 dark:border-red-800/30 dark:bg-red-950/30 px-4 py-2.5">
            <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={reset} className="gap-2">
            <RefreshCw className="size-4" />
            Try Again
          </Button>
          <Link href="/study-material">
            <Button type="button" variant="secondary" className="gap-2">
              <Home className="size-4" />
              Back to Materials
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
