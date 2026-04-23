import { NextResponse } from 'next/server';
import { getSession } from 'lib/session';
import { getStudySnapshot } from 'lib/studyAnalyticsStore';

export async function GET() {
  const session = await getSession();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: getStudySnapshot() });
}
