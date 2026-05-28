import { Button } from 'components/ui/button';
import {
  Loader2,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Download,
  FileText,
} from 'lucide-react';

export const FallbackActions = ({ handleRetry, openUrl, downloadUrl }) => (
  <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
    <Button type="button" variant="outline" size="sm" onClick={handleRetry} className="gap-2">
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
        <Button type="button" size="sm" className="gap-2">
          <Download className="size-4" />
          Download
        </Button>
      </a>
    )}
  </div>
);

export const ErrorCard = ({ icon: Icon = AlertTriangle, heading, description, fallbackActionsProps }) => (
  <div className="flex h-[78vh] w-full items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex flex-col items-center text-center p-8 max-w-md">
      <div className="rounded-2xl bg-destructive/10 p-5 mb-5">
        <Icon className="size-10 text-destructive/80" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-bold text-foreground">{heading}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
      <FallbackActions {...fallbackActionsProps} />
    </div>
  </div>
);

export const LoadingOverlay = () => (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-full bg-primary/10 p-4">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">Loading document…</p>
    </div>
  </div>
);
