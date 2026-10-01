import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { cloudBridgeStatus } from '@/lib/bridge';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireUser(['super_admin', 'staff']);
  if (auth.response) return auth.response;
  try{return NextResponse.json(await cloudBridgeStatus(),{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'Bridge database is unavailable. Apply the cloud bridge migration and verify the Supabase server configuration.'},{status:503});}
}
