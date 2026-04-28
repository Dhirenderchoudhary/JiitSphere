import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import CollegeBrand from 'components/CollegeBrand';
import HistoryBackButton from 'components/HistoryBackButton';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';

const isVideo = (type) => ['mp4', 'webm', 'ogg'].includes(type);
const isImage = (type) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(type);
const isNativeViewable = (type) => type === 'pdf' || isVideo(type) || isImage(type);

const normalizeSiteUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const resolveOrigin = () => {
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || 'http';
  if (host) return `${proto}://${host}`;

  return (
    normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeSiteUrl(process.env.NEXTAUTH_URL) ||
    'http://localhost:3000'
  );
};

const fetchMaterialByIdServer = async (id) => {
  const origin = resolveOrigin();
  const response = await fetch(`${origin}/api/backend/materials/${encodeURIComponent(String(id || ''))}`, {
    cache: 'no-store'
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

const buildAccessUrl = (id, action) => `/api/study-material/access/${encodeURIComponent(String(id || ''))}?action=${encodeURIComponent(action)}`;

export default async function MaterialViewerPage({ params }) {
  const response = await fetchMaterialByIdServer(params.id);
  const material = response.data;
  const cookieStore = cookies();
  const isGuest = cookieStore.get('guest_mode')?.value === '1' && !cookieStore.get('jiitsphere_token')?.value;
  const guestUsage = { used: 0, limit: 5 };
  const limitReached = isGuest && guestUsage.used >= guestUsage.limit;
  const viewerUrl = buildAccessUrl(material._id, 'view');
  const downloadUrl = buildAccessUrl(material._id, 'download');

  return (
    <main className="page-shell py-6 sm:py-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <HistoryBackButton fallbackHref="/study-material">← Back</HistoryBackButton>
        <div className="flex items-center gap-2">
          {limitReached ? (
            <a href="/study-access?next=/study-material" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">Sign in to continue</Button>
            </a>
          ) : (
            <>
              <a href={viewerUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">Open Source</Button>
              </a>
              <a href={downloadUrl} download>
                <Button size="sm">Download</Button>
              </a>
            </>
          )}
        </div>
      </div>
      {isGuest && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${guestUsage.used >= guestUsage.limit ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
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
            <p className="mt-2 text-sm text-muted-foreground">{material.subject} • {material.branch} • {material.degree}</p>
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
        <CardContent>
        {limitReached ? (
          <div className="flex h-[48vh] flex-col items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-500/5 p-8 text-center">
            <h2 className="text-xl font-bold text-foreground">Guest limit reached</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Sign in with your college account to continue viewing and downloading materials without limits.
            </p>
            <a href="/study-access?next=/study-material" className="mt-4">
              <Button size="sm">Sign in for unlimited access</Button>
            </a>
          </div>
        ) : isVideo(material.fileType) ? (
          <video className="h-[78vh] w-full rounded-2xl border border-border" controls src={viewerUrl} />
        ) : isImage(material.fileType) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="mx-auto max-h-[78vh] rounded-2xl border border-border" src={viewerUrl} alt={material.title} loading="lazy" decoding="async" />
        ) : (
          <iframe className="h-[78vh] w-full rounded-2xl border border-border" src={viewerUrl} title={material.title} allowFullScreen />
        )}
        </CardContent>
      </Card>
    </main>
  );
}
