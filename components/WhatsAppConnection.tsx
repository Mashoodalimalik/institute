'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import type { WhatsAppSession } from '@/lib/bridge';

const labels: Record<string, string> = {
  disconnected: 'Disconnected', connecting: 'Connecting…', qr: 'Ready to scan',
  connected: 'Connected', reconnecting: 'Reconnecting…', 'needs-pairing': 'Link required',
  failed: 'Connection failed', degraded: 'Connection needs attention',
};

export default function WhatsAppConnection() {
  const [session, setSession] = useState<WhatsAppSession>();
  const [serviceError, setServiceError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch('/api/whatsapp/session', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not check WhatsApp');
        if (!controller.signal.aborted) { setSession(data); setServiceError(''); }
      } catch (error) {
        if (!controller.signal.aborted) {
          setSession(undefined); // Never leave a stale QR or Connected badge on screen.
          setServiceError(error instanceof Error ? error.message : 'WhatsApp service unavailable');
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [busy, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function act(action: 'connect' | 'disconnect' | 'unlink' | 'refresh') {
    setBusy(true); setActionError(''); setConfirmUnlink(false);
    try {
      for (const step of action === 'refresh' ? ['disconnect', 'connect'] : [action]) {
        const response = await fetch('/api/whatsapp/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: step, requestId: crypto.randomUUID() }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not update WhatsApp');
        setSession(data); setServiceError('');
      }
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not update WhatsApp'); }
    finally { setBusy(false); }
  }

  const connected = session?.connection === 'connected';
  const pairing = ['qr', 'connecting', 'reconnecting'].includes(session?.connection || '');
  const seconds = Math.max(0, Math.ceil(((session?.qrExpiresAt || 0) - now) / 1000));
  const phone = session?.account?.id?.split('@')[0].split(':')[0];
  return <section className="card p-6 space-y-4" aria-labelledby="whatsapp-heading">
    <div className="flex items-center justify-between gap-3">
      <h2 id="whatsapp-heading" className="font-bold text-white flex items-center gap-2"><MessageCircle size={20} className="text-emerald-400" /> WhatsApp</h2>
      <span role="status" className={`text-xs rounded-full px-3 py-1 ${connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/50 text-slate-300'}`}>
        {serviceError ? 'Service unavailable' : session ? labels[session.connection] || 'Checking connection' : 'Checking…'}
      </span>
    </div>
    <p className="text-sm text-slate-400">Link the institute’s WhatsApp account for fee reminders, receipts and attendance alerts.</p>
    {serviceError && <div role="alert" className="text-sm text-amber-300 space-y-2"><p>{serviceError}</p><button className="btn-secondary text-xs" onClick={() => setRefresh(value => value + 1)}>Retry connection</button></div>}
    {actionError && <p role="alert" className="text-sm text-red-400">{actionError}</p>}
    {session?.detail && <p role="alert" className="text-sm text-amber-300">{session.detail}</p>}
    {session?.account && <div className="rounded-xl bg-surface-800 p-3">
      <p className="font-medium text-white">{session.account.name || 'Institute account'}</p>
      {phone && <p className="text-sm text-slate-400">+{phone}</p>}
      {!connected && <p className="text-xs text-slate-500 mt-1">Previously linked account. Reconnect to send notifications.</p>}
    </div>}
    {session?.connection === 'qr' && <div className="space-y-3">
      <ol className="list-decimal pl-5 text-sm text-slate-300 space-y-1">
        <li>Open WhatsApp on the institute phone.</li>
        <li>Open Settings or the menu, then <strong>Linked devices</strong>.</li>
        <li>Tap <strong>Link a device</strong> and scan this QR code.</li>
      </ol>
      {session.qr && seconds > 0 ? <div className="flex flex-col items-center gap-2">
        <img src={session.qr} alt="Scan this QR code in WhatsApp to link the institute account" width={300} height={300} className="rounded-xl bg-white p-2 max-w-full" />
        <p className="text-xs text-slate-400">Refreshes automatically · expires in {seconds}s</p>
      </div> : <p className="text-sm text-slate-400">This QR code expired. Waiting for a fresh code…</p>}
    </div>}
    {pairing && session?.connection !== 'qr' && <p className="text-sm text-slate-300 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Connecting to WhatsApp. The QR code will appear here if pairing is needed.</p>}
    {connected && <p className="text-sm text-emerald-300">Account linked. WhatsApp notifications use this account when enabled below.</p>}
    {session && <div className="flex flex-wrap items-center gap-2">
      {!connected && !pairing && <button disabled={busy} onClick={() => act('connect')} className="btn-primary">{busy && <Loader2 size={16} className="animate-spin" />}{session.account ? 'Reconnect WhatsApp' : 'Link WhatsApp'}</button>}
      {(connected || pairing) && <button disabled={busy} onClick={() => act('disconnect')} className="btn-secondary">{busy ? 'Please wait…' : connected ? 'Disconnect' : 'Cancel pairing'}</button>}
      {session.connection === 'qr' && <button disabled={busy} onClick={() => act('refresh')} className="btn-secondary"><RefreshCw size={14} /> New QR code</button>}
      {session.account && <button disabled={busy} onClick={() => setConfirmUnlink(true)} className="btn-secondary text-red-300">Unlink account</button>}
    </div>}
    {confirmUnlink && <div role="alertdialog" aria-label="Unlink WhatsApp account" className="rounded-xl border border-red-400/30 p-4 space-y-3">
      <p className="text-sm text-slate-300">Remove this saved WhatsApp session? You’ll need to scan a QR code to link an account again. If disconnected, also remove this linked device in WhatsApp on your phone.</p>
      <div className="flex gap-2"><button className="btn-secondary text-red-300" disabled={busy} onClick={() => act('unlink')}>Yes, unlink account</button><button className="btn-secondary" onClick={() => setConfirmUnlink(false)}>Keep account</button></div>
    </div>}
  </section>;
}
