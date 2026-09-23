import { join, resolve } from 'node:path';
import { loadRawBridge } from '../local/bridge.mjs';
import { localURL } from '../local/http.mjs';
import { bridgeToken } from '../local/bridge-config.mjs';

// libsignal writes entire session/key objects through console independently of pino.
// This isolated executor reports only our explicit lifecycle messages and API errors.
for(const method of ['log','info','debug','warn','error','dir','trace'])console[method]=()=>{};
const source=process.env.BRIDGE_WHATSAPP_SOURCE || resolve('bridge','whatsapp','src');
const directory=process.env.WHATSAPP_DATA_DIR || join(process.env.LOCALAPPDATA || resolve('.bridge'),'OkashaInstitute','WhatsApp');
const allowedOrigins=(process.env.INSTITUTE_ALLOWED_ORIGINS || '*').split(',').map(s=>s.trim()).filter(Boolean);
const bridge=await loadRawBridge({source,directory,token:bridgeToken(),allowedOrigins});
const url=localURL(process.env.LOCAL_BRIDGE_URL || 'http://127.0.0.1:14320');
bridge.server.on('error',error=>{process.stderr.write(`Raw bridge: ${error.code || 'startup failed'}\n`);process.exit(1);});
bridge.server.listen(Number(url.port),'127.0.0.1',()=>process.stdout.write(`Okasha WhatsApp executor on ${url.origin}\n`));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;bridge.server.close();await bridge.close();bridge.server.closeAllConnections();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
