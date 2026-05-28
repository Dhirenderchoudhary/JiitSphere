'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/ui/card';
import { stepBadgeClass } from '../utils';

export default function HydrationStatusPanel({ diagnostics }) {
  if (!diagnostics) return null;

  const entries = Object.entries(diagnostics.steps || {});

  return (
    <Card className="mb-4 border-border bg-card/90">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Portal Sync Diagnostics</CardTitle>
        <CardDescription>
          Overall: {diagnostics.overall || 'unknown'}
          {diagnostics.reason ? ` • ${diagnostics.reason}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!entries.length ? (
          <p className="text-xs text-muted-foreground">No hydration steps were recorded yet.</p>
        ) : null}
        {entries.map(([name, step]) => (
          <div
            key={name}
            className="rounded-lg border border-border/70 bg-white/70 dark:bg-slate-900/60 p-3 text-xs"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{name}</p>
              <span
                className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${stepBadgeClass(step.status)}`}
              >
                {step.status || 'unknown'}
              </span>
            </div>
            <p className="text-muted-foreground">Endpoint: {step.endpoint || '-'}</p>
            <p className="text-muted-foreground">
              HTTP: {step.httpStatus ?? '-'} • Response: {step.responseStatus || '-'}
            </p>
            {step.message ? <p className="text-muted-foreground">Message: {step.message}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
