import { NextResponse } from 'next/server';
import {
  GUEST_COOKIE,
  SESSION_COOKIE,
  STUDY_ACCESS_COOKIE,
  clearedCookieOptions,
} from 'lib/sessionCookies';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // Same attributes as the writers — otherwise the browser keeps the original
  // cookie next to the expired one and the user stays signed in.
  [SESSION_COOKIE, STUDY_ACCESS_COOKIE, GUEST_COOKIE].forEach((name) => {
    response.cookies.set(name, '', clearedCookieOptions());
  });

  response.headers.set('cache-control', 'no-store');
  return response;
}
