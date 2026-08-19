/**
 * Edge-runtime twin of lib/token.js.
 *
 * Middleware runs on the Edge runtime, where `node:crypto` is unavailable, so
 * the same HS256 scheme is implemented here on top of Web Crypto. Tokens minted
 * by either file verify against the other — keep the two in sync.
 */

const encoder = new TextEncoder();

const toBase64Url = (bytes) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const base64UrlText = (text) => toBase64Url(encoder.encode(text));

const importKey = (secret) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);

const hmac = async (data, secret) => {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toBase64Url(new Uint8Array(signature));
};

/**
 * Constant-time comparison of two base64url signatures.
 * The bitwise accumulate is deliberate — it keeps the comparison from
 * short-circuiting on the first differing byte.
 */
/* eslint-disable no-bitwise */
const signaturesMatch = (left, right) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
};
/* eslint-enable no-bitwise */

export const signEdge = async (payload, secret) => {
  const header = base64UrlText(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlText(JSON.stringify(payload));
  const data = `${header}.${body}`;
  return `${data}.${await hmac(data, secret)}`;
};

export const verifyEdge = async (token, secret) => {
  if (!token || typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const expected = await hmac(`${header}.${body}`, secret);
  if (!signaturesMatch(sig, expected)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (payload.exp !== undefined) {
      const expMs = payload.exp < 1_000_000_000_000 ? payload.exp * 1000 : payload.exp;
      if (Date.now() > expMs) return null;
    }
    return payload;
  } catch {
    return null;
  }
};
