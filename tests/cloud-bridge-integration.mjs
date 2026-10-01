import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(url!=='https://hqvuajcnfylwxgdzypgd.supabase.co')throw Error('Restricted to the institute development database');
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const base=process.env.TEST_APP_URL||'http://localhost:3001';const origin=new URL(base).origin;
const runner=randomUUID(), prefix='cloud-test-'+randomUUID();let user;let snapshot;let count=0;
const ok=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const check=(truth,label)=>{assert.ok(truth,label);count++;console.log('PASS '+label);};
let cookie='';
async function api(path,body,authenticated=true,withOrigin=true){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(authenticated?{cookie}:{}),...(withOrigin?{Origin:origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
const ctl=body=>api('/api/bridge/controller',{runner,...body});
try {
  snapshot=ok(await db.from('bridge_settings').select('*').eq('id',true).single());
  if(Date.now()-Date.parse(snapshot.controller_seen_at||'')<30000)throw Error('An operating controller is active; do not interrupt it for tests');
  const email=`${prefix}@example.com`,password=randomBytes(24).toString('hex');
  user=ok(await db.auth.admin.createUser({email,password,email_confirm:true})).user;
  ok(await db.from('profiles').update({role:'super_admin',status:'approved'}).eq('auth_user_id',user.id));
  const jar=new Map();const auth=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(v=>jar.set(v.name,v.value))}});
  ok(await auth.auth.signInWithPassword({email,password}));cookie=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
  check((await api('/api/hardware/config',undefined,false)).status===401,'anonymous device settings blocked');
  check((await api('/api/bridge/controller',{action:'heartbeat',runner},true,false)).status===403,'cross-origin controller write blocked');
  const health={hardware:{reachable:true,version:'test'},whatsapp:{reachable:true}};
  const session={connection:'connected',account:{id:'test-account@s.whatsapp.net',name:'Isolated test'}};
  check((await ctl({action:'heartbeat',health,session})).status===200,'cloud heartbeat works without local backend');
  check((await api('/api/bridge/status')).data.controllerOnline,'cloud status reflects controller heartbeat');
  const other=await api('/api/bridge/controller',{action:'heartbeat',runner:randomUUID(),health,session});check(other.status===400,'second browser cannot take active controller');
  const bad=await api('/api/hardware/config',{action:'save',config:{id:'k40',address:'300.1.1.1',port:4370,forceUdp:false}});check(bad.status>=400,'invalid device IP rejected');
  const config={id:'test-k40',address:'192.0.2.1',port:4370,forceUdp:false,commKey:'123'};
  check((await api('/api/hardware/config',{action:'save',config})).status===200,'device configuration saved in Supabase');
  const saved=(await api('/api/hardware/config')).data;check(saved.hasCommKey&&!Object.hasOwn(saved,'commKey'),'device key not returned to settings');
  // Fake command records only: no adapter calls are made by these tests.
  const id=prefix+'-send';
  const message={phone:'03001234567',custom_message:'Isolated queue test; never dispatched',requestId:id};
  const first=await api('/api/notifications/send-whatsapp',message);check(first.status===202&&first.data.queued&&!first.data.success,'queued message is not reported delivered');
  const second=await api('/api/notifications/send-whatsapp',message);check(second.data.sid===id,'repeated submission keeps original command');
  const stored=ok(await db.from('bridge_commands').select('*').eq('request_id',id).single());check(stored.arguments.jid==='923001234567@s.whatsapp.net'&&stored.target.accountId===session.account.id,'web app prepares phone and account target');
  const claims=await Promise.all([ctl({action:'claim',component:'whatsapp'}),ctl({action:'claim',component:'whatsapp'})]);check(claims.filter(x=>x.data.command?.requestId===id).length===1,'concurrent claims dispatch once');
  check((await api('/api/bridge/controller',{action:'report',runner:randomUUID(),requestId:id,result:{state:'succeeded'}})).status===400,'wrong controller cannot report completion');
  const report={action:'report',requestId:id,result:{state:'uncertain',error:{message:'Simulated response loss'}}};
  check((await ctl(report)).data.state==='uncertain','uncertain outcome retained');
  check((await ctl(report)).data.state==='uncertain','result reporting retry is idempotent');
  check(!(await ctl({action:'claim',component:'whatsapp'})).data.command,'uncertain send is never reclaimed');
  const expired=prefix+'-expired';ok(await db.from('bridge_commands').insert({request_id:expired,component:'hardware',method:'get_users',expires_at:new Date(Date.now()-1000).toISOString()}));
  await ctl({action:'claim',component:'hardware'});check(ok(await db.from('bridge_commands').select('state').eq('request_id',expired).single()).state==='cancelled','expired queued command cancelled before execution');
  const lost=prefix+'-lost';ok(await db.from('bridge_commands').insert({request_id:lost,component:'hardware',method:'enroll_user',state:'running',claimed_by:runner,started_at:new Date(Date.now()-190000).toISOString()}));
  await ctl({action:'claim',component:'hardware'});check(ok(await db.from('bridge_commands').select('state').eq('request_id',lost).single()).state==='uncertain','abandoned running command is uncertain, never retried');
  const anon=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);check(!!(await anon.from('bridge_settings').select('*')).error,'anonymous Supabase client cannot read bridge settings');
  check(!!(await auth.from('bridge_commands').select('*')).error,'browser database role cannot bypass command API');
  console.log(`${count} cloud integration assertions passed; no hardware or WhatsApp commands executed.`);
}finally {
  if(user){ok(await db.from('bridge_commands').delete().like('request_id',prefix+'%'));if(snapshot)ok(await db.from('bridge_settings').update(snapshot).eq('id',true).eq('controller_id',runner));ok(await db.from('profiles').delete().eq('auth_user_id',user.id));ok(await db.auth.admin.deleteUser(user.id));}
}
