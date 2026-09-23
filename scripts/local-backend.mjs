import { join, resolve } from 'node:path';
import { CommandStore } from '../local/command-store.mjs';
import { LocalBackend, createLocalBackendServer } from '../local/backend.mjs';
import { localURL, localRequest } from '../local/http.mjs';
import { bridgeToken } from '../local/bridge-config.mjs';

const directory=join(process.env.LOCALAPPDATA || resolve('.bridge'),'OkashaInstitute','Backend');
const store=new CommandStore(join(directory,'commands.sqlite'));
const bridgeURL=process.env.LOCAL_BRIDGE_URL || 'http://127.0.0.1:14320';
const hardwareURL=process.env.LOCAL_HARDWARE_BRIDGE_URL || 'http://127.0.0.1:14318';
const bridge=(path,body,timeout)=>localRequest(body?.component==='hardware'||path.includes('component=hardware')?hardwareURL:bridgeURL,bridgeToken(),path,body,timeout);
const device={id:process.env.BRIDGE_K40_DEVICE_ID,address:process.env.K40_IP || '',port:Number(process.env.K40_PORT || 4370),commKey:Number(process.env.K40_COMM_KEY || 0),timeout:10,forceUdp:process.env.K40_FORCE_UDP==='true'};
const backend=new LocalBackend({store,bridge,device,accountPin:process.env.BRIDGE_WHATSAPP_ACCOUNT_ID});
const server=createLocalBackendServer({token:process.env.LOCAL_BACKEND_TOKEN,backend,health:async()=>{
  const check=async url=>{try{return {reachable:true,...await localRequest(url,bridgeToken(),'/health',undefined,2000)};}catch{return {reachable:false};}};
  const [hardware,whatsapp]=await Promise.all([check(hardwareURL),check(bridgeURL)]);
  return {hardware,whatsapp,k40Configured:backend.configuration().configured};
}});
const url=localURL(process.env.LOCAL_BACKEND_URL || 'http://127.0.0.1:14310');
server.on('error',error=>{console.error(`Local backend: ${error.code || 'startup failed'}`);process.exit(1);});
server.listen(Number(url.port),'127.0.0.1',()=>{console.log(`Institute local backend on ${url.origin}`);void backend.restoreConnection();});
const timer=setInterval(()=>void backend.restoreConnection(),10000);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);server.close();await backend.close();store.close();server.closeAllConnections();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
