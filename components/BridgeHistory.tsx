'use client';
import {useEffect,useState} from 'react';
import {cloudRequest} from '@/lib/client-bridge';
export default function BridgeHistory() {
  const [rows,setRows]=useState<any[]>([]);const [error,setError]=useState('');
  useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;async function load(){try{const data=await cloudRequest('/api/bridge/commands');if(!stopped){setRows(data);setError('');}}catch(e){if(!stopped)setError(e instanceof Error?e.message:'Could not load commands');}finally{if(!stopped)timer=setTimeout(load,5000);}}void load();return()=>{stopped=true;clearTimeout(timer);};},[]);
  return <section className="card p-6 space-y-3"><h2 className="font-bold text-white">Recent bridge commands</h2><p className="text-xs text-slate-400">Queued work waits for the operating laptop. Uncertain means the response was lost; verify the device or message before sending another command.</p>{error&&<p role="alert" className="text-red-300">{error}</p>}<div className="space-y-2">{rows.map(row=><div key={row.request_id} className="rounded-lg bg-surface-800 p-3 text-sm"><div className="flex justify-between gap-2"><span>{row.component} · {row.method}</span><strong>{row.state}</strong></div><p className="text-xs text-slate-500 break-all">{row.request_id}</p>{row.error&&<p className="text-amber-300">{row.error.message}</p>}</div>)}{!rows.length&&!error&&<p className="text-sm text-slate-400">No commands yet.</p>}</div></section>;
}
