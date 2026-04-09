import { fetchMaterialById } from 'lib/api';
import CollegeBrand from 'components/CollegeBrand';
import HistoryBackButton from 'components/HistoryBackButton';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';

const isVideo = (type) => ['mp4', 'webm', 'ogg'].includes(type);
const isImage = (type) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(type);
const isNativeViewable = (type) => type === 'pdf' || isVideo(type) || isImage(type);

function getViewerUrl(fileUrl, fileType) {
  if (isNativeViewable(fileType)) return fileUrl;
  // Use Google Docs Viewer for office files (pptx, docx, xlsx, etc.)
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}

export default async function MaterialViewerPage({ params }) {
  const response = await fetchMaterialById(params.id);
  const material = response.data;
  const viewerUrl = getViewerUrl(material.fileUrl, material.fileType);

  return (
    <main className="page-shell py-6 sm:py-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <HistoryBackButton fallbackHref="/study-material">← Back</HistoryBackButton>
        <div className="flex items-center gap-2">
          <a href={material.fileUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">Open Source</Button>
          </a>
          <a href={material.fileUrl} download>
            <Button size="sm">Download</Button>
          </a>
        </div>
      </div>
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
        {isVideo(material.fileType) ? (
          <video className="h-[78vh] w-full rounded-2xl border border-border" controls src={material.fileUrl} />
        ) : isImage(material.fileType) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="mx-auto max-h-[78vh] rounded-2xl border border-border" src={material.fileUrl} alt={material.title} loading="lazy" decoding="async" />
        ) : (
          <iframe className="h-[78vh] w-full rounded-2xl border border-border" src={viewerUrl} title={material.title} allowFullScreen />
        )}
        </CardContent>
      </Card>
    </main>
  );
}
