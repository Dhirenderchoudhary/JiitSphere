// Bumped from v2 — activate() deletes every older cache, which is what clears
// the signed-in HTML and stale API responses the previous version stored.
const CACHE_NAME = 'jiitsphere-v3';

// Only genuinely public, non-personalised URLs may be precached. The previous
// version listed /study-material, /portal and /login: those redirect when
// signed out, cache.put() rejects on a redirected response, and the whole
// addAll() failed — so the service worker never finished installing.
const PRECACHE_URLS = ['/offline', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individually, so one missing asset cannot fail the whole install.
      Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  /\.(png|jpg|jpeg|svg|gif|ico|webp|woff2?)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch cross-origin requests — study material PDFs live on the CDN and
  // are already cached by the browser's own HTTP cache.
  if (url.origin !== self.location.origin) return;

  // Hashed static assets only. Everything else — HTML pages, API responses,
  // RSC payloads — is left to the network so a signed-in response can never be
  // replayed to a signed-out visitor (or the reverse, which read as random
  // sign-outs).
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigations bypass the cache but fall back to the offline page when there
  // is genuinely no network.
  if (request.mode === 'navigate') {
    event.respondWith(networkWithOfflineFallback(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // A redirected response cannot be stored, and only same-origin 200s are
    // worth keeping.
    if (response && response.ok && !response.redirected) {
      cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match('/offline');
    if (offline) return offline;

    return new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline - JiitSphere</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0;text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#94a3b8}</style></head><body><div><h1>You are offline</h1><p>Please check your internet connection and try again.</p></div></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
