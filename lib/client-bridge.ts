'use client';
export interface ClientWhatsAppSession {connection:string;account:{id:string;name?:string}|null;qr:string|null;qrExpiresAt:number|null;detail?:string|null;onDevice?:boolean}
export interface ClientBridgeStatus {hardware:{reachable:boolean;version?:string};whatsapp:{reachable:boolean};k40Configured:boolean;onDevice:boolean;controllerOnline?:boolean}
export async function checkOnDeviceBridge():Promise<boolean> {return !!(await cloudRequest('/api/bridge/status')).controllerOnline;}
export async function cloudRequest(path:string,body?:unknown) {
  const res=await fetch(path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await res.json();if(!res.ok)throw Error(data.error||`Application request failed (${res.status})`);return data;
}
export async function fetchBridgeStatus():Promise<ClientBridgeStatus> {const data=await cloudRequest('/api/bridge/status');return {...data,onDevice:!!localStorage.getItem('prism.bridge.pairing')};}
export async function fetchWhatsAppSession():Promise<ClientWhatsAppSession> {return cloudRequest('/api/whatsapp/session');}
export async function waitForCommand(command:any,timeout=135000) {
  const deadline=Date.now()+timeout;
  while(['queued','running'].includes(command.state)&&Date.now()<deadline) {
    await new Promise(r=>setTimeout(r,750));
    command=await cloudRequest(`/api/bridge/commands/${encodeURIComponent(command.requestId)}?component=${command.component}`);
  }
  if(command.state!=='succeeded')throw Error(command.error?.message||`Command ${command.requestId} is ${command.state}. Check its result before retrying.`);
  return command;
}
export async function executeWhatsAppAction(action:'connect'|'disconnect'|'unlink'|'refresh'):Promise<ClientWhatsAppSession> {
  for(const step of action==='refresh'?['disconnect','connect']:[action]) {
    const command=await cloudRequest('/api/whatsapp/session',{action:step,requestId:crypto.randomUUID()});
    await waitForCommand(command,30000);
  }
  return fetchWhatsAppSession();
}
export async function sendWhatsAppMessageDirect(params:{phone:string;message:string}):Promise<{success:boolean;sid?:string;onDevice?:boolean}> {
  const requestId=crypto.randomUUID();
  const data=await cloudRequest('/api/notifications/send-whatsapp',{phone:params.phone,custom_message:params.message,requestId});
  if(data.queued)await waitForCommand({requestId:data.sid,component:'whatsapp',state:'queued'});
  else if(!data.success)throw Error(data.error||'Message failed');
  return {success:true,sid:data.sid};
}
