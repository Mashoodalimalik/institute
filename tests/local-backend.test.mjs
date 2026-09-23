import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandStore } from '../local/command-store.mjs';
import { LocalBackend } from '../local/backend.mjs';

const definitions={functions:[
  ...['connect','disconnect','unlink','status','get_attendance'].map(name=>({name,mode:'job',parameters:[]})),
  {name:'enroll_user',mode:'job',parameters:[{name:'user_id',required:true},{name:'temp_id'}]},
  {name:'sendMessage',mode:'job',parameters:[{name:'jid',required:true},{name:'content',required:true}]},
]};
async function fixture(t,options={}) {
  const directory=await mkdtemp(join(tmpdir(),'institute-backend-test-'));
  const path=join(directory,'commands.db');
  const store=new CommandStore(path);
  const calls=[];
  let session={connection:'connected',account:{id:'923001234567:4@s.whatsapp.net'},qr:null};
  const bridge=async(path,body)=>{
    if(path.startsWith('/v1/functions'))return definitions;
    if(body.method==='status')return {state:'succeeded',result:session};
    calls.push(body);
    if(options.execute)return options.execute(body);
    return {state:'succeeded',result:{accepted:true}};
  };
  const backend=new LocalBackend({store,bridge,...options});
  t.after(async()=>{await backend.close();try{store.close();}catch{}await rm(directory,{recursive:true,force:true});});
  return {backend,store,calls,path,setSession:value=>{session=value;}};
}
test('backend normalizes numbers, targets current account, and executes duplicate submissions once',async t=>{
  const f=await fixture(t);
  await Promise.all([f.backend.sendMessage({phone:'03001234567',message:'test',requestId:'same-id'}),f.backend.sendMessage({phone:'03001234567',message:'test',requestId:'same-id'})]);
  await f.backend.close();
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].arguments.jid,'923001234567@s.whatsapp.net');
  assert.equal(f.calls[0].target.accountId,'923001234567:4@s.whatsapp.net');
  assert.equal(f.store.get('same-id').state,'succeeded');
  await assert.rejects(f.backend.sendMessage({phone:'03001234567',message:'different',requestId:'same-id'}),/different command/);
});
test('post-dispatch failures remain uncertain and are never automatically resent',async t=>{
  const f=await fixture(t,{execute:async()=>{throw Error('Transport timed out');}});
  const body={phone:'03001234567',message:'test',requestId:'uncertain-send'};
  await f.backend.sendMessage(body);await f.backend.close();
  assert.equal(f.store.get(body.requestId).state,'uncertain');
  await f.backend.sendMessage(body);await f.backend.close();
  assert.equal(f.calls.length,1);
});
test('backend refuses absent hardware and supplied device connection overrides',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.backend.submit({component:'hardware',method:'get_attendance',arguments:{},target:{deviceId:'k40'},requestId:'absent'}),/not configured/);
  await assert.rejects(f.backend.submit({component:'hardware',method:'get_attendance',arguments:{},target:{device:{address:'192.168.1.2'}},requestId:'override'}),/unsupported/);
  assert.equal(f.calls.length,0);
});
test('device configuration persists without exposing its communication key',async t=>{
  const f=await fixture(t);
  const saved=f.backend.saveConfiguration({id:'k40-main',address:'192.168.1.20',port:4370,forceUdp:false,commKey:'123'});
  assert.equal(saved.hasCommKey,true);assert.equal(saved.commKey,undefined);
  assert.equal(f.store.preference('hardware.device').commKey,123);
  f.backend.saveConfiguration({...saved,commKey:''});
  assert.equal(f.store.preference('hardware.device').commKey,123);
  assert.throws(()=>f.backend.saveConfiguration({...saved,address:'invalid'}),/IPv4/);
  f.store.submit({requestId:'pending-device',component:'hardware'});
  assert.throws(()=>f.backend.saveConfiguration(saved),/pending/);
});
test('backend owns hardware connection details and verifies enrollment readback',async t=>{
  const f=await fixture(t,{device:{id:'k40',address:'192.168.1.20',port:4370},execute:async body=>({state:'succeeded',result:body.method==='enroll_user'?true:{template:{base64:'AA=='}}})});
  await f.backend.submit({component:'hardware',method:'enroll_user',arguments:{user_id:'101',temp_id:0},target:{deviceId:'k40'},requestId:'enroll'});
  await f.backend.close();
  assert.deepEqual(f.calls.map(c=>c.method),['enroll_user','get_user_template']);
  assert.equal(f.calls[0].target.device.address,'192.168.1.20');
  assert.deepEqual(f.store.get('enroll').result,{verifiedByReadBack:true});
});
test('failed K40 enrollment is not reported successful',async t=>{
  const f=await fixture(t,{device:{id:'k40',address:'192.168.1.20'},execute:async()=>({state:'succeeded',result:false})});
  await f.backend.submit({component:'hardware',method:'enroll_user',arguments:{user_id:'101'},target:{deviceId:'k40'},requestId:'failed-enroll'});await f.backend.close();
  assert.equal(f.store.get('failed-enroll').state,'failed');
});
test('hardware command preserves conditional serial and deadline targeting',async t=>{
  const f=await fixture(t,{device:{id:'k40',address:'192.168.1.20'}});
  const expiresAt=new Date(Date.now()+60000).toISOString();
  await f.backend.submit({component:'hardware',method:'get_attendance',arguments:{},target:{deviceId:'k40',expectedSerial:'K40-123',expiresAt},requestId:'target-fields'});
  await f.backend.close();
  assert.equal(f.calls[0].target.expectedSerial,'K40-123');
  assert.equal(f.calls[0].target.expiresAt,expiresAt);
});
test('QR expiry and reconnect policy belong to backend',async t=>{
  const f=await fixture(t);
  f.setSession({connection:'qr',account:null,qr:'data:image/png;base64,AAA',qrExpiresAt:Date.now()-1});
  assert.equal((await f.backend.session()).qr,null);
  await f.backend.submit({component:'whatsapp',requestId:'stop',method:'disconnect',arguments:{},target:{}});await f.backend.close();
  assert.equal(f.store.preference('whatsapp.reconnect'),false);
  f.setSession({connection:'disconnected',account:{id:'saved'}});
  await f.backend.restoreConnection();
  assert.equal(f.calls.length,1);
  f.store.setPreference('whatsapp.reconnect',true);
  await f.backend.restoreConnection();await f.backend.close();
  assert.equal(f.calls[1].method,'connect');
});
test('restarted backend preserves completed results and marks in-flight jobs uncertain',async t=>{
  const f=await fixture(t);
  const body={component:'whatsapp',requestId:'in-flight',method:'sendMessage',arguments:{},target:{}};
  f.store.submit(body);f.store.finish('in-flight','running');f.store.close();
  const reopened=new CommandStore(f.path);
  assert.equal(reopened.get('in-flight').state,'uncertain');
  assert.equal(reopened.submit(body).fresh,false);
  reopened.close();
});
