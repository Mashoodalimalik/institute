'use client';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { cloudRequest } from '@/lib/client-bridge';
import { adapterRequest,executeClaimed,PAIRING_KEY } from '@/lib/bridge-controller.mjs';

export default function BridgeController() {
  const {session}=useAuth();
  useEffect(()=>{
    if(session?.role!=='super_admin'||session.status!=='approved')return;
    let stopped=false;let timer:ReturnType<typeof setTimeout>;let busy=false;let syncing=false;
    const running=new Set<string>();const reports=new Map<string,any>();const runner=crypto.randomUUID();
    const dispatch=(detail:string)=>window.dispatchEvent(new CustomEvent('bridge-controller-status',{detail}));
    async function report(id:string,result:any) {
      reports.set(id,result);
      await cloudRequest('/api/bridge/controller',{action:'report',runner,requestId:id,result});
      reports.delete(id);
    }
    async function work(component:'hardware'|'whatsapp',token:string) {
      if(running.has(component))return;running.add(component);
      try {
        const {command}=await cloudRequest('/api/bridge/controller',{action:'claim',runner,component});
        if(!command)return;
        // Claim is durable before local dispatch. Never execute it again after a lost response.
        if(stopped){await report(command.requestId,{state:'failed',error:{message:'Controller stopped before dispatch'}});return;}
        await report(command.requestId,await executeClaimed(command,token));
      }catch(error){dispatch(error instanceof Error?error.message:'Command reporting failed');}
      finally{running.delete(component);}
    }
    async function tick() {
      if(stopped||busy)return;busy=true;
      try {
        const token=localStorage.getItem(PAIRING_KEY);if(!token)return;
        if(!navigator.locks)throw Error('Use a browser with Web Locks support to control the bridge');
        await navigator.locks.request('prism-bridge-controller',{ifAvailable:true},async lock=>{
          if(!lock)return;
          const check=async(component:'hardware'|'whatsapp')=>{try{return {reachable:true,...await adapterRequest(component,token,'/health',undefined,2000)};}catch{return {reachable:false};}};
          const [hardware,whatsapp]=await Promise.all([check('hardware'),check('whatsapp')]);
          if(!hardware.reachable&&!whatsapp.reachable)throw Error('Bridge unavailable. Start the tray app and allow this site’s local network access.');
          let state:any={connection:'disconnected',account:null};
          if(whatsapp.reachable){const response=await adapterRequest('whatsapp',token,'/v1/execute',{component:'whatsapp',method:'status',arguments:{},target:{}},5000);if(response.state==='succeeded')state=response.result;}
          await cloudRequest('/api/bridge/controller',{action:'heartbeat',runner,health:{hardware,whatsapp},session:state});
          for(const [id,result] of reports)await report(id,result);
          if(stopped)return;
          dispatch('Connected. This browser is processing bridge commands.');
          if(hardware.reachable)void work('hardware',token);
          if(whatsapp.reachable)void work('whatsapp',token);
          if(hardware.reachable&&!syncing){syncing=true;void cloudRequest('/api/bridge/attendance',{runner}).catch(error=>dispatch(error.message)).finally(()=>{syncing=false;});}
        });
      }catch(error){dispatch(error instanceof Error?error.message:'Bridge unavailable');}
      finally{busy=false;if(!stopped)timer=setTimeout(tick,3000);}
    }
    void tick();
    return ()=>{stopped=true;clearTimeout(timer);};
  },[session?.userId,session?.role,session?.status]);
  return null;
}
