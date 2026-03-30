import GoogleProvider from 'next-auth/providers/google';
import { trackStudySignIn } from './studyAnalyticsStore';

const JIIT_DOMAIN = '@mail.jiit.ac.in';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

/** @type {import('next-auth').AuthOptions} */
export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
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
