import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { localBackendStatus } from '@/lib/bridge';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireUser(['super_admin', 'staff']);
  if (auth.response) return auth.response;
  return NextResponse.json(await localBackendStatus(),{headers:{'Cache-Control':'no-store'}});
}
