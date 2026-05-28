import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from 'lib/session';
import StudyAccessForm from 'components/StudyAccessForm';

const sanitizeNextPath = (rawPath) => {
  const fallback = '/study-material';
  if (!rawPath || typeof rawPath !== 'string') return fallback;
  if (!rawPath.startsWith('/')) return fallback;
  if (rawPath.startsWith('//')) return fallback;
  if (rawPath.startsWith('/study-access')) return fallback;
  if (rawPath.startsWith('/api')) return fallback;
  if (rawPath.startsWith('/_next')) return fallback;
  return rawPath;
};

export default async function StudyAccessPage({ searchParams }) {
  const session = await getSession();
  const nextPath = sanitizeNextPath(searchParams?.next);

  if (session) {
    redirect(nextPath);
  }

  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
        </main>
      }
    >
      <StudyAccessForm nextPath={nextPath} />
    </Suspense>
  );
}
