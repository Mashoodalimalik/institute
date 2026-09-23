import { NextResponse } from 'next/server';
import { demoStore } from '@/lib/services/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const count = await demoStore.getPendingCount();
    return NextResponse.json({ count });
  } catch (err: any) {
    return NextResponse.json({ count: 0, error: err.message }, { status: 500 });
  }
}
