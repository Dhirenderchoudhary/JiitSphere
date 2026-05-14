
/**
 * portalCache.js — Simple in-memory TTL cache for portal API responses.
 *
 * Design:
 *   - Per-user, per-key caching with configurable TTL
 *   - Automatic expiry cleanup on a 60s interval
 *   - Thread-safe (single-threaded JS, but handles concurrent async reads)
 *   - No external dependencies
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000;

const store = new Map();

/**
 * Build a cache key scoped to a user.
 * @param {string} userId - Owner/enrollment identifier
 * @param {string} scope  - e.g. 'attendance-meta', 'attendance:SEM_ID'
 * @returns {string}
 */
const cacheKey = (userId, scope) => `${userId}::${scope}`;

/**
 * Get a cached value if it exists and hasn't expired.
 * @param {string} userId
 * @param {string} scope
 * @returns {*|null}
 */
const get = (userId, scope) => {
  const key = cacheKey(userId, scope);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
};

/**
 * Store a value with a TTL.
 * @param {string} userId
 * @param {string} scope
 * @param {*} value
 * @param {number} [ttlMs=DEFAULT_TTL_MS]
 */
const set = (userId, scope, value, ttlMs = DEFAULT_TTL_MS) => {
  const key = cacheKey(userId, scope);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

/**
 * Invalidate a specific cache entry.
 * @param {string} userId
 * @param {string} scope
 */
const invalidate = (userId, scope) => {
  store.delete(cacheKey(userId, scope));
};

/**
 * Invalidate ALL cache entries for a user.
 * @param {string} userId
 */
const invalidateUser = (userId) => {
  const prefix = `${userId}::`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
};

/** Periodic cleanup of expired entries */
const cleanup = () => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
};

setInterval(cleanup, CLEANUP_INTERVAL_MS).unref();

module.exports = { get, set, invalidate, invalidateUser, DEFAULT_TTL_MS };
