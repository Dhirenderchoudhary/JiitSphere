import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from 'lib/auth';
import { getStudySnapshot } from 'lib/studyAnalyticsStore';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: getStudySnapshot() });
}
