import GoogleProvider from 'next-auth/providers/google';
import { trackStudySignIn } from './studyAnalyticsStore';
import fs from 'node:fs';
import path from 'node:path';

const JIIT_DOMAIN = '@mail.jiit.ac.in';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const normalizeSiteUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
let localEnvCache = null;

const readLocalEnv = () => {
  if (localEnvCache) return localEnvCache;

  const envPaths = [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), '.env')];
  const parsed = {};

  for (const envPath of envPaths) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex <= 0) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (key && value && parsed[key] === undefined) {
          parsed[key] = value;
        }
      }
    } catch {
      // ignore env fallback parsing errors
    }
  }

  localEnvCache = parsed;
  return parsed;
};

const fromEnv = (key, fallback = '') => {
  const direct = String(process.env[key] || '').trim();
  if (direct) return direct;
  const fileValue = String(readLocalEnv()[key] || '').trim();
  return fileValue || fallback;
};

const googleClientId = fromEnv('GOOGLE_CLIENT_ID');
const googleClientSecret = fromEnv('GOOGLE_CLIENT_SECRET');
const nextAuthSecret = fromEnv('NEXTAUTH_SECRET', fromEnv('AUTH_SECRET'));
const resolvedSiteUrl =
  normalizeSiteUrl(
    fromEnv('NEXTAUTH_URL') ||
      fromEnv('NEXT_PUBLIC_SITE_URL') ||
      (fromEnv('VERCEL_URL') ? `https://${fromEnv('VERCEL_URL')}` : 'http://localhost:3000')
  ) || 'http://localhost:3000';

if (!process.env.NEXTAUTH_URL && resolvedSiteUrl) {
  process.env.NEXTAUTH_URL = resolvedSiteUrl;
}
if (!process.env.NEXTAUTH_SECRET && nextAuthSecret) {
  process.env.NEXTAUTH_SECRET = nextAuthSecret;
}
if (!process.env.GOOGLE_CLIENT_ID && googleClientId) {
  process.env.GOOGLE_CLIENT_ID = googleClientId;
}
if (!process.env.GOOGLE_CLIENT_SECRET && googleClientSecret) {
  process.env.GOOGLE_CLIENT_SECRET = googleClientSecret;
}

const googleProviderFactory =
  typeof GoogleProvider === 'function' ? GoogleProvider : GoogleProvider?.default;

/** @type {import('next-auth').AuthOptions} */
export const authOptions = {
  trustHost: true,
  secret: nextAuthSecret || undefined,
  providers: [
    googleProviderFactory({
      clientId: googleClientId,
      clientSecret: googleClientSecret
    })
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return false;
      const email = String(profile?.email || '').toLowerCase();
      // Enforce domain restriction — only JIIT student/faculty accounts
      return email.endsWith(JIIT_DOMAIN);
    },
    async session({ session }) {
      if (session?.user?.email) {
        session.user.isAdmin = session.user.email.toLowerCase() === ADMIN_EMAIL;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      const safeBaseUrl = normalizeSiteUrl(baseUrl) || resolvedSiteUrl;
      
      console.log('Redirect callback:', { url, baseUrl, safeBaseUrl });
    
      if (!url) return safeBaseUrl;
      if (url.startsWith('/')) return `${safeBaseUrl}${url}`;
      try {
        const target = new URL(url);
        const base = new URL(safeBaseUrl);
        if (target.origin === base.origin) return target.toString();
      } catch (_error) {
        return safeBaseUrl;
      }

      return safeBaseUrl;
    }
  },
  events: {
    async signIn({ user }) {
      if (user?.email) {
        trackStudySignIn(user.email);
      }
    }
  },
  pages: {
    signIn: '/study-access',
    error: '/study-access'
  }
};
