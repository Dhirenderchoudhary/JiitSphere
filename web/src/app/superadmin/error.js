'use client';

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="size-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
          <svg className="size-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">{error?.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity min-h-[44px]"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
