import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from 'lib/session';

const getSiteBase = () =>
  String(
    process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ).replace(/\/+$/, '');

const clearCookies = (response) => {
  const base = { path: '/', maxAge: 0 };
  response.cookies.set(SESSION_COOKIE, '', base);
  response.cookies.set('study_material_access', '', base);
  response.cookies.set('guest_mode', '', base);
};

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearCookies(response);
  return response;
}
