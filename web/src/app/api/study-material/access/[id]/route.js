import { NextResponse } from 'next/server';

const BACKEND_BASE =
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api/v1';

/**
 * Lightweight access route — used ONLY for:
 *   • "Open in New Tab" button  (action=view  → redirect to file)
 *   • "Download" button         (action=download → redirect to file)
 *
 * The embedded viewer does NOT use this route.
 * It receives the direct CDN URL (or Google Docs Viewer URL) from
 * the server component so there is zero proxy overhead.
 */
export async function GET(request, { params }) {
  try {
    const id = params.id;

    const response = await fetch(
      `${BACKEND_BASE.replace(/\/+$/, '')}/materials/${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      return new NextResponse(
        'Material not found or has been removed.',
        { status: 404, headers: { 'Content-Type': 'text/plain' } }
      );
    }

    const payload = await response.json().catch(() => null);
    const material = payload?.data;

    if (!material?.fileUrl) {
      return new NextResponse(
        'Source file URL is not available.',
        { status: 404, headers: { 'Content-Type': 'text/plain' } }
      );
    }

    return NextResponse.redirect(material.fileUrl);
  } catch (error) {
    console.error('Study material access error:', error);
    return new NextResponse(
      'Internal server error while accessing material.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }
}