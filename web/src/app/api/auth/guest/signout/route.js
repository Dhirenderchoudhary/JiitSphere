import { NextResponse } from 'next/server';
import { GUEST_COOKIE, STUDY_ACCESS_COOKIE, clearedCookieOptions } from 'lib/sessionCookies';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // Attributes must match how the cookies were written, or the browser keeps
  // the original entry alongside the expired one.
  response.cookies.set(GUEST_COOKIE, '', clearedCookieOptions());
  response.cookies.set(STUDY_ACCESS_COOKIE, '', clearedCookieOptions());

  response.headers.set('cache-control', 'no-store');
  return response;
}
