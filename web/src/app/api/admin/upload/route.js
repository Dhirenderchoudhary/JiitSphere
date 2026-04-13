import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'lib/rateLimit';

const limiter = rateLimit({ name: 'admin-upload', windowMs: 60 * 1000, max: 30 });
const BACKEND_BASE_URL = process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5050/api/v1';
const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || '';

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (!left.length || !right.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

const verifyAdminCookie = (token = '') => {
  const value = String(token || '');
  if (!value || !ADMIN_COOKIE_SECRET) return false;

  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) return false;

  const expectedSignature = createHmac('sha256', ADMIN_COOKIE_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  if (!safeEqual(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return Number(payload?.exp || 0) > Date.now();
  } catch {
    return false;
  }
};

export async function POST(request) {
  const limited = limiter(request);
  if (limited) return limited;

  // Verify the caller is authenticated as admin
  const adminCookie = request.cookies.get('admin_auth')?.value || '';
  if (!verifyAdminCookie(adminCookie)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const adminApiKey = process.env.ADMIN_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminApiKey || !adminEmail) {
    return NextResponse.json({ success: false, message: 'Service unavailable' }, { status: 503 });
  }

  const formData = await request.formData();

  const response = await fetch(`${BACKEND_BASE_URL}/admin/materials`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminApiKey,
      'x-admin-email': adminEmail
    },
    body: formData
  });

  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
