import { NextResponse } from 'next/server';

const BACKEND_BASE =
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api/v1';

/**
 * Fallback access route: resolves a material id to its file and redirects.
 *
 * The `action` query parameter is accepted for backwards compatibility but does
 * not change the behaviour — both view and download redirect to the same file.
 * Download naming is handled client-side by fetching the file as a blob.
 *
 * Neither the viewer nor the list normally uses this route; both already hold
 * the direct CDN URL, so there is no proxy hop. It exists for materials whose
 * fileUrl is missing from a list response and for older links.
 */
export async function GET(request, { params }) {
  try {
    const { id } = params;

    const response = await fetch(
      `${BACKEND_BASE.replace(/\/+$/, '')}/materials/${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return new NextResponse('Material not found or has been removed.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const payload = await response.json().catch(() => null);
    const material = payload?.data;

    if (!material?.fileUrl) {
      return new NextResponse('Source file URL is not available.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return NextResponse.redirect(material.fileUrl);
  } catch (error) {
    console.error('Study material access error:', error);
    return new NextResponse('Internal server error while accessing material.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
