import { requireUser } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { serverStore as demoStore } from '@/lib/services/server-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireUser(['super_admin']);
  if (auth.response) return auth.response;
  try {
    const count = await demoStore.getPendingCount();
    return NextResponse.json({ count });
  } catch (err: any) {
    return NextResponse.json({ count: 0, error: err.message }, { status: 500 });
  }
}
