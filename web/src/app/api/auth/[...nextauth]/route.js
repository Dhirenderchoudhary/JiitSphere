// NextAuth has been replaced with a custom Google OAuth flow.
// Requests to /api/auth/* are now handled by:
//   GET  /api/auth/google/start    — initiates Google OAuth
//   GET  /api/auth/google/callback — handles Google callback
//   POST /api/auth/signout         — clears session cookies
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'Use /api/auth/google/start to sign in.' }, { status: 404 });
}
export async function POST() {
  return NextResponse.json({ message: 'Use /api/auth/signout to sign out.' }, { status: 404 });
}
