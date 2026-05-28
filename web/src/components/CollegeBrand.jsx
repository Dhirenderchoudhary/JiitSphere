import Image from 'next/image';
import Link from 'next/link';

export default function CollegeBrand() {
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      <div
        className="overflow-hidden rounded-xl border border-border bg-white/10"
        style={{ width: 44, height: 44, minWidth: 44, minHeight: 44 }}
      >
        <Image
          src="/jiitsphere-logo.png"
          alt="JiitSphere logo"
          width={44}
          height={44}
          className="h-full w-full object-cover"
          priority
        />
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          JIIT
        </p>
        <h1 className="text-lg font-black leading-none">Study Material </h1>
      </div>
    </Link>
  );
}
