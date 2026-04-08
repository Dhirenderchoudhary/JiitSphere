import { getServerSession } from 'next-auth/next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authOptions } from 'lib/auth';
import StudyMaterialClient from 'components/StudyMaterialClient';

export default async function StudyMaterialPage() {
  const session = await getServerSession(authOptions);
  const cookieStore = cookies();
  const isGuest = !session && cookieStore.get('guest_mode')?.value === '1';

  if (!session && !isGuest) {
    redirect('/study-access?next=/study-material');
  }

  const user = session
    ? {
        name: session.user?.name || '',
        email: session.user?.email || '',
        image: session.user?.image || null,
        isAdmin: session.user?.isAdmin ?? false,
      }
    : null;

  return <StudyMaterialClient user={user} isGuest={isGuest} />;
}
