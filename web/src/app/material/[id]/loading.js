import { Card, CardContent, CardHeader } from 'components/ui/card';

export default function MaterialViewerLoading() {
  return (
    <main className="page-shell py-6 sm:py-7">
      {/* Top bar skeleton */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted/60" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted/60" />
        </div>
      </div>

      {/* Card skeleton */}
      <Card className="overflow-hidden bg-card/95 dark:bg-card/80 backdrop-blur">
        <CardHeader className="space-y-4">
          {/* Brand placeholder */}
          <div className="h-6 w-36 animate-pulse rounded-md bg-muted/60" />

          {/* Title placeholder */}
          <div className="space-y-2.5">
            <div className="h-8 w-3/4 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted/40" />
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-6 w-16 animate-pulse rounded-full bg-muted/50" />
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="mx-4 mb-4 sm:mx-0 sm:mb-0">
            {/* Viewer skeleton */}
            <div className="relative flex h-[78vh] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/20">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/15 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="relative rounded-full bg-primary/10 p-5">
                    <div className="size-7 animate-spin rounded-full border-[3px] border-primary/30 border-t-primary" />
                  </div>
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  Loading material…
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
