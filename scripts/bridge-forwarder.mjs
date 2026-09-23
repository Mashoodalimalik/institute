import { createHash, randomUUID } from 'node:crypto';
import { localRequest } from '../local/http.mjs';

const secret = process.env.DEVICE_WEBHOOK_SECRET;
if (!process.env.LOCAL_BACKEND_TOKEN || !secret) throw new Error('Configure the local backend and webhook secret before starting the forwarder.');
const bridge = new URL(process.env.LOCAL_BACKEND_URL || 'http://127.0.0.1:14310');
if (bridge.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(bridge.hostname)) throw new Error('Bridge must use loopback HTTP');
const application = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
if (application.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(application.hostname)) throw new Error('Remote webhook requires HTTPS');
let stopping = false;
const delivered = new Set();
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function request(path, body) {
  return localRequest(bridge.origin,process.env.LOCAL_BACKEND_TOKEN,path,body,15000);
}
async function poll() {
  const config=await request('/v1/hardware/config');
  if(!config.configured)throw new Error('Configure the K40 IP address in Settings before collecting attendance');
  const deviceId=config.id;
  const id=randomUUID();
  let command=await request('/v1/commands',{component:'hardware',requestId:id,method:'get_attendance',arguments:{},target:{deviceId}});
  const deadline=Date.now()+45000;
  while(['queued','running'].includes(command.state) && Date.now()<deadline && !stopping) {
    await sleep(1000);
    command=await request(`/v1/commands/${id}`);
  }
  if(command.state!=='succeeded') throw new Error(command.error?.message || `Read command ${id} is ${command.state}`);
  if(!Array.isArray(command.result)) throw new Error('Bridge attendance result must be an array');
  const rows=command.result.slice().sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
  for(const row of rows) {
    if(stopping) break;
    if(!row.user_id || !row.timestamp) continue;
    // pyzk reports the device wall clock without a zone; this institute uses Pakistan time.
    const timestamp=/(Z|[+-]\d{2}:\d{2})$/.test(row.timestamp)?row.timestamp:`${row.timestamp}+05:00`;
    if(!Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid device timestamp');
    const source=createHash('sha256').update(JSON.stringify([deviceId,String(row.user_id),timestamp,row.status,row.punch])).digest('hex');
    if(delivered.has(source)) continue;
    const response=await fetch(new URL('/api/attendance/push',application), { method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_id:String(row.user_id),timestamp,device_id:deviceId,source_event_id:source,secret}),signal:AbortSignal.timeout(30000) });
    if(response.status===404) { console.warn('Unmapped device user; save its ID on the student profile.'); continue; }
    if(!response.ok) throw new Error(`Attendance handoff failed (HTTP ${response.status}); record will be retried`);
    delivered.add(source);
    if(delivered.size>10000) delivered.delete(delivered.values().next().value);
    // Database deduplication remains authoritative across restarts and cache eviction.
  }
}
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
console.log('K40 attendance forwarder started. No device logs will be cleared.');
while(!stopping) {
  try { await poll(); }
  catch(error) { console.error(error instanceof Error?error.message:'Bridge poll failed'); }
  if(!stopping) await sleep(10000);
}
