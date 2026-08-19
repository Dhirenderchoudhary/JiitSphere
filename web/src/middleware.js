import { NextResponse } from 'next/server';
import { signEdge, verifyEdge } from 'lib/tokenEdge';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  SESSION_REFRESH_AFTER,
  STUDY_ACCESS_COOKIE,
  cookieOptions,
  getAuthSecret,
} from 'lib/sessionCookies';

/**
 * Slide the 7-day session window forward.
 *
 * Without this the cookie and the JWT both expire a fixed 7 days after sign-in,
 * so every user is bounced to the login screen on a rolling weekly basis no
 * matter how often they use the site. Re-issuing on each visit means only a
 * genuinely inactive week signs someone out.
 *
 * The token is only re-signed once it is older than SESSION_REFRESH_AFTER, so
 * the common case costs one HMAC verify and no re-sign.
 */
async function renewSession(request, response) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return;

  const secret = getAuthSecret();
  if (!secret) return;

  const payload = await verifyEdge(token, secret);
  if (!payload) return;

  // Renew at most once a day. Writing Set-Cookie on every request would make
  // each response uncacheable at the CDN, and a daily refresh already keeps the
  // window rolling: the cookie only lapses after ~7 days of real inactivity.
  const issuedAt = Number(payload.iat) || 0;
  if (issuedAt && Date.now() - issuedAt < SESSION_REFRESH_AFTER * 1000) return;

  const now = Date.now();
  const nextToken = await signEdge(
    { ...payload, iat: now, exp: now + SESSION_MAX_AGE * 1000 },
    secret
  );

  response.cookies.set(SESSION_COOKIE, nextToken, cookieOptions());
  response.cookies.set(STUDY_ACCESS_COOKIE, '1', cookieOptions());
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const isStudyMaterialRoute =
    pathname === '/study-material' ||
    pathname.startsWith('/study-material/') ||
    pathname === '/material' ||
    pathname.startsWith('/material/');

  const trustedHosts = new Set();
  const hostHeader = request.headers.get('host');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const requestHost = request.nextUrl.host;
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || '';

  if (hostHeader) trustedHosts.add(hostHeader);
  if (forwardedHost) trustedHosts.add(forwardedHost);
  if (requestHost) trustedHosts.add(requestHost);

  if (configuredSiteUrl) {
    try {
      trustedHosts.add(new URL(configuredSiteUrl).host);
    } catch {
      // ignore malformed site URL
    }
  }

  // ── CSRF origin check for mutating API requests ───────────────
  if (pathname.startsWith('/api') && request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin) {
      let originHost;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = '';
      }
      if (!originHost || !trustedHosts.has(originHost)) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // Allow landing page, lock page, and static assets to avoid redirect loops.
  if (
    pathname === '/' ||
    pathname === '/offline' ||
    pathname === '/study-access' ||
    pathname.startsWith('/superadmin') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/icon-192.png' ||
    pathname === '/icon-512.png' ||
    pathname === '/apple-touch-icon.png' ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Only Study Material routes use the study-access lock.
  // Portal, login, and other app areas should not be redirected there.
  if (!isStudyMaterialRoute) {
    const response = NextResponse.next();
    await renewSession(request, response);
    return response;
  }

  const isUnlocked = request.cookies.get(STUDY_ACCESS_COOKIE)?.value === '1';
  if (isUnlocked) {
    const response = NextResponse.next();
    await renewSession(request, response);
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }

  const targetPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/study-access';
  redirectUrl.searchParams.set('next', targetPath);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|study-access|sitemap.xml).*)'],
};
