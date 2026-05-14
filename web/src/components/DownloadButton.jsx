'use client';

import { useState } from 'react';
import { Button } from 'components/ui/button';
import { Download, Loader2 } from 'lucide-react';

/**
 * Client-side download button — fetches file as blob to guarantee
 * download behavior without redirect latency or cross-origin limitations.
 */
export default function DownloadButton({ fileUrl, filename, size = 'sm', className = '' }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!fileUrl || downloading) return;
    setDownloading(true);

    try {
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch {
      // Fallback: open in new tab and let browser handle it
      window.open(fileUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button size={size} className={className} onClick={handleDownload} disabled={downloading}>
      {downloading ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="mr-1.5 h-3.5 w-3.5" />
      )}
      {downloading ? 'Downloading…' : 'Download'}
    </Button>
  );
}
