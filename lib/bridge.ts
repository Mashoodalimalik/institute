import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';
import { isDeepStrictEqual } from 'node:util';
import { deviceConfiguration, normalizePhone, sanitizeSession } from './bridge-validation.mjs';

type Component = 'hardware' | 'whatsapp';
export type Command = {requestId:string;component:Component;method:string;arguments?:any;target?:any;state:string;result?:any;error?:{message?:string}};
const db=()=>createServiceClient();
function checked<T extends {error:any;data:any}>(response:T):T['data'] {if(response.error)throw Error(response.error.message);return response.data;}
export async function bridgeSettings() {return checked(await db().from('bridge_settings').select('*').eq('id',true).single());}
export function commandView(row:any,payload=false):Command {return {requestId:row.request_id,component:row.component,method:row.method,...(payload?{arguments:row.arguments,target:row.target}:{}),state:row.state,result:row.result,error:row.error};}
export async function cloudBridgeStatus() {
  const s=await bridgeSettings(); const online=Date.now()-Date.parse(s.controller_seen_at||'')<30000;
  return {hardware:{...s.health?.hardware,reachable:online&&!!s.health?.hardware?.reachable},whatsapp:{reachable:online&&!!s.health?.whatsapp?.reachable},k40Configured:!!s.device?.address,controllerOnline:online};
}
export async function hardwareConfiguration() {const {device}=await bridgeSettings();const {commKey,...publicDevice}=device;return {...publicDevice,hasCommKey:!!commKey,configured:!!device.address};}
export async function saveHardwareConfiguration(value:unknown) {
  const s=await bridgeSettings(); const device=deviceConfiguration(value,s.device);
  // Each queued command carries a snapshot of its device target, so edits cannot retarget it.
  checked(await db().from('bridge_settings').update({device}).eq('id',true));
  return hardwareConfiguration();
}
export async function bridgeCommand(component:Component,method:string,args:Record<string,unknown>,target:Record<string,any>,requestId:string):Promise<Command> {
  if(!/^[a-zA-Z0-9_.-]{1,120}$/.test(requestId))throw Error('Invalid request ID');
  const existing=checked(await db().from('bridge_commands').select('*').eq('request_id',requestId).maybeSingle());
  if(existing) {
    if(existing.component!==component||existing.method!==method||!isDeepStrictEqual(existing.arguments,args))throw Error('Request ID already belongs to a different command');
    return commandView(existing);
  }
  if(component==='hardware') {const {device}=await bridgeSettings();if(!device.address||target.deviceId!==device.id)throw Error('Save the actual K40 IP address first');target={device};}
  const lifetime=method==='sendMessage'?(requestId.startsWith('attendance-')?300000:86400000):600000;
  const inserted=await db().from('bridge_commands').insert({request_id:requestId,component,method,arguments:args,target,expires_at:new Date(Date.now()+lifetime).toISOString()}).select().single();
  if(inserted.error?.code==='23505')return bridgeCommand(component,method,args,target,requestId);
  return commandView(checked(inserted));
}
export async function bridgeResult(component:Component,requestId:string):Promise<Command> {
  const row=checked(await db().from('bridge_commands').select('*').eq('request_id',requestId).eq('component',component).single());return commandView(row);
}
export async function testHardwareConnection() {
  const device=await hardwareConfiguration();if(!device.configured)throw Error('Save the K40 IP address first');
  const commands=[];
  for(const method of ['get_device_name','get_serialnumber'])commands.push(await bridgeCommand('hardware',method,{}, {deviceId:device.id},crypto.randomUUID()));
  return {commands};
}
export async function sendBridgeWhatsApp(phone:string,message:string,requestId:string=crypto.randomUUID()) {
  if(typeof message!=='string'||!message.trim()||message.length>10000)throw Error('A message of 1–10,000 characters is required');
  const s=await bridgeSettings();if(!s.session?.account?.id)throw Error('Link WhatsApp in Settings before sending messages');
  const command=await bridgeCommand('whatsapp','sendMessage',{jid:normalizePhone(phone)+'@s.whatsapp.net',content:{text:message}},{accountId:s.session.account.id},requestId);
  return {success:command.state==='succeeded',queued:['queued','running'].includes(command.state),sid:command.requestId,state:command.state,error:command.error?.message};
}
export type WhatsAppSession = {connection:string;account:{id:string;name?:string}|null;qr:string|null;qrExpiresAt:number|null;detail?:string|null};
export async function whatsAppSession():Promise<WhatsAppSession> {
  const s=await bridgeSettings();if(!(Date.now()-Date.parse(s.controller_seen_at||'')<30000))return {connection:'disconnected',account:s.session?.account||null,qr:null,qrExpiresAt:null,detail:'Open the web app on the bridge PC and connect it in Settings.'};
  return sanitizeSession(s.session);
}
export async function whatsAppAction(action:'connect'|'disconnect'|'unlink',requestId:string) {
  checked(await db().from('bridge_settings').update({reconnect:action==='connect'}).eq('id',true));
  return bridgeCommand('whatsapp',action,{}, {},requestId);
}
export async function controllerHeartbeat(runner:string,health:any,session:any) {
  const accepted=checked(await db().rpc('bridge_heartbeat',{p_runner:runner,p_health:{hardware:{reachable:!!health?.hardware?.reachable,version:String(health?.hardware?.version||'').slice(0,30)},whatsapp:{reachable:!!health?.whatsapp?.reachable}},p_session:sanitizeSession(session)}));
  if(!accepted)throw Error('Another browser is controlling the bridge. Stop it or wait 30 seconds.');
  const s=await bridgeSettings();
  if(s.reconnect&&session?.account&&['disconnected','failed'].includes(session.connection)) {
    const pending=checked(await db().from('bridge_commands').select('request_id').eq('component','whatsapp').eq('method','connect').in('state',['queued','running']).limit(1));
    if(!pending?.length)await bridgeCommand('whatsapp','connect',{}, {},'restore-'+Math.floor(Date.now()/30000));
  }
  return {accepted:true};
}
export async function claimCommand(runner:string,component:Component) {
  const row=checked(await db().rpc('claim_bridge_command',{p_runner:runner,p_component:component}));return row?commandView(row,true):null;
}
export async function reportCommand(runner:string,id:string,result:any) {
  if(!['succeeded','failed','uncertain'].includes(result?.state))throw Error('Invalid executor state');
  const row=checked(await db().from('bridge_commands').select('*').eq('request_id',id).eq('claimed_by',runner).single());
  if(row.state!=='running')return commandView(row); // Result reports may be retried; executions may not.
  let state=result.state;let error=result.error?{message:String(result.error.message||'Execution failed').slice(0,400)}:null;
  if(row.method==='enroll_user'&&state==='succeeded'&&result.result?.verifiedByReadBack!==true){state='uncertain';error={message:'Enrollment was not verified by template readback'};}
  const retained=['connect','disconnect','unlink','status'].includes(row.method)?{connection:result.result?.connection||null}:result.result??null;
  const changed=checked(await db().from('bridge_commands').update({state,result:retained,error,finished_at:new Date().toISOString()}).eq('request_id',id).eq('claimed_by',runner).eq('state','running').select().maybeSingle());
  return commandView(changed||row);
}
