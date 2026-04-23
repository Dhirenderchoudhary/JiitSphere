import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { sign } from 'lib/token';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

const getSiteBase = () =>
  String(process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

const sanitizeNext = (raw) => {
  const fallback = '/study-material';
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/api') || trimmed.startsWith('/_next')) return fallback;
  return trimmed.slice(0, 500);
};

export async function GET(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

  if (!clientId || !secret) {
    return NextResponse.redirect(`${getSiteBase()}/study-access?error=Configuration`);
  }

  const { searchParams } = new URL(request.url);
  const next = sanitizeNext(searchParams.get('next'));
  const callbackUrl = `${getSiteBase()}/api/auth/callback/google`;

  // State carries the destination and a nonce to prevent CSRF
  const state = sign(
    { next, nonce: randomBytes(16).toString('hex'), exp: Date.now() + 10 * 60 * 1000 },
    secret
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}
