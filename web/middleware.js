import { NextResponse } from 'next/server';

const STUDY_ACCESS_COOKIE = 'study_material_access';

export function middleware(request) {
  const pathname = request.nextUrl.pathname;

  // Allow lock page and static assets to avoid redirect loops.
  if (
    pathname === '/study-access' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  const isUnlocked = request.cookies.get(STUDY_ACCESS_COOKIE)?.value === '1';
  if (isUnlocked) return NextResponse.next();

  const targetPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/study-access';
  redirectUrl.searchParams.set('next', targetPath);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)']
};
