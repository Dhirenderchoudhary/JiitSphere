export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-64 flex-col border-r border-border p-4 space-y-6">
        {/* Logo */}
        <div className="h-8 w-32 rounded bg-muted animate-pulse" />

        {/* Nav items */}
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 w-full rounded-xl bg-muted animate-pulse" />
          ))}
        </div>

        {/* Bottom profile */}
        <div className="mt-auto flex items-center gap-3">
          <div className="size-9 rounded-full bg-muted animate-pulse" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3 w-16 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-7 w-48 rounded bg-muted animate-pulse" />
            <div className="h-4 w-64 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-9 w-24 rounded-xl bg-muted animate-pulse" />
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="h-4 w-20 rounded bg-muted animate-pulse" />
              <div className="h-7 w-16 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>

        {/* Content area */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="h-5 w-36 rounded bg-muted animate-pulse" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 w-full rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
