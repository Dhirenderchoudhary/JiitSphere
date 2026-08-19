/**
 * Single source of truth for the auth cookies.
 *
 * Kept free of `next/headers` and `node:crypto` so both the Edge middleware and
 * the Node route handlers can import it. Cookie *attributes* must match across
 * every writer: a browser treats two cookies of the same name with different
 * `httpOnly`/`secure`/`path` as separate entries, and the stale one wins often
 * enough to look like a random sign-out.
 */

export const SESSION_COOKIE = 'jiitsphere_token';
export const STUDY_ACCESS_COOKIE = 'study_material_access';
export const GUEST_COOKIE = 'guest_mode';

/** 7 days — how long a browser stays signed in without re-authenticating. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Renew the session once it is more than a day old. Every authenticated request
 * after that point pushes the 7-day window forward, so a user who visits at
 * least once a week is never signed out.
 */
export const SESSION_REFRESH_AFTER = 60 * 60 * 24;

/**
 * The shared site-lock password is a gate on the section, not a user session,
 * so it keeps its own longer window. Signed-in users have this cookie slid
 * forward weekly by the middleware regardless.
 */
export const STUDY_UNLOCK_MAX_AGE = 60 * 60 * 24 * 30;

export const isProduction = () => process.env.NODE_ENV === 'production';

/** Shared attributes for every auth cookie this app writes. */
export const cookieOptions = (maxAge = SESSION_MAX_AGE) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction(),
  maxAge,
});

/** Same attributes, maxAge 0 — the only reliable way to delete a cookie. */
export const clearedCookieOptions = () => cookieOptions(0);

export const getAuthSecret = () => process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '';
