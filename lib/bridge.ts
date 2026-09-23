import 'server-only';

type Component = 'hardware' | 'whatsapp';
type Command = { requestId: string; component?: Component; state: 'queued' | 'running' | 'succeeded' | 'failed' | 'uncertain' | 'cancelled'; result?: any; error?: { message?: string } };

// Application routes talk only to the local backend, never to the raw bridge.
async function request(path: string, body?: unknown) {
  const url = new URL(process.env.LOCAL_BACKEND_URL || 'http://127.0.0.1:14310');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password) throw new Error('Local backend must use loopback HTTP');
  if (!process.env.LOCAL_BACKEND_TOKEN) throw new Error('Local backend is not configured');
  const response = await fetch(new URL(path, url), {
    method: body === undefined ? 'GET' : 'POST', cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.LOCAL_BACKEND_TOKEN}`},
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000),
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || `Local backend HTTP ${response.status}`);
  return data;
}

export async function localBackendStatus() {
  try {return await request('/v1/status');}
  catch {return {hardware:{reachable:false},whatsapp:{reachable:false},k40Configured:false};}
}

export async function hardwareConfiguration() { return request('/v1/hardware/config'); }
export async function saveHardwareConfiguration(value: unknown) { return request('/v1/hardware/config',value); }
export async function testHardwareConnection() {
  const config=await hardwareConfiguration();
  if(!config.configured)throw new Error('Save the K40 IP address first');
  const result: Record<string, unknown>={};
  for(const [key,method] of [['model','get_device_name'],['serialNumber','get_serialnumber']]) {
    const command=await bridgeCommand('hardware',method,{}, {deviceId:config.id},crypto.randomUUID());
    result[key]=(await waitForCommand('hardware',command,25000)).result;
  }
  return result;
}

export async function bridgeCommand(component: Component, method: string, args: Record<string, unknown>, target: Record<string, string>, requestId: string): Promise<Command> {
  return request('/v1/commands', {component, requestId, method, arguments:args, target});
}

export async function bridgeResult(component: Component, requestId: string): Promise<Command> {
  if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(requestId)) throw new Error('Invalid command ID');
  const command=await request(`/v1/commands/${requestId}`);
  if(command.component!==component)throw new Error('Command component mismatch');
  return command;
}

async function waitForCommand(component: Component, command: Command, milliseconds: number) {
  const deadline=Date.now()+milliseconds;
  while(['queued','running'].includes(command.state) && Date.now()<deadline) {
    await new Promise(resolve=>setTimeout(resolve,300));
    command=await bridgeResult(component,command.requestId);
  }
  if(command.state!=='succeeded')throw new Error(command.error?.message || `Command ${command.requestId} is ${command.state}; check its result before retrying`);
  return command;
}

export async function sendBridgeWhatsApp(phone: string, message: string) {
  const command=await request('/v1/whatsapp/messages',{phone,message,requestId:crypto.randomUUID()});
  await waitForCommand('whatsapp',command,20000);
  return {success:true,sid:command.requestId};
}

export type WhatsAppSession = {
  connection: string;
  account: { id: string; name?: string } | null;
  qr: string | null;
  qrExpiresAt: number | null;
  detail?: string | null;
};

export async function whatsAppSession(): Promise<WhatsAppSession> {
  return request('/v1/whatsapp/session');
}

export async function whatsAppAction(action: 'connect' | 'disconnect' | 'unlink', requestId: string) {
  const command=await bridgeCommand('whatsapp',action,{}, {},requestId);
  await waitForCommand('whatsapp',command,6000);
  return whatsAppSession();
}
