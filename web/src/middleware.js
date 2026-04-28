import { NextResponse } from 'next/server';

const STUDY_ACCESS_COOKIE = 'study_material_access';

export function middleware(request) {
  const pathname = request.nextUrl.pathname;
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
    return NextResponse.next();
  }

  const isUnlocked = request.cookies.get(STUDY_ACCESS_COOKIE)?.value === '1';
  if (isUnlocked) {
    const response = NextResponse.next();
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|study-access|sitemap.xml).*)']
};
