const crypto = require('crypto');

const base64url = (value) => Buffer.from(value).toString('base64url');

const timingSafeEqual = (a, b) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const sign = (payload, secret) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
};

const verify = (token, secret) => {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (payload.exp !== undefined && payload.exp !== null) {
      const expRaw = Number(payload.exp);
      if (!Number.isFinite(expRaw)) return null;
      const expMs = expRaw < 1_000_000_000_000 ? expRaw * 1000 : expRaw;
      if (Date.now() > expMs) return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
};

module.exports = {
  sign,
  verify,
};
