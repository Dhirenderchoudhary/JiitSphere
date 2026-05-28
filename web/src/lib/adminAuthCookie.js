import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE_NAME = 'admin_auth';
export const ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const getCookieSecret = () => process.env.ADMIN_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || '';

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (!left.length || !right.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

export const createAdminCookieToken = (adminId) => {
  const secret = getCookieSecret();
  if (!secret) {
    throw new Error('Admin cookie secret is not configured');
  }

  const payload = {
    id: String(adminId || ''),
    iat: Date.now(),
    exp: Date.now() + ADMIN_COOKIE_MAX_AGE_SECONDS * 1000,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
};

export const verifyAdminCookieToken = (token = '') => {
  const secret = getCookieSecret();
  const value = String(token || '');
  if (!value || !secret) {
    return { valid: false, payload: null };
  }

  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) {
    return { valid: false, payload: null };
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (!safeEqual(signature, expectedSignature)) {
    return { valid: false, payload: null };
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const exp = Number(payload?.exp || 0);
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      return { valid: false, payload: null };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, payload: null };
  }
};
