import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { rateLimit } from 'lib/rateLimit';
import {
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  ADMIN_COOKIE_NAME,
  createAdminCookieToken,
  verifyAdminCookieToken,
} from 'lib/adminAuthCookie';

const limiter = rateLimit({ name: 'admin-login', windowMs: 15 * 60 * 1000, max: 5 });

const ADMIN_ID = process.env.ADMIN_LOGIN_ID || '';
const ADMIN_PASSWORD_HASH = (process.env.ADMIN_LOGIN_PASSWORD_HASH || '').toLowerCase();
const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || '';

function hashValue(value) {
  return createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (!bufA.length || !bufB.length || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const authCookieBaseOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

export async function GET(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value || '';
  const result = verifyAdminCookieToken(token);

  return NextResponse.json({
    ok: true,
    authenticated: Boolean(result.valid),
    adminId: result.valid ? String(result.payload?.id || '') : '',
  });
}

export async function POST(request) {
  const limited = limiter(request);
  if (limited) return limited;

  if (!ADMIN_ID || !ADMIN_PASSWORD_HASH || !ADMIN_COOKIE_SECRET) {
    return NextResponse.json({ message: 'Service unavailable' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || '').trim();
  const password = String(body?.password || '');

  if (id !== ADMIN_ID) {
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }

  if (!safeEqual(hashValue(password), ADMIN_PASSWORD_HASH)) {
    return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: createAdminCookieToken(id),
    ...authCookieBaseOptions,
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: '',
    ...authCookieBaseOptions,
    maxAge: 0,
  });
  return response;
}
