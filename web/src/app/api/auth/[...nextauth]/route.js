import NextAuth from 'next-auth';
import { authOptions } from 'lib/auth';

const nextAuthFactory = typeof NextAuth === 'function' ? NextAuth : NextAuth?.default;
const handler = nextAuthFactory(authOptions);
export { handler as GET, handler as POST };
