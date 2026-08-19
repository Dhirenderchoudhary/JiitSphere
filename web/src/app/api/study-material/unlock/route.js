import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { rateLimit } from 'lib/rateLimit';
import {
  STUDY_ACCESS_COOKIE,
  STUDY_UNLOCK_MAX_AGE,
  cookieOptions,
  clearedCookieOptions,
} from 'lib/sessionCookies';

const limiter = rateLimit({ name: 'study-unlock', windowMs: 15 * 60 * 1000, max: 10 });

const hashValue = (value) =>
  createHash('sha256')
    .update(String(value || ''))
    .digest('hex');

const hashesMatch = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  if (!leftBuffer.length || !rightBuffer.length || leftBuffer.length !== rightBuffer.length)
    return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const getPasswordHash = () => {
  const configured = String(process.env.STUDY_MATERIAL_PASSWORD_HASH || '')
    .trim()
    .toLowerCase();
  return configured;
};

export async function POST(request) {
  const limited = limiter(request);
  if (limited) return limited;

  const payload = await request.json().catch(() => ({}));
  const submittedPassword = String(payload?.password || '');
  const submittedHash = hashValue(submittedPassword).toLowerCase();
  const validHash = getPasswordHash();

  if (!validHash) {
    return NextResponse.json({ message: 'Study access lock is not configured' }, { status: 503 });
  }

  if (!hashesMatch(submittedHash, validHash)) {
    return NextResponse.json({ message: 'Invalid password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(STUDY_ACCESS_COOKIE, '1', cookieOptions(STUDY_UNLOCK_MAX_AGE));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(STUDY_ACCESS_COOKIE, '', clearedCookieOptions());
  return response;
}
