'use client';
import { useEffect,useState } from 'react';
import { adapterRequest,PAIRING_KEY } from '@/lib/bridge-controller.mjs';
export default function BridgePairing() {
  const [key,setKey]=useState('');const [paired,setPaired]=useState(false);const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{setPaired(!!localStorage.getItem(PAIRING_KEY));const handler=(e:Event)=>setStatus((e as CustomEvent).detail);window.addEventListener('bridge-controller-status',handler);return()=>window.removeEventListener('bridge-controller-status',handler);},[]);
  async function pair() {
    setBusy(true);setStatus('');
    try {
      const token=key.trim();if(!/^[a-f0-9]{64}$/i.test(token))throw Error('Paste the 64-character pairing key from the bridge tray menu');
      await Promise.all(['hardware','whatsapp'].map(c=>adapterRequest(c,token,`/v1/functions?component=${c}`,undefined,5000)));
      localStorage.setItem(PAIRING_KEY,token);setPaired(true);setKey('');setStatus('Paired. Keep this web app open during operating hours.');
    }catch(error){setStatus(error instanceof Error?error.message:'Could not connect. Start the bridge and allow local network access.');}
    finally{setBusy(false);}
  }
  return <section className="card p-6 space-y-3"><h2 className="font-bold text-white">Connect this PC to the bridge</h2><p className="text-sm text-slate-400">Run the bridge on this PC. From its tray menu choose “Copy web app pairing key”, then paste it here. Allow local network access if your browser asks. The key stays in this browser and is never uploaded to Supabase or Vercel.</p>
    <div className="flex flex-wrap gap-2"><input aria-label="Bridge pairing key" type="password" autoComplete="off" className="input flex-1" value={key} onChange={e=>setKey(e.target.value)} placeholder="Paste pairing key"/><button disabled={busy} className="btn-primary" onClick={pair}>{busy?'Connecting…':paired?'Replace pairing':'Connect this PC'}</button>{paired&&<button className="btn-secondary" onClick={()=>{localStorage.removeItem(PAIRING_KEY);setPaired(false);setStatus('This browser stopped accepting new work. Any in-flight command may still finish.');}}>Stop this browser</button>}</div>
    {status&&<p role="status" className="text-sm text-amber-200">{status}</p>}<p className="text-xs text-slate-400">Keep one administrator session open on the operating laptop. Other users can queue work; this PC executes it. Closing the browser pauses processing.</p></section>;
}
