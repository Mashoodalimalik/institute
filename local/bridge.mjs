import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { jsonServer } from './http.mjs';

export function pythonCall(python, command) {
  return new Promise((resolve,reject) => {
    const child=spawn(python,[fileURLToPath(new URL('./pyzk_executor.py',import.meta.url))], {stdio:['pipe','pipe','pipe'],windowsHide:true});
    const chunks=[]; let size=0; let failure;
    const timer=setTimeout(()=>{failure=new Error('pyzk operation timed out; its outcome may be uncertain');child.kill();},120000);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024){failure=new Error('pyzk response exceeds 16 MiB');child.kill();}else chunks.push(chunk);});
    // pyzk may print debugging output; the worker redirects it to stderr. Do not log biometric data.
    child.stderr.resume();
    child.stdin.on('error',()=>{});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{
      clearTimeout(timer);
      if(failure)return reject(failure);
      try {const data=JSON.parse(Buffer.concat(chunks).toString()); if(code!==0 && !data.error)throw Error('pyzk worker failed'); resolve(data);}
      catch {reject(new Error('pyzk worker failed; check the Python/pyzk installation'));}
    });
    child.stdin.end(JSON.stringify(command));
  });
}

export function createRawBridge({token, whatsapp, catalogs, hardware, encode=value=>value, allowedOrigins=['*']}) {
  const busy=new Set();
  return jsonServer({token,allowedOrigins,health:{component:'whatsapp',version:'0.1.0',domainPolicy:allowedOrigins.includes('*')?'any':'allowlist'},handler:async({method,url,body})=>{
    const component=url.searchParams.get('component');
    if(method==='GET' && url.pathname==='/v1/functions') {
      if(!['hardware','whatsapp'].includes(component))throw Error('Unknown component');
      return {status:200,body:await catalogs(component)};
    }
    if(method!=='POST'||url.pathname!=='/v1/execute')return;
    if(!['hardware','whatsapp'].includes(body.component))throw Error('Unknown component');
    if(typeof body.method!=='string'||!body.arguments||typeof body.arguments!=='object'||Array.isArray(body.arguments))throw Error('A method and arguments object are required');
    const readingStatus=body.component==='whatsapp' && body.method==='status';
    if(busy.has(body.component)&&!readingStatus)return {status:409,body:{error:'Executor busy; command was not started'}};
    if(body.component==='whatsapp') {
      whatsapp.validate({requestId:'raw-execution',method:body.method,arguments:body.arguments,target:body.target});
      if(body.target?.accountId && (whatsapp.status.connection!=='connected'||whatsapp.status.account?.id!==body.target.accountId))return {status:409,body:{error:'Target account changed; command was not started'}};
    }
    if(!readingStatus)busy.add(body.component);
    try {
      if(body.component==='hardware')return {status:200,body:await hardware(body)};
      return {status:200,body:{state:'succeeded',result:encode(await whatsapp.execute(body.method,body.arguments))}};
    } catch(error) {return {status:200,body:{state:'uncertain',error:{message:String(error.message).slice(0,400)}}};}
    finally {if(!readingStatus)busy.delete(body.component);}
  }});
}

export async function loadRawBridge({source, directory, token, allowedOrigins=['*']}) {
  const [{Store},{WhatsAppAdapter},{transportEncode}] = await Promise.all(['store.mjs','service.mjs','boundary.mjs'].map(file=>import(pathToFileURL(join(source,file)).href)));
  const store=new Store(join(directory,'session'));
  // The adapter retains only protocol credentials/state. No tenant registry, command journal,
  // device configuration, notification templates, reconnect preference or school database here.
  const whatsapp=new WhatsAppAdapter(store,{emit(){}});
  const catalog=JSON.parse(await readFile(join(source,'catalog.json'),'utf8'));
  catalog.functions.push(...['connect','disconnect','status','unlink'].map(name=>({name,mode:'job',parameters:[]})));
  const server=createRawBridge({token,whatsapp,encode:transportEncode,allowedOrigins,
    catalogs:component=>{if(component!=='whatsapp')throw Error('Use the hardware executable for pyzk functions');return catalog;},
    hardware:async()=>{throw Error('Use the hardware executable for pyzk commands');},
  });
  return {server,async close(){await whatsapp.disconnect();store.close();}};
}
