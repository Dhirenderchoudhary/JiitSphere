import { NextResponse } from 'next/server';
import { verify } from 'lib/token';
import { createSessionToken, setSessionCookies } from 'lib/session';
import { trackStudySignIn } from 'lib/studyAnalyticsStore';
import { rateLimit } from 'lib/rateLimit';

const limiter = rateLimit({ name: 'google-callback', windowMs: 60 * 1000, max: 30 });
const JIIT_DOMAIN = '@mail.jiit.ac.in';

const getSiteBase = () =>
  String(
    process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ).replace(/\/+$/, '');

export async function GET(request) {
  const limited = limiter(request);
  if (limited) return limited;

  const base = getSiteBase();
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!secret || !clientId || !clientSecret) {
    return NextResponse.redirect(`${base}/study-access?error=Configuration`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(`${base}/study-access?error=OAuthCallback`);
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(`${base}/study-access?error=OAuthCallback`);
  }

  // Verify state (CSRF + destination)
  const statePayload = verify(stateParam, secret);
  if (!statePayload) {
    return NextResponse.redirect(`${base}/study-access?error=OAuthCallback`);
  }

  const next = String(statePayload.next || '/study-material');
  const callbackUrl = `${base}/api/auth/callback/google`;

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${base}/study-access?error=OAuthCallback`);
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return NextResponse.redirect(`${base}/study-access?error=OAuthCallback`);
    }

    // Get user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      return NextResponse.redirect(`${base}/study-access?error=OAuthCallback`);
    }

    const profile = await profileRes.json();
    const email = String(profile.email || '').toLowerCase();

    // Enforce JIIT domain restriction
    if (!email.endsWith(JIIT_DOMAIN)) {
      return NextResponse.redirect(`${base}/study-access?error=AccessDenied`);
    }

    // Issue session JWT — 7 days, slid forward on every visit by the middleware.
    const sessionToken = createSessionToken(
      {
        email,
        name: String(profile.name || ''),
        image: String(profile.picture || ''),
        provider: 'google',
      },
      secret
    );

    trackStudySignIn(email);

    const response = NextResponse.redirect(`${base}${next}`);
    setSessionCookies(response, sessionToken);
    return response;
  } catch {
    return NextResponse.redirect(`${base}/study-access?error=OAuthCallback`);
  }
}
