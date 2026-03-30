import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from 'lib/auth';
import StudyMaterialClient from 'components/StudyMaterialClient';

export default async function StudyMaterialPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/study-access?next=/study-material');
  }

  const user = {
    name: session.user?.name || '',
    email: session.user?.email || '',
    image: session.user?.image || null,
    isAdmin: session.user?.isAdmin ?? false
  };

  return <StudyMaterialClient user={user} />;
}
