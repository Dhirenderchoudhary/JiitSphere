'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, CalendarDays, Download, GraduationCap } from 'lucide-react';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';
import { materialAccessUrl } from 'lib/api';
import { toast } from 'sonner';

const GUEST_USAGE_LIMIT = 5;

async function triggerDownload(url, fallbackName) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData?.message || 'Download failed');
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fallbackName || url.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 150);
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

export default function MaterialList({ items, isGuest = false, guestUsage = { used: 0, limit: GUEST_USAGE_LIMIT } }) {
  const [downloadsUsed, setDownloadsUsed] = useState(() => Number(guestUsage.used || 0));
  const limitReached = isGuest && downloadsUsed >= GUEST_USAGE_LIMIT;
  if (!items.length) {
    return (
      <Card className="border-dashed bg-card/80 dark:bg-card/70">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">No materials found for the selected filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isGuest && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${limitReached ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
          {limitReached
            ? 'Guest download limit reached. Sign in with your college account for unlimited downloads.'
            : `Guest mode: ${downloadsUsed}/${GUEST_USAGE_LIMIT} combined views + downloads used.`}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Card key={item._id} className="bg-card/90 dark:bg-card/70 backdrop-blur">
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1">
                <h4 className="line-clamp-2 text-lg font-bold">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.subject}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{item.resourceType}</Badge>
                <Badge className="bg-primary/10 text-primary">{item.fileType.toUpperCase()}</Badge>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <p className="flex items-center gap-1">
                  <GraduationCap className="h-3.5 w-3.5" /> {item.degree} / {item.branch}
                </p>
                <p className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> Year {item.year}, Sem {item.semester}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link href={`/material/${item._id}`}>
                  <Button className="w-full" size="lg" variant="secondary">
                    <BookOpen className="mr-2 h-4 w-4" /> In-App View
                  </Button>
                </Link>
                {limitReached ? (
                  <Button className="w-full" size="lg" disabled>
                    <Download className="mr-2 h-4 w-4" /> Limit reached
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => {
                      const filename = `${item.title || item.subject}.${item.fileType}`;
                      toast.info(`Downloading...`, { description: filename });
                      triggerDownload(materialAccessUrl(item._id, 'download'), filename)
                        .then(() => {
                          if (isGuest) setDownloadsUsed((prev) => Math.min(GUEST_USAGE_LIMIT, prev + 1));
                        })
                        .catch((error) => {
                          toast.error(error?.message || 'Download failed', { description: 'Sign in with your college account for unlimited access.' });
                        });
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" /> Download Now
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
