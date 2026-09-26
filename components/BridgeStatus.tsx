'use client';
import { useEffect, useState } from 'react';
import { Download, Fingerprint, Loader2, RefreshCw, Cpu } from 'lucide-react';
import { fetchBridgeStatus, getBridgeCredentials, ClientBridgeStatus } from '@/lib/client-bridge';

type Config = {id:string;address:string;port:number;forceUdp:boolean;hasCommKey:boolean;configured:boolean};

export default function BridgeStatus() {
  const [health,setHealth]=useState<ClientBridgeStatus>();
  const [config,setConfig]=useState<Config>();
  const [commKey,setCommKey]=useState('');
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [identity,setIdentity]=useState<{model?:string;serialNumber?:string}>();

  async function refresh() {
    setError('');
    try {
      const status = await fetchBridgeStatus();
      setHealth(status);

      // Try on-device config first if bridge detected
      let settings: any = null;
      if (status.onDevice) {
        try {
          const creds = await getBridgeCredentials();
          const r = await fetch(`${creds.backendUrl}/v1/hardware/config`, {
            headers: { 'Authorization': `Bearer ${creds.backendToken}` },
          });
          if (r.ok) settings = await r.json();
        } catch {}
      }

      if (!settings) {
        const r = await fetch('/api/hardware/config', { cache: 'no-store' });
        if (r.ok) settings = await r.json();
      }

      if (settings) setConfig(settings);
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Local services unavailable');
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function action(kind:'save'|'test') {
    setBusy(kind);setError('');setNotice('');setIdentity(undefined);
    try {
      const response=await fetch('/api/hardware/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind,config:config?{id:config.id,address:config.address.trim(),port:config.port,forceUdp:config.forceUdp,commKey}:undefined})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Device operation failed');
      if(kind==='save'){setConfig(data);setCommKey('');setNotice('Device settings saved. Test the connection when the K40 is available.');}
      else {setIdentity(data);setNotice('K40 responded successfully.');}
    }catch(e){setError(e instanceof Error?e.message:'Device operation failed');}
    finally{setBusy('');}
  }

  return <section className="card p-6 space-y-4" aria-labelledby="hardware-heading">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 id="hardware-heading" className="font-bold text-white flex items-center gap-2"><Fingerprint size={20} className="text-violet-400"/> K40 & Local Bridge</h2>
        {health?.onDevice && (
          <span className="text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2.5 py-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            On-Device Mode
          </span>
        )}
      </div>
      <button disabled={!!busy} onClick={refresh} className="btn-secondary text-xs"><RefreshCw size={13}/>Refresh</button>
    </div>
    <div className="rounded-xl bg-surface-800 p-3 text-sm text-slate-300 space-y-1">
      <p>Hardware adapter: <span className={health?.hardware.reachable?'text-emerald-300':'text-amber-300'}>{health?.hardware.reachable?'Running':'Unavailable'}</span>{health?.hardware.version?` · v${health.hardware.version}`:''}</p>
      <p>WhatsApp adapter: <span className={health?.whatsapp.reachable?'text-emerald-300':'text-amber-300'}>{health?.whatsapp.reachable?'Running':'Unavailable'}</span></p>
      <p className="text-xs text-slate-400">
        {health?.onDevice
          ? 'Connected to local bridge running on this PC. WhatsApp & Biometric operations execute directly on-device.'
          : 'Install Okasha Bridge on this computer and keep its tray icon running. Link WhatsApp in the panel above.'}
      </p>
    </div>
    <a className="btn-secondary inline-flex text-sm" href="/downloads/OkashaBridgeSetup-0.1.0.exe" download><Download size={16}/>Download Okasha Bridge for Windows</a>
    {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
    {notice&&<p role="status" className="text-sm text-emerald-300">{notice}</p>}
    {config&&<>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm text-slate-300">Device ID<input className="input mt-1" value={config.id} onChange={e=>setConfig({...config,id:e.target.value})}/></label>
        <label className="text-sm text-slate-300">K40 IP address<input className="input mt-1" placeholder="Leave empty until device is available" value={config.address} onChange={e=>setConfig({...config,address:e.target.value})}/></label>
        <label className="text-sm text-slate-300">Port<input className="input mt-1" type="number" min={1} max={65535} value={config.port} onChange={e=>setConfig({...config,port:Number(e.target.value)})}/></label>
        <label className="text-sm text-slate-300">Communication key<input className="input mt-1" type="password" inputMode="numeric" autoComplete="off" placeholder={config.hasCommKey?'Saved — leave blank to keep':'Default: 0'} value={commKey} onChange={e=>setCommKey(e.target.value)}/></label>
      </div>
      <label className="text-sm text-slate-300 flex gap-2 items-center"><input type="checkbox" checked={config.forceUdp} onChange={e=>setConfig({...config,forceUdp:e.target.checked})}/>Use UDP instead of automatic TCP</label>
      <div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={()=>action('save')} className="btn-primary">{busy==='save'&&<Loader2 size={16} className="animate-spin"/>}Save device settings</button><button disabled={!!busy||!config.configured||!health?.hardware.reachable} onClick={()=>action('test')} className="btn-secondary">{busy==='test'&&<Loader2 size={16} className="animate-spin"/>}Test saved connection</button></div>
      {!config.configured&&<p className="text-xs text-slate-400">K40 is not configured. Saving a student does not require a connected device.</p>}
    </>}
    {identity&&<div className="text-sm text-slate-300"><p>Model: {identity.model||'Not reported'}</p><p>Serial: {identity.serialNumber||'Not reported'}</p></div>}
  </section>;
}
