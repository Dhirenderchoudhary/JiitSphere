import { NextResponse } from 'next/server';
import { rateLimit } from 'lib/rateLimit';

const limiter = rateLimit({ name: 'guest-login', windowMs: 60 * 1000, max: 10 });
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request) {
  const limited = limiter(request);
  if (limited) return limited;

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: 'study_material_access',
    value: '1',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
  });

  response.cookies.set({
    name: 'guest_mode',
    value: '1',
    path: '/',
    httpOnly: false,          // readable by client JS for download-limit logic
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}
