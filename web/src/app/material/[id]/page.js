import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import CollegeBrand from 'components/CollegeBrand';
import HistoryBackButton from 'components/HistoryBackButton';
import MaterialViewerClient from 'components/MaterialViewerClient';
import DownloadButton from 'components/DownloadButton';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';

const isVideo = (type) => ['mp4', 'webm', 'ogg'].includes(type);
const isImage = (type) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(type);
const OFFICE_TYPES = new Set(['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx']);

/**
 * Resolve the backend API base URL for server-to-server calls.
 * Direct call — bypasses the /api/backend proxy entirely.
 */
const BACKEND_URL = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api/v1'
).replace(/\/+$/, '');

/**
 * Fetch material by ID directly from the backend.
 * No proxy hop, no self-call — single server→backend fetch.
 * Cached via Next.js ISR for 5 minutes to avoid repeated DB lookups.
 */
const fetchMaterialByIdServer = async (id) => {
  const response = await fetch(`${BACKEND_URL}/materials/${encodeURIComponent(String(id || ''))}`, {
    next: { revalidate: 3600 },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.message || 'Failed to load material');
  }

  return payload;
};

/**
 * Determine the best viewer strategy for a given material.
 *
 * Returns { strategy, embeddedUrl } where:
 *   - pdf/images/video/text → direct CDN URL (native browser rendering)
 *   - office files          → Google Docs Viewer URL (renders PPT/DOC/XLS inline)
 *   - other                 → null (download-only)
 */
const resolveViewerConfig = (material) => {
  const ft = (material.fileType || '').toLowerCase();
  const { fileUrl } = material;

  if (!fileUrl) return { strategy: 'unsupported', embeddedUrl: null };

  if (isVideo(ft)) return { strategy: 'video', embeddedUrl: fileUrl };
  if (isImage(ft)) return { strategy: 'image', embeddedUrl: fileUrl };
  if (ft === 'pdf') return { strategy: 'pdf', embeddedUrl: fileUrl };
  if (ft === 'txt') return { strategy: 'text', embeddedUrl: fileUrl };

  if (OFFICE_TYPES.has(ft)) {
    const gdocsUrl = `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
    return { strategy: 'office', embeddedUrl: gdocsUrl };
  }

  return { strategy: 'unsupported', embeddedUrl: null };
};

export default async function MaterialViewerPage({ params }) {
  const response = await fetchMaterialByIdServer(params.id);
  const material = response.data;
  const cookieStore = cookies();
  const isGuest =
    cookieStore.get('guest_mode')?.value === '1' && !cookieStore.get('jiitsphere_token')?.value;
  const guestUsage = { used: 0, limit: 5 };
  const limitReached = isGuest && guestUsage.used >= guestUsage.limit;

  // Direct CDN URL — no proxy, no redirect, no latency
  const fileUrl = material.fileUrl || '';
  const viewerConfig = resolveViewerConfig(material);

  // Build filename for download
  const downloadFilename = `${material.title || material.subject || 'material'}.${material.fileType || 'pdf'}`;

  return (
    <main className="page-shell py-6 sm:py-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <HistoryBackButton fallbackHref="/study-material">← Back</HistoryBackButton>
        <div className="flex items-center gap-2">
          {limitReached ? (
            <a href="/study-access?next=/study-material" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                Sign in to continue
              </Button>
            </a>
          ) : (
            <>
              {/* Direct CDN link — opens instantly, no redirect */}
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">
                  Open Source
                </Button>
              </a>
              <DownloadButton fileUrl={fileUrl} filename={downloadFilename} />
            </>
          )}
        </div>
      </div>
      {isGuest && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${guestUsage.used >= guestUsage.limit ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}
        >
          {guestUsage.used >= guestUsage.limit
            ? 'Guest limit reached. Sign in with your college account for unlimited access.'
            : `Guest usage: ${guestUsage.used}/${guestUsage.limit} combined views + downloads used.`}
        </div>
      )}
      <Card className="overflow-hidden bg-card/95 dark:bg-card/80 backdrop-blur">
        <CardHeader className="space-y-4">
          <CollegeBrand />
          <div>
            <CardTitle className="text-2xl sm:text-3xl">{material.title}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {material.subject} • {material.branch} • {material.degree}
            </p>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Material metadata badges">
              <Badge>{material.degree}</Badge>
              <Badge>{material.branch}</Badge>
              <Badge>Year {material.year}</Badge>
              <Badge>Sem {material.semester}</Badge>
              <Badge>{material.subject}</Badge>
              <Badge>{material.resourceType}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {limitReached ? (
            <div className="flex h-[48vh] flex-col items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-500/5 p-8 text-center mx-4 my-4 sm:mx-0">
              <h2 className="text-xl font-bold text-foreground">Guest limit reached</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Sign in with your college account to continue viewing and downloading materials
                without limits.
              </p>
              <a href="/study-access?next=/study-material" className="mt-4">
                <Button size="sm">Sign in for unlimited access</Button>
              </a>
            </div>
          ) : (
            <div className="mx-4 mb-4 sm:mx-0 sm:mb-0">
              <MaterialViewerClient
                embeddedUrl={viewerConfig.embeddedUrl}
                viewerStrategy={viewerConfig.strategy}
                fileUrl={fileUrl}
                downloadFilename={downloadFilename}
                title={material.title}
                fileType={material.fileType}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
