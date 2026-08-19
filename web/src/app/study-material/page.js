import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from 'lib/session';
import { GUEST_COOKIE } from 'lib/sessionCookies';
import StudyMaterialClient from 'components/StudyMaterialClient';

export const metadata = { title: 'Study Material' };

export default async function StudyMaterialPage() {
  const session = await getSession();
  const cookieStore = await cookies();
  const isGuest = !session && cookieStore.get(GUEST_COOKIE)?.value === '1';

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
