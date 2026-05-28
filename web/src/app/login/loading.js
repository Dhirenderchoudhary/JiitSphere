export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo skeleton */}
        <div className="flex flex-col items-center gap-3">
          <div className="size-12 rounded-full bg-muted animate-pulse" />
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        </div>

        {/* Card skeleton */}
        <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <div className="h-6 w-40 rounded bg-muted animate-pulse" />
            <div className="h-4 w-56 rounded bg-muted animate-pulse" />
          </div>

          {/* Input fields */}
          <div className="space-y-4">
            <div className="h-11 w-full rounded-xl bg-muted animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-muted animate-pulse" />
          </div>

          {/* Button */}
          <div className="h-11 w-full rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}
