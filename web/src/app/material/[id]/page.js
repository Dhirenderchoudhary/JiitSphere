import { fetchMaterialById } from 'lib/api';
import CollegeBrand from 'components/CollegeBrand';
import { Badge } from 'components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';

const isVideo = (type) => type === 'mp4';

export default async function MaterialViewerPage({ params }) {
  const response = await fetchMaterialById(params.id);
  const material = response.data;

  return (
    <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
      <Card className="overflow-hidden bg-white/92 dark:bg-slate-900/70 backdrop-blur">
        <CardHeader className="space-y-4">
          <CollegeBrand />
          <div>
            <CardTitle className="text-2xl">{material.title}</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
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
        ) : (
          <iframe className="h-[78vh] w-full rounded-2xl border border-border" src={material.fileUrl} title={material.title} />
        )}
        </CardContent>
      </Card>
    </main>
  );
}
