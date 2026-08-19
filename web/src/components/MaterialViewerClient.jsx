'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from 'components/ui/button';
import { FileX2, ExternalLink, Download, FileText, AlertTriangle } from 'lucide-react';
import { FallbackActions, ErrorCard, LoadingOverlay } from 'components/MaterialViewerComponents';

/**
 * MaterialViewerClient — renders the embedded preview for a study material.
 *
 * Props:
 *   embeddedUrl     — the URL to load in the viewer (direct CDN URL, or Google Docs Viewer URL)
 *   viewerStrategy  — 'pdf' | 'image' | 'video' | 'text' | 'office' | 'unsupported'
 *   openUrl         — URL for "Open in New Tab"
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

/**
 * An iframe's `load` event only fires once the *entire* file has been
 * transferred. Browsers paint page one of a PDF long before that, so gating
 * visibility on `load` made a 20 MB deck look frozen behind a spinner for the
 * whole download. Reveal the frame after this delay and let the browser's own
 * progressive rendering show through.
 */
const REVEAL_DELAY_MS = 400;

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

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setLoading(false), REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading, embeddedUrl]);

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
      const { src } = frameRef.current;
      frameRef.current.src = '';
      requestAnimationFrame(() => {
        if (frameRef.current) frameRef.current.src = src;
      });
    }
  };

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
            <span className="font-semibold uppercase">.{fileType || 'unknown'}</span> files cannot
            be previewed in the browser. You can download the file or open it in a new tab.
          </p>
          <FallbackActions handleRetry={handleRetry} openUrl={openUrl} downloadUrl={downloadUrl} />
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
            fallbackActionsProps={{ handleRetry, openUrl, downloadUrl }}
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
            fallbackActionsProps={{ handleRetry, openUrl, downloadUrl }}
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
        <ErrorCard
          heading={viewerStrategy === 'office' ? 'Document Preview Failed' : 'Material Unavailable'}
          description={
            viewerStrategy === 'office'
              ? 'The document viewer could not load this file. Try opening it directly or downloading.'
              : 'The embedded viewer failed to load. The file might be missing or temporarily unavailable.'
          }
          fallbackActionsProps={{ handleRetry, openUrl, downloadUrl }}
        />
      )}

      {/* Iframe — mounted immediately, no preflight */}
      <iframe
        ref={frameRef}
        key={embeddedUrl}
        className="h-full w-full border-none transition-opacity duration-300"
        style={{
          opacity: error ? 0 : 1,
          backgroundColor: viewerStrategy === 'office' ? '#f8f9fa' : 'white',
        }}
        src={
          viewerStrategy === 'pdf'
            ? // Fit the width and skip the thumbnail sidebar: the built-in
              // viewer then renders page one without waiting to lay out the
              // rest of the document.
              `${embeddedUrl}#view=FitH&pagemode=none`
            : embeddedUrl
        }
        title={title}
        onLoad={handleLoad}
        onError={handleError}
        sandbox={
          viewerStrategy === 'office'
            ? 'allow-scripts allow-same-origin allow-popups allow-forms'
            : undefined
        }
        allowFullScreen
      />
    </div>
  );
}
