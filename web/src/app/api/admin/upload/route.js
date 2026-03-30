import { NextResponse } from 'next/server';

const BACKEND_BASE_URL = process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api/v1';

export async function POST(request) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminApiKey) {
    return NextResponse.json({ success: false, message: 'ADMIN_API_KEY is not configured' }, { status: 500 });
  }

  if (!adminEmail) {
    return NextResponse.json({ success: false, message: 'ADMIN_EMAIL is not configured' }, { status: 500 });
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
