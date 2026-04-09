import { NextResponse } from 'next/server';
import { rateLimit } from 'lib/rateLimit';

const limiter = rateLimit({ name: 'superadmin-login', windowMs: 15 * 60 * 1000, max: 5 });
const BACKEND_BASE_URL = process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5050/api/v1';

const resolveOrigin = (request) => {
  const forwardedOrigin = request.headers.get('origin');
  if (forwardedOrigin) return forwardedOrigin;
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
};

export async function POST(request) {
  const limited = limiter(request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const origin = resolveOrigin(request);
    const response = await fetch(`${BACKEND_BASE_URL}/superadmin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {})
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ success: false, message: 'Login failed' }, { status: 500 });
  }
}
