/**
 * Simple in-memory rate limiter for Next.js API routes.
 * Uses a sliding-window counter per IP.
 */

const stores = new Map();

function getStore(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

/**
 * @param {object} opts
 * @param {string} opts.name      - Unique limiter name (e.g. 'admin-login')
 * @param {number} opts.windowMs  - Window in ms (default 15 min)
 * @param {number} opts.max       - Max requests per window (default 5)
 * @returns {function} (request: Request) => NextResponse | null
 */
export function rateLimit({ name, windowMs = 15 * 60 * 1000, max = 5 } = {}) {
  const store = getStore(name);

  // Cleanup expired entries every 60s
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.start > windowMs) store.delete(key);
    }
  }, 60_000).unref?.();

  /**
   * Returns null if allowed, or a Response (429) if rate-limited.
   */
  return function check(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
    const now = Date.now();

    let entry = store.get(ip);
    if (!entry || now - entry.start > windowMs) {
      entry = { count: 0, start: now };
      store.set(ip, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.start + windowMs - now) / 1000);
      return new Response(
        JSON.stringify({ message: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        }
      );
    }

    return null;
  };
}
