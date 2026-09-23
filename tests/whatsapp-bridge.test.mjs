import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createRawBridge } from '../local/bridge.mjs';

test('raw bridge protects state and exposes library commands without tenant ownership', async t => {
  const token='a'.repeat(64); let executions=0;
  const whatsapp={status:{connection:'connected',account:{id:'test-account'}},validate(body){if(!['status','fetchStatus','sendMessage'].includes(body.method))throw Error('Unknown method');},async execute(method){executions++;return method==='status'?this.status:{rawResult:true};}};
  const server=createRawBridge({token,whatsapp,catalogs:()=>({functions:[{name:'fetchStatus'}]}),hardware:async()=>({state:'succeeded',result:[]})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const body={component:'whatsapp',method:'fetchStatus',arguments:{}};
  const post=(value,extra={})=>fetch(base+'/v1/execute',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(value)});
  assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await fetch(base+'/v1/functions?component=whatsapp')).status,403);
  for(const origin of ['https://example.gymatic.co','http://127.0.0.1:3000','https://any-domain.example']) {
    const response=await fetch(base+'/v1/functions?component=whatsapp',{headers:{...headers,Origin:origin}});
    assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');
  }
  assert.equal((await fetch(base+'/v1/functions?component=whatsapp',{headers:{Origin:'https://any-domain.example'}})).status,403);
  assert.equal((await post(body,{Authorization:'Bearer wrong'})).status,403);
  const badHost=await new Promise((resolve,reject)=>{const req=request(base+'/health',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(badHost,403);
  assert.equal((await post({component:'whatsapp',method:'eval',arguments:{}})).status,400);
  assert.equal((await post({...body,target:{accountId:'different-account'}})).status,409);
  assert.equal(executions,0);
  const result=await post(body);
  assert.equal(result.headers.get('access-control-allow-origin'),null);
  assert.deepEqual(await result.json(),{state:'succeeded',result:{rawResult:true}});
  assert.equal(executions,1);
  assert.equal((await fetch(base+'/v2/controller/claim',{method:'POST',headers,body:'{}'})).status,404);
  assert.equal((await fetch(base+'/v1/functions?component=hardware',{headers})).status,200);
});
