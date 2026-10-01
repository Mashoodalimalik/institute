// Browser transport only. No tokens are compiled into the application or sent to Vercel.
export const PAIRING_KEY='prism.bridge.pairing';
export async function adapterRequest(component,token,path,body,timeout=130000) {
  const port=component==='hardware'?14318:14320;
  const response=await fetch(`http://127.0.0.1:${port}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||`Bridge HTTP ${response.status}`);error.status=response.status;throw error;}return data;
}
export async function executeClaimed(command,token,request=adapterRequest) {
  try {
    let target=command.target;
    if(command.component==='whatsapp'&&command.method==='sendMessage') {
      const status=await request('whatsapp',token,'/v1/execute',{component:'whatsapp',method:'status',arguments:{},target:{}});
      if(status.state!=='succeeded'||status.result?.connection!=='connected'||!status.result.account?.id)return {state:'failed',error:{message:'Link WhatsApp before sending messages'}};
      if(target.accountId!==status.result.account.id)return {state:'failed',error:{message:'The linked WhatsApp account changed before dispatch'}};
    }
    const result=await request(command.component,token,'/v1/execute',{component:command.component,method:command.method,arguments:command.arguments,target});
    if(!['succeeded','failed','uncertain'].includes(result.state))throw Error('Invalid bridge response');
    return result;
  }catch(error){return {state:[400,403,409,415].includes(error.status)?'failed':'uncertain',error:{message:String(error.message).slice(0,400)}};}
}
