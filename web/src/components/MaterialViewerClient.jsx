'use client';

import { useState, useRef } from 'react';
import { Button } from 'components/ui/button';
import {
  Loader2,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Download,
  FileX2,
  FileText,
} from 'lucide-react';

/**
 * MaterialViewerClient — renders the embedded preview for a study material.
 *
 * Props:
 *   embeddedUrl     — the URL to load in the viewer (direct CDN URL, or Google Docs Viewer URL)
 *   viewerStrategy  — 'pdf' | 'image' | 'video' | 'text' | 'office' | 'unsupported'
 *   openUrl         — URL for "Open in New Tab" (the access route which redirects to file)
 *   downloadUrl     — URL for "Download" button
 *   title           — material title (for alt/title attributes)
 *   fileType        — file extension string
 *
 * Design principles:
 *   • NO proxy — uses direct CDN URLs for instant loading
 *   • NO preflight/verification step — mount immediately
 *   • Office files use Google Docs Viewer (no forced download / OS popup)
 *   • Simple loading → ready | error states only
 */
export default function MaterialViewerClient({
  embeddedUrl,
  viewerStrategy,
  openUrl,
  downloadUrl,
  title,
  fileType,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const frameRef = useRef(null);

  const handleLoad = () => {
    setLoading(false);
    setError(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    if (frameRef.current) {
      // Force reload by resetting src
      const src = frameRef.current.src;
      frameRef.current.src = '';
      requestAnimationFrame(() => {
        if (frameRef.current) frameRef.current.src = src;
      });
    }
  };

  // ── Fallback action buttons (shared across error states) ──
  const FallbackActions = () => (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
      <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
        <RefreshCw className="size-4" />
        Retry
      </Button>
      {openUrl && (
        <Button
          size="sm"
          variant="secondary"
          className="gap-2"
          onClick={() => window.open(openUrl, '_blank')}
        >
          <ExternalLink className="size-4" />
          Open in New Tab
        </Button>
      )}
      {downloadUrl && (
        <a href={downloadUrl} download>
          <Button size="sm" className="gap-2">
            <Download className="size-4" />
            Download
          </Button>
        </a>
      )}
    </div>
  );

  // ── Error card ──
  const ErrorCard = ({ icon: Icon = AlertTriangle, heading, description }) => (
    <div className="flex h-[78vh] w-full items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col items-center text-center p-8 max-w-md">
        <div className="rounded-2xl bg-destructive/10 p-5 mb-5">
          <Icon className="size-10 text-destructive/80" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-bold text-foreground">{heading}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
        <FallbackActions />
      </div>
    </div>
  );

  // ── Loading overlay ──
  const LoadingOverlay = () => (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-primary/10 p-4">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Loading document…</p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  //  UNSUPPORTED — no preview, download only
  // ══════════════════════════════════════════════════════════
  if (viewerStrategy === 'unsupported' || !embeddedUrl) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-card/50">
        <div className="flex flex-col items-center text-center p-8 max-w-md">
          <div className="rounded-2xl bg-muted/50 p-5 mb-5">
            <FileText className="size-10 text-muted-foreground/60" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-bold text-foreground">Preview Not Available</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            <span className="font-semibold uppercase">.{fileType || 'unknown'}</span> files cannot be previewed in the browser.
            You can download the file or open it in a new tab.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            {openUrl && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => window.open(openUrl, '_blank')}
              >
                <ExternalLink className="size-4" />
                Open in New Tab
              </Button>
            )}
            {downloadUrl && (
              <a href={downloadUrl} download>
                <Button size="sm" className="gap-2">
                  <Download className="size-4" />
                  Download File
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  VIDEO
  // ══════════════════════════════════════════════════════════
  if (viewerStrategy === 'video') {
    return (
      <div className="relative">
        {loading && <LoadingOverlay />}
        {error ? (
          <ErrorCard
            heading="Video Unavailable"
            description="The video could not be loaded. It may have been removed or the connection was interrupted."
          />
        ) : (
          <video
            className="h-[78vh] w-full rounded-2xl border border-border bg-black"
            controls
            src={embeddedUrl}
            onLoadedData={handleLoad}
            onError={handleError}
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  IMAGE
  // ══════════════════════════════════════════════════════════
  if (viewerStrategy === 'image') {
    return (
      <div className="relative flex min-h-[50vh] items-center justify-center rounded-2xl border border-border bg-muted/20">
        {loading && !error && <LoadingOverlay />}
        {error ? (
          <ErrorCard
            icon={FileX2}
            heading="Image Not Found"
            description="The image could not be loaded. It may have been removed or is temporarily unavailable."
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className="mx-auto max-h-[78vh] rounded-2xl object-contain transition-opacity duration-300"
            src={embeddedUrl}
            alt={title}
            onLoad={handleLoad}
            onError={handleError}
            style={{ opacity: loading ? 0 : 1 }}
            loading="eager"
            decoding="async"
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  //  PDF / TEXT / OFFICE (Google Docs Viewer) — all use iframe
  // ══════════════════════════════════════════════════════════
  return (
    <div className="relative flex h-[78vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Loading overlay */}
      {loading && !error && <LoadingOverlay />}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center text-center p-8 max-w-md">
            <div className="rounded-2xl bg-destructive/10 p-5 mb-5">
              <AlertTriangle className="size-10 text-destructive/80" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold text-foreground">
              {viewerStrategy === 'office' ? 'Document Preview Failed' : 'Material Unavailable'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {viewerStrategy === 'office'
                ? 'The document viewer could not load this file. Try opening it directly or downloading.'
                : 'The embedded viewer failed to load. The file might be missing or temporarily unavailable.'}
            </p>
            <FallbackActions />
          </div>
        </div>
      )}

      {/* Iframe — mounted immediately, no preflight */}
      <iframe
        ref={frameRef}
        key={embeddedUrl}
        className="h-full w-full border-none transition-opacity duration-300"
        style={{
          opacity: loading || error ? 0 : 1,
          backgroundColor: viewerStrategy === 'office' ? '#f8f9fa' : 'white',
        }}
        src={embeddedUrl}
        title={title}
        onLoad={handleLoad}
        onError={handleError}
        sandbox={viewerStrategy === 'office' ? 'allow-scripts allow-same-origin allow-popups allow-forms' : undefined}
        allowFullScreen
      />
    </div>
  );
}