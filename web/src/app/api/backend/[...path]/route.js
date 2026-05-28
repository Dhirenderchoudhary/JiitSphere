import { NextResponse } from 'next/server';

const DEV_BACKEND_BASE_URL = 'http://localhost:5000/api/v1';
const resolveBackendBaseUrl = () =>
  process.env.INTERNAL_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV !== 'production' ? DEV_BACKEND_BASE_URL : '');
const REQUEST_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 20000);
const REQUEST_RETRIES = Math.max(0, Number(process.env.NEXT_PUBLIC_API_RETRIES || 1));

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
]);
const NO_BODY_STATUSES = new Set([204, 205, 304]);

const joinPath = (segments = []) =>
  `/${segments
    .map((segment) => String(segment || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`;

const buildTargetUrl = (request, pathSegments, backendBaseUrl) => {
  const target = new URL(backendBaseUrl);
  target.pathname = `${target.pathname.replace(/\/+$/, '')}${joinPath(pathSegments)}`;
  target.search = new URL(request.url).search;
  return target;
};

const buildForwardHeaders = (request) => {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const authorization = request.headers.get('authorization');
  const adminEmail = request.headers.get('x-admin-email');
  const adminKey = request.headers.get('x-admin-key');

  if (contentType) headers.set('content-type', contentType);
  if (authorization) headers.set('authorization', authorization);
  if (adminEmail) headers.set('x-admin-email', adminEmail);
  if (adminKey) headers.set('x-admin-key', adminKey);

  return headers;
};

const fetchWithRetry = async (targetUrl, options = {}) => {
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(3000, REQUEST_TIMEOUT_MS));

    try {
      return await fetch(targetUrl, {
        ...options,
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (error) {
      if (attempt >= REQUEST_RETRIES) {
        throw error;
      }
      attempt += 1;
    } finally {
      clearTimeout(timeoutId);
    }
  }
};

const proxyRequest = async (request, { params }) => {
  const backendBaseUrl = resolveBackendBaseUrl();
  if (!backendBaseUrl) {
    return NextResponse.json(
      { success: false, message: 'Backend API is not configured' },
      { status: 503 }
    );
  }

  const pathSegments = Array.isArray(params?.path) ? params.path : [];
  const targetUrl = buildTargetUrl(request, pathSegments, backendBaseUrl);
  const method = request.method || 'GET';
  const headers = buildForwardHeaders(request);
  const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase());
  const body = hasBody ? await request.text() : undefined;

  try {
    const upstream = await fetchWithRetry(targetUrl, {
      method,
      headers,
      body: body || undefined,
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });
    // Upstream bodies may be transparently decompressed by fetch; avoid stale lengths.
    responseHeaders.delete('content-length');
    responseHeaders.set('cache-control', 'no-store');

    if (NO_BODY_STATUSES.has(upstream.status)) {
      return new NextResponse(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('application/json')) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        message: 'Backend service is temporarily unavailable. Please retry.',
      },
      { status: 502 }
    );
  }
};

export async function GET(request, context) {
  return proxyRequest(request, context);
}

export async function POST(request, context) {
  return proxyRequest(request, context);
}

export async function PUT(request, context) {
  return proxyRequest(request, context);
}

export async function PATCH(request, context) {
  return proxyRequest(request, context);
}

export async function DELETE(request, context) {
  return proxyRequest(request, context);
}

export async function OPTIONS(request, context) {
  return proxyRequest(request, context);
}
