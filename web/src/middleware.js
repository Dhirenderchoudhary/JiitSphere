import { NextResponse } from 'next/server';

const STUDY_ACCESS_COOKIE = 'study_material_access';

export function middleware(request) {
  const pathname = request.nextUrl.pathname;

  // ── CSRF origin check for mutating API requests ───────────────
  if (pathname.startsWith('/api') && request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin) {
      let originHost;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = '';
      }
      if (originHost !== host) {
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

  // Admin UI has its own signed-cookie auth flow in API routes;
  // bypass study-access lock so the admin login screen remains reachable.
  if (pathname.startsWith('/admin')) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)']
};
