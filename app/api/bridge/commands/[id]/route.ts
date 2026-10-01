import { NextRequest,NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { bridgeResult } from '@/lib/bridge';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const auth=await requireUser(['super_admin','staff']);if(auth.response)return auth.response;
  const component=req.nextUrl.searchParams.get('component');
  if(component!=='hardware'&&component!=='whatsapp')return NextResponse.json({error:'Invalid component'},{status:400});
  try{return NextResponse.json(await bridgeResult(component,(await params).id),{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'Command not found'},{status:404});}
}
