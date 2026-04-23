import { createHmac, timingSafeEqual } from 'node:crypto';

const base64url = (value) => Buffer.from(value).toString('base64url');

export const sign = (payload, secret) => {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
};

export const verify = (token, secret) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');

  const aBuf = Buffer.from(sig);
  const bBuf = Buffer.from(expected);
  if (aBuf.length !== bBuf.length || !timingSafeEqual(aBuf, bBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp !== undefined) {
      const expMs = payload.exp < 1_000_000_000_000 ? payload.exp * 1000 : payload.exp;
      if (Date.now() > expMs) return null;
    }
    return payload;
  } catch {
    return null;
  }
};
