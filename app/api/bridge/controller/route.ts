import { NextRequest,NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { claimCommand,controllerHeartbeat,reportCommand } from '@/lib/bridge';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest) {
  const auth=await requireUser(['super_admin']);if(auth.response)return auth.response;
  if(req.headers.get('origin')!==`${req.nextUrl.protocol}//${req.headers.get('host')}`)return NextResponse.json({error:'Same-origin request required'},{status:403});
  try {
    const body=await req.json();
    if(!/^[0-9a-f-]{36}$/i.test(body.runner||''))throw Error('Invalid controller ID');
    let data;
    if(body.action==='heartbeat')data=await controllerHeartbeat(body.runner,body.health,body.session);
    else if(body.action==='claim'&&['hardware','whatsapp'].includes(body.component))data={command:await claimCommand(body.runner,body.component)};
    else if(body.action==='report')data=await reportCommand(body.runner,body.requestId,body.result);
    else throw Error('Unknown controller action');
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Controller request failed'},{status:400});}
}
