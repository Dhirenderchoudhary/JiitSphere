import { cookies } from 'next/headers';
import { sign, verify } from './token';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STUDY_ACCESS_COOKIE,
  cookieOptions,
  clearedCookieOptions,
  getAuthSecret,
} from './sessionCookies';

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STUDY_ACCESS_COOKIE,
  cookieOptions,
  clearedCookieOptions,
};

const ADMIN_EMAIL = () =>
  String(process.env.ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();

/**
 * Mint a session token that expires SESSION_MAX_AGE from now.
 * `exp`/`iat` are milliseconds, matching what lib/token.js verify() expects.
 * `iat` is what the middleware uses to decide when to slide the window.
 */
export const createSessionToken = (claims, secret) => {
  const now = Date.now();
  return sign({ ...claims, iat: now, exp: now + SESSION_MAX_AGE * 1000 }, secret);
};

/**
 * Write the session token and the study-material access flag with identical
 * attributes and a fresh 7-day window.
 */
export const setSessionCookies = (response, token) => {
  response.cookies.set(SESSION_COOKIE, token, cookieOptions());
  response.cookies.set(STUDY_ACCESS_COOKIE, '1', cookieOptions());
};

/**
 * Server-side session from the jiitsphere_token httpOnly cookie.
 * Returns { user: { email, name, image, isAdmin } } or null.
 */
export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const secret = getAuthSecret();
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
