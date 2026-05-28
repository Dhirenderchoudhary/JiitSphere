'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from 'components/ui/button';

export default function StudyMaterialError({ reset }) {
  return (
    <main className="page-shell flex min-h-[70vh] items-center justify-center py-10">
      <div className="surface-card w-full max-w-lg p-6 text-center sm:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-black">Unable to load Study Material</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading this page. You can retry or go back to home.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={reset}>
            Try Again
          </Button>
          <Link href="/">
            <Button type="button" variant="secondary">
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
