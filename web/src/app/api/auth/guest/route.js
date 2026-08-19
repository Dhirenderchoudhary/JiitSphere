import { NextResponse } from 'next/server';
import { rateLimit } from 'lib/rateLimit';
import { GUEST_COOKIE, STUDY_ACCESS_COOKIE, cookieOptions } from 'lib/sessionCookies';

const limiter = rateLimit({ name: 'guest-login', windowMs: 60 * 1000, max: 10 });

export async function POST(request) {
  try {
    const limited = limiter(request);
    if (limited) return limited;

    const response = NextResponse.json({ ok: true });

    response.cookies.set(STUDY_ACCESS_COOKIE, '1', cookieOptions());
    response.cookies.set(GUEST_COOKIE, '1', cookieOptions());

    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (_error) {
    return NextResponse.json(
      { ok: false, message: 'Guest access is temporarily unavailable' },
      { status: 500 }
    );
  }
}
