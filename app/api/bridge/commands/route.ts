import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase/server';
export async function GET() {
  const auth=await requireUser(['super_admin']);if(auth.response)return auth.response;
  const {data,error}=await createServiceClient().from('bridge_commands').select('request_id,component,method,state,error,created_at').order('created_at',{ascending:false}).limit(20);
  if(error)return NextResponse.json({error:'Could not load command history'},{status:503});
  return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
}
