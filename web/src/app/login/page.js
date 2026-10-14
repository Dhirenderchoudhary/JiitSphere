import { getSession } from 'lib/session';
import LoginClient from './LoginClient';

export default async function LoginPage() {
  const session = await getSession();
  const email = session?.user?.email || '';

  return <LoginClient collegeEmail={email.endsWith('@mail.jiit.ac.in') ? email : ''} />;
}
