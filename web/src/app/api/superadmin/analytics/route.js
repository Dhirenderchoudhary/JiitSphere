import { NextResponse } from 'next/server';
import { rateLimit } from 'lib/rateLimit';

const limiter = rateLimit({
  name: 'superadmin-analytics',
  windowMs: 60 * 1000,
  max: 30,
});
const DEV_BACKEND_BASE_URL = 'http://localhost:5000/api/v1';
const resolveBackendBaseUrl = () =>
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV !== 'production' ? DEV_BACKEND_BASE_URL : '');

const resolveOrigin = (request) => {
  const forwardedOrigin = request.headers.get('origin');
  if (forwardedOrigin) return forwardedOrigin;
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
};

export async function GET(request) {
  const limited = limiter(request);
  if (limited) return limited;

  const backendBaseUrl = resolveBackendBaseUrl();
  if (!backendBaseUrl) {
    return NextResponse.json(
      { success: false, message: 'Backend API is not configured' },
      { status: 503 }
    );
  }

  try {
    const authHeader = request.headers.get('authorization') || '';
    const origin = resolveOrigin(request);
    const response = await fetch(`${backendBaseUrl}/superadmin/analytics`, {
      headers: {
        Authorization: authHeader,
        ...(origin ? { Origin: origin } : {}),
      },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
