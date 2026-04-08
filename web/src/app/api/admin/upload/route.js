import { NextResponse } from 'next/server';
import { rateLimit } from 'lib/rateLimit';

const limiter = rateLimit({ name: 'admin-upload', windowMs: 60 * 1000, max: 30 });
const BACKEND_BASE_URL = process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api/v1';

export async function POST(request) {
  const limited = limiter(request);
  if (limited) return limited;

  // Verify the caller is authenticated as admin
  const adminCookie = request.cookies.get('admin_auth')?.value;
  if (adminCookie !== '1') {
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
