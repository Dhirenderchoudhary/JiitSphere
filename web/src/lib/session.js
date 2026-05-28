import { cookies } from 'next/headers';
import { verify } from './token';

export const SESSION_COOKIE = 'jiitsphere_token';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const getSecret = () => process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '';

const ADMIN_EMAIL = () =>
  String(process.env.ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();

/**
 * Server-side session from the jiitsphere_token httpOnly cookie.
 * Returns { user: { email, name, image, isAdmin } } or null.
 */
export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const secret = getSecret();
  if (!secret) return null;

  const payload = verify(token, secret);
  if (!payload) return null;

  const email = String(payload.email || '').toLowerCase();
  return {
    user: {
      email,
      name: String(payload.name || ''),
      image: String(payload.image || ''),
      isAdmin: email === ADMIN_EMAIL(),
    },
  };
}
