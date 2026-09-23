import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { hardwareConfiguration, saveHardwareConfiguration, testHardwareConnection } from '@/lib/bridge';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET() {
  const auth=await requireUser(['super_admin']);if(auth.response)return auth.response;
  try{return NextResponse.json(await hardwareConfiguration(),{headers});}
  catch{return NextResponse.json({error:'Local backend is unavailable'},{status:503,headers});}
}
export async function POST(req:NextRequest) {
  const auth=await requireUser(['super_admin']);if(auth.response)return auth.response;
  if(req.headers.get('origin')!==`${req.nextUrl.protocol}//${req.headers.get('host')}`)return NextResponse.json({error:'Same-origin request required'},{status:403,headers});
  const body=await req.json().catch(()=>null);
  if(!body)return NextResponse.json({error:'JSON required'},{status:400,headers});
  try {
    if(body.action==='test')return NextResponse.json(await testHardwareConnection(),{headers});
    if(body.action!=='save')return NextResponse.json({error:'Unknown action'},{status:400,headers});
    return NextResponse.json(await saveHardwareConfiguration(body.config),{headers});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Device operation failed'},{status:502,headers});}
}
