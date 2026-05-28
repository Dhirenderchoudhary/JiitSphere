import { NextResponse } from 'next/server';
import { rateLimit } from 'lib/rateLimit';
import { ADMIN_COOKIE_NAME, verifyAdminCookieToken } from 'lib/adminAuthCookie';

const limiter = rateLimit({
  name: 'admin-upload',
  windowMs: 60 * 1000,
  max: 30,
});
const DEV_BACKEND_BASE_URL = 'http://localhost:5000/api/v1';
const resolveBackendBaseUrl = () =>
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV !== 'production' ? DEV_BACKEND_BASE_URL : '');

export async function POST(request) {
  const limited = limiter(request);
  if (limited) return limited;

  // Verify the caller is authenticated as admin
  const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value || '';
  if (!verifyAdminCookieToken(adminCookie).valid) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const adminApiKey = process.env.ADMIN_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const backendBaseUrl = resolveBackendBaseUrl();

  if (!adminApiKey || !adminEmail || !backendBaseUrl) {
    return NextResponse.json({ success: false, message: 'Service unavailable' }, { status: 503 });
  }

  const formData = await request.formData();

  const response = await fetch(`${backendBaseUrl}/admin/materials`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminApiKey,
      'x-admin-email': adminEmail,
    },
    body: formData,
  });

  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
