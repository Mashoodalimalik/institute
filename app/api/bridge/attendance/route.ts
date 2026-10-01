import { NextRequest,NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireUser } from '@/lib/api-auth';
import { bridgeSettings,bridgeCommand } from '@/lib/bridge';
import { createServiceClient } from '@/lib/supabase/server';
import { processAttendance } from '@/lib/attendance';
export async function POST(req:NextRequest) {
  const auth=await requireUser(['super_admin']);if(auth.response)return auth.response;
  if(req.headers.get('origin')!==`${req.nextUrl.protocol}//${req.headers.get('host')}`)return NextResponse.json({error:'Same-origin request required'},{status:403});
  try {
    const {runner}=await req.json();const settings=await bridgeSettings();
    if(settings.controller_id!==runner||Date.now()-Date.parse(settings.controller_seen_at)>30000)throw Error('Active bridge controller required');
    const db=createServiceClient();
    const {data:command,error}=await db.from('bridge_commands').select('*').eq('method','get_attendance').eq('state','succeeded').is('ingested_at',null).order('created_at').limit(1).maybeSingle();
    if(error)throw error;
    if(command) {
      if(!Array.isArray(command.result))throw Error('Invalid attendance result');
      const rows=command.result.slice().sort((a:any,b:any)=>String(a.timestamp).localeCompare(String(b.timestamp)));
      const from=command.processed_count;const batch=rows.slice(from,from+20);let unmapped=0;
      for(const row of batch) {
        const timestamp=/(Z|[+-]\d{2}:\d{2})$/.test(row.timestamp)?row.timestamp:`${row.timestamp}+05:00`;
        const deviceId=command.target.device.id;
        const source=createHash('sha256').update(JSON.stringify([deviceId,String(row.user_id),timestamp,row.status,row.punch])).digest('hex');
        const response=await processAttendance({user_id:String(row.user_id),timestamp,device_id:deviceId,source_event_id:source,secret:''});
        if(response.status===404){unmapped++;continue;}
        if(!response.ok)throw Error('Attendance processing failed; the batch will be retried');
      }
      const done=from+batch.length;
      const saved=await db.from('bridge_commands').update({processed_count:done,ingested_at:done>=rows.length?new Date().toISOString():null}).eq('request_id',command.request_id).eq('processed_count',from);
      if(saved.error)throw saved.error;
      return NextResponse.json({processed:batch.length,unmapped});
    }
    if(settings.device.address) {
      const pending=await db.from('bridge_commands').select('request_id').eq('component','hardware').in('state',['queued','running']).limit(1);
      if(pending.error)throw pending.error;
      if(!pending.data.length)await bridgeCommand('hardware','get_attendance',{}, {deviceId:settings.device.id},'attendance-'+Math.floor(Date.now()/30000));
    }
    return NextResponse.json({processed:0});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Attendance sync failed'},{status:400});}
}
