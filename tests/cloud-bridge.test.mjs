import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeClaimed} from '../lib/bridge-controller.mjs';
import {normalizePhone,deviceConfiguration,sanitizeSession} from '../lib/bridge-validation.mjs';
const command={component:'whatsapp',method:'sendMessage',arguments:{jid:'923001234567@s.whatsapp.net',content:{text:'test'}},target:{accountId:'account-a'}};
test('transport loss never retries a send or reports success',async()=>{
  let sends=0;const request=async(c,t,p,b)=>{if(b.method==='status')return {state:'succeeded',result:{connection:'connected',account:{id:'account-a'}}};sends++;throw Error('response lost');};
  const result=await executeClaimed(command,'token',request);assert.equal(result.state,'uncertain');assert.equal(sends,1);
});
test('changed WhatsApp account prevents dispatch',async()=>{
  let calls=0;const result=await executeClaimed(command,'token',async()=>{calls++;return {state:'succeeded',result:{connection:'connected',account:{id:'account-b'}}};});assert.equal(result.state,'failed');assert.equal(calls,1);
});
test('raw uncertain and failed results stay unsuccessful',async()=>{
  for(const state of ['uncertain','failed'])assert.equal((await executeClaimed({component:'hardware',method:'enroll_user',arguments:{},target:{}},'token',async()=>({state}))).state,state);
});
test('HTTP rejection before execution is failed, not delivered',async()=>{
  const result=await executeClaimed({component:'hardware',method:'get_users'},'token',async()=>{throw Object.assign(Error('unauthorized'),{status:403});});assert.equal(result.state,'failed');
});
test('cloud device settings validate addresses and preserve an unchanged key',()=>{
  const config={id:'k40',address:'192.168.1.20',port:4370,forceUdp:false,commKey:''};assert.equal(deviceConfiguration(config,{commKey:123}).commKey,123);assert.throws(()=>deviceConfiguration({...config,address:'300.1.1.1'}));assert.throws(()=>deviceConfiguration({...config,port:0}));
});
test('expired QR and credentials are not exposed by session summaries',()=>{
  const data=sanitizeSession({connection:'qr',qr:'data:image/png;base64,AA==',qrExpiresAt:1,creds:'secret',account:{id:'account-a',secret:'hidden'}},2);assert.equal(data.qr,null);assert.equal(data.creds,undefined);assert.equal(data.account.secret,undefined);
});
test('Pakistan local phone is normalized and malformed phone rejected',()=>{assert.equal(normalizePhone('0300 1234567'),'923001234567');assert.throws(()=>normalizePhone('abc'));});
