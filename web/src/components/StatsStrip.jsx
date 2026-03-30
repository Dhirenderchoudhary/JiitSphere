import { Badge } from 'components/ui/badge';

export default function StatsStrip({ total, degrees, subjects }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-background/80 p-3">
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Total Material</p>
        <p className="mt-1 text-2xl font-black">{total}</p>
      </div>
      <div className="rounded-xl border border-border bg-background/80 p-3">
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Programs</p>
        <p className="mt-1 text-2xl font-black">{degrees}</p>
      </div>
      <div className="rounded-xl border border-border bg-background/80 p-3">
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Subjects</p>
        <p className="mt-1 text-2xl font-black">{subjects}</p>
      </div>
      <div className="sm:col-span-3">
        <Badge>Built for fast semester-wise access</Badge>
      </div>
    </div>
  );
}
