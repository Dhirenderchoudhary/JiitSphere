import Link from 'next/link';
import { BookOpen, CalendarDays, Download, GraduationCap } from 'lucide-react';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { Card, CardContent } from 'components/ui/card';

export default function MaterialList({ items }) {
  if (!items.length) {
    return (
      <Card className="border-dashed bg-white/70 dark:bg-slate-900/60">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">No materials found for the selected filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <Card key={item._id} className="bg-white/90 dark:bg-slate-900/70 backdrop-blur">
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
              <a href={item.fileUrl} target="_blank" rel="noreferrer">
                <Button className="w-full" size="lg">
                  <Download className="mr-2 h-4 w-4" /> Download Now
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
