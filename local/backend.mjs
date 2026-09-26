import { randomUUID } from 'node:crypto';
import { jsonServer } from './http.mjs';
import { isIP } from 'node:net';

export class LocalBackend {
  constructor({store, bridge, device, accountPin}) {
    this.store=store; this.bridge=bridge; this.device=store.preference('hardware.device') || device; this.accountPin=accountPin;
    this.tails=new Map(); this.active=new Set();
  }
  configuration() {
    const device=this.device || {};
    return {id:device.id || 'k40-main',address:device.address || '',port:device.port || 4370,forceUdp:Boolean(device.forceUdp),hasCommKey:Boolean(device.commKey),configured:Boolean(device.id && device.address)};
  }
  saveConfiguration(value) {
    if(this.store.hasPending('hardware'))throw Error('Wait for pending device operations before changing the connection');
    if(typeof value.id!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(value.id))throw Error('Use a device ID containing letters, numbers, dots, dashes or underscores');
    if(typeof value.address!=='string'||(value.address && isIP(value.address)!==4))throw Error('Enter a valid IPv4 address or leave it empty until the K40 is available');
    if(!Number.isInteger(value.port)||value.port<1||value.port>65535)throw Error('Port must be between 1 and 65535');
    if(typeof value.forceUdp!=='boolean')throw Error('Invalid UDP setting');
    const commKey=value.commKey===undefined||value.commKey===''?(this.device?.commKey || 0):Number(value.commKey);
    if(!Number.isInteger(commKey)||commKey<0||commKey>2147483647)throw Error('Communication key must be a nonnegative integer');
    this.device={id:value.id,address:value.address,port:value.port,forceUdp:value.forceUdp,commKey,timeout:10};
    this.store.setPreference('hardware.device',this.device);
    return this.configuration();
  }
  async functions(component) {
    if(!['hardware','whatsapp'].includes(component))throw Error('Unknown component');
    return this.bridge(`/v1/functions?component=${component}`);
  }
  async raw(component,method,args={},target={}) {
    return this.bridge('/v1/execute',{component,method,arguments:args,target},130000);
  }
  async session() {
    const command=await this.raw('whatsapp','status');
    if(command.state!=='succeeded')throw Error(command.error?.message || 'Could not read WhatsApp status');
    const status=command.result;
    const valid=status.connection==='qr' && status.qr?.startsWith('data:image/png;base64,') && status.qrExpiresAt>Date.now();
    return {connection:status.connection, account:status.account || null,qr:valid?status.qr:null,qrExpiresAt:valid?status.qrExpiresAt:null,detail:status.detail || null};
  }
  async sendMessage({phone,message,requestId=randomUUID(),self=false}) {
    const session=await this.session();
    const accountId=session.account?.id;
    if(session.connection!=='connected'||!accountId)throw Error('Connect WhatsApp in Settings first');
    if(this.accountPin && this.accountPin!==accountId)throw Error('The connected account does not match the configured account');
    let digits=self?accountId.split('@')[0].split(':')[0]:String(phone || '').replace(/[\s()+-]/g,'');
    if(/^03\d{9}$/.test(digits))digits='92'+digits.slice(1);
    if(!/^[1-9]\d{7,14}$/.test(digits))throw Error('Use an international phone number');
    if(typeof message!=='string'||!message.trim()||message.length>10000)throw Error('A message of 1–10,000 characters is required');
    return this.submit({component:'whatsapp',requestId,method:'sendMessage',arguments:{jid:`${digits}@s.whatsapp.net`,content:{text:message}},target:{accountId}});
  }
  async submit(body) {
    if(!body || !['hardware','whatsapp'].includes(body.component) || !/^[a-zA-Z0-9_.-]{1,120}$/.test(body.requestId || '') || typeof body.method!=='string')throw Error('A valid component, method and request ID are required');
    if(Object.keys(body).some(key=>!['component','requestId','method','arguments','target'].includes(key)))throw Error('Unknown command field');
    if(!body.arguments||typeof body.arguments!=='object'||Array.isArray(body.arguments))throw Error('arguments must be an object');
    if(body.target!=null && (typeof body.target!=='object'||Array.isArray(body.target)))throw Error('Invalid target');
    const target=body.target || {};
    const allowed=body.component==='hardware'?['deviceId','expectedSerial','expiresAt']:['accountId'];
    if(Object.keys(target).some(key=>!allowed.includes(key)))throw Error('Target contains unsupported fields');
    if(body.component==='hardware' && (!this.device?.address || !this.device.id || target.deviceId!==this.device.id)) {
      const error=new Error('K40 is not configured; set its actual device ID and IP when available');error.status=503;throw error;
    }
    const catalog=await this.functions(body.component);
    const definition=catalog.functions.find(fn=>fn.name===body.method);
    if(!definition||definition.mode!=='job')throw Error(definition?.reason || 'Function is not remotely callable');
    for(const key of Object.keys(body.arguments))if(!definition.parameters.some(p=>p.name===key))throw Error(`Unknown argument: ${key}`);
    for(const param of definition.parameters)if(param.required&&!Object.hasOwn(body.arguments,param.name))throw Error(`Missing argument: ${param.name}`);
    const {command,fresh}=this.store.submit(body);
    if(fresh) {
      const previous=this.tails.get(body.component)||Promise.resolve();
      const tail=previous.catch(()=>{}).then(()=>this.run(body));
      this.tails.set(body.component,tail);
    }
    return command;
  }
  async run(body) {
    const {component,method,requestId}=body;
    this.active.add(component);
    let dispatched=false;
    try {
      // Connection preferences belong to the backend, not the raw executor.
      if(component==='whatsapp' && ['disconnect','unlink','logout'].includes(method))this.store.setPreference('whatsapp.reconnect',false);
      const target=component==='hardware'?{device:this.device,expectedSerial:body.target?.expectedSerial,expiresAt:body.target?.expiresAt}:body.target || {};
      if(component==='whatsapp' && target.accountId) {
        const current=await this.session();
        if(current.connection!=='connected'||current.account?.id!==target.accountId)throw Error('Linked account changed before dispatch');
      }
      this.store.finish(requestId,'running');
      dispatched=true;
      const result=await this.raw(component,method,body.arguments,target);
      if(!['succeeded','failed','uncertain'].includes(result.state))throw Error('Invalid executor response');
      if(component==='hardware' && method==='enroll_user' && result.state==='succeeded') {
        if(result.result?.verifiedByReadBack===true) {
          result.result={verifiedByReadBack:true};
        } else if(result.result!==true) {
          result.state='failed'; result.result=null;result.error={message:'The K40 did not complete enrollment'};
        } else {
          const check=await this.raw('hardware','get_user_template',body.arguments,target);
          if(check.state!=='succeeded'||!check.result)throw Error('Enrollment was acknowledged but could not be verified on the device');
          result.result={verifiedByReadBack:true};
        }
      }
      if(component==='whatsapp' && method==='connect' && result.state==='succeeded')this.store.setPreference('whatsapp.reconnect',true);
      // QR codes belong only in the authenticated live session response, never the command journal.
      const retained=component==='whatsapp' && ['connect','disconnect','unlink','status'].includes(method)
        ? {connection:result.result?.connection || null} : result.result;
      this.store.finish(requestId,result.state,retained ?? null,result.error || null);
    } catch(error) {
      // A transport timeout after dispatch can hide a completed send/write. Never retry it automatically.
      this.store.finish(requestId,dispatched && ![400,403,409,415].includes(error.status)?'uncertain':'failed',null,{message:String(error.message).slice(0,400)});
    } finally {this.active.delete(component);}
  }
  async restoreConnection() {
    if(this.active.has('whatsapp') || this.store.preference('whatsapp.reconnect')===false)return;
    try {
      const state=await this.session();
      if(state.account && ['disconnected','failed'].includes(state.connection)) {
        await this.submit({component:'whatsapp',requestId:`restore-${randomUUID()}`,method:'connect',arguments:{},target:{}});
      }
    } catch {/* Offline bridge is reported by the status endpoint; retry only restoring the session. */}
  }
  async close() {await Promise.allSettled([...this.tails.values()]);}
}

export function createLocalBackendServer({token,backend,health,allowedOrigins=['*']}) {
  return jsonServer({token,allowedOrigins,handler:async({method,url,body})=>{
    if(method==='GET' && url.pathname==='/v1/status')return {status:200,body:await health()};
    if(method==='GET' && url.pathname==='/v1/hardware/config')return {status:200,body:backend.configuration()};
    if(method==='POST' && url.pathname==='/v1/hardware/config')return {status:200,body:backend.saveConfiguration(body)};
    if(method==='GET' && url.pathname==='/v1/functions')return {status:200,body:await backend.functions(url.searchParams.get('component'))};
    if(method==='GET' && url.pathname==='/v1/whatsapp/session')return {status:200,body:await backend.session()};
    if(method==='POST' && url.pathname==='/v1/whatsapp/messages')return {status:202,body:await backend.sendMessage(body)};
    if(method==='POST' && url.pathname==='/v1/commands')return {status:202,body:await backend.submit(body)};
    const match=url.pathname.match(/^\/v1\/commands\/([a-zA-Z0-9_.-]{1,120})$/);
    if(method==='GET' && match) {
      const command=backend.store.get(match[1]);
      return {status:command?200:404,body:command || {error:'Command not found'}};
    }
  }});
}
