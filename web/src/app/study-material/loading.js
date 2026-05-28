export default function Loading() {
  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-56 rounded bg-muted animate-pulse" />
        <div className="h-4 w-80 rounded bg-muted animate-pulse" />
      </div>

      {/* Search/filter bar */}
      <div className="flex items-center gap-3">
        <div className="h-10 flex-1 max-w-sm rounded-xl bg-muted animate-pulse" />
        <div className="h-10 w-28 rounded-xl bg-muted animate-pulse" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-4">
            {/* Card icon */}
            <div className="size-10 rounded-xl bg-muted animate-pulse" />

            {/* Card title & description */}
            <div className="space-y-2">
              <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3.5 w-full rounded bg-muted animate-pulse" />
              <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
            </div>

            {/* Card footer */}
            <div className="flex items-center justify-between pt-2">
              <div className="h-3.5 w-16 rounded bg-muted animate-pulse" />
              <div className="h-3.5 w-12 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
