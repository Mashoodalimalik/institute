import makeWASocket, { DisconnectReason, makeCacheableSignalKeyStore } from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { transportEncode, transportDecode, validateArguments } from './boundary.mjs';
import catalog from './catalog.json' with { type: 'json' };

const definitions = new Map(catalog.functions.map(f => [f.name, f]));
const own = new Set(['connect', 'disconnect', 'status', 'unlink']);
export class WhatsAppAdapter {
  constructor(store, platform, factory = makeWASocket) {
    this.store = store; this.platform = platform; this.factory = factory; this.socket = null;
    this.epoch = 0; this.timer = null; this.retries = 0; this.tail = Promise.resolve();
    this.status = { connection: 'disconnected', account: store.get?.('account') ?? null, qr: null, qrExpiresAt: null };
  }
  publish(patch) { this.status = { ...this.status, ...patch }; this.platform.emit('status', this.status); }
  async connect() {
    if (this.socket) return this.status;
    clearTimeout(this.timer);
    const epoch = ++this.epoch;
    const auth = this.store.auth();
    const logger = pino({ level: 'silent' });
    this.publish({ connection: 'connecting', qr: null, qrExpiresAt: null, detail: null });
    let socket;
    try { socket = this.factory({ auth: { creds: auth.state.creds, keys: makeCacheableSignalKeyStore(auth.state.keys, logger) }, logger,
      connectTimeoutMs: 20000, defaultQueryTimeoutMs: 30000, qrTimeout: 60000,
      markOnlineOnConnect: false, syncFullHistory: false, shouldSyncHistoryMessage: () => false,
      getMessage: async key => this.store.get(`wire:${key.remoteJid}:${key.id}`)?.message });
    } catch (error) { this.publish({ connection: 'failed', qr: null }); throw error; }
    this.socket = socket;
    socket.ev.process(async events => {
      if (epoch !== this.epoch) return;
      try {
        if (events['creds.update']) auth.save();
        const update = events['connection.update'];
        if (update?.qr) {
          const qr = await QRCode.toDataURL(update.qr, { width: 300 });
          if (epoch !== this.epoch) return;
          this.publish({ connection: 'qr', qr, qrExpiresAt: Date.now() + 55000 });
        }
        if (update?.connection === 'open') {
          this.retries = 0;
          const account = socket.user ? { id: socket.user.id, name: socket.user.name } : null;
          this.store.put('account', account);
          this.publish({ connection: 'connected', qr: null, qrExpiresAt: null, account, detail: null });
        }
        for (const [type, value] of Object.entries(events)) {
          if (['creds.update', 'connection.update'].includes(type)) continue;
          this.platform.emit(type, transportEncode(value));
        }
        if (update?.connection === 'close') {
          // Invalidate this socket immediately: delayed old events must not replace
          // the state of the next connection or schedule a second reconnect.
          ++this.epoch;
          this.socket = null;
          const code = update.lastDisconnect?.error?.output?.statusCode;
          const terminal = [DisconnectReason.loggedOut, DisconnectReason.badSession, DisconnectReason.connectionReplaced, DisconnectReason.forbidden].includes(code);
          if ([DisconnectReason.loggedOut, DisconnectReason.badSession].includes(code)) this.store.clearSession();
          this.publish({ connection: terminal ? 'needs-pairing' : 'reconnecting', qr: null, qrExpiresAt: null });
          if (!terminal) this.timer = setTimeout(() => this.connect().catch(() => this.publish({ connection: 'failed' })), Math.min(30000, 1000 * 2 ** Math.min(this.retries++, 5)));
        }
      } catch { this.publish({ connection: 'degraded', detail: 'Failed to retain protocol state or event; check local storage' }); }
    });
    return this.status;
  }
  async disconnect() {
    ++this.epoch; clearTimeout(this.timer); this.timer = null;
    const socket = this.socket; this.socket = null; socket?.end(undefined);
    this.publish({ connection: 'disconnected', qr: null, qrExpiresAt: null }); return this.status;
  }
  validate(body) {
    if (!body || !/^[a-zA-Z0-9_.-]{1,120}$/.test(body.requestId ?? '')) throw new Error('A stable requestId is required');
    if (Object.keys(body).some(k => !['requestId', 'target', 'method', 'arguments'].includes(k))) throw new Error('Unknown command field');
    if (body.target != null && (typeof body.target !== 'object' || Array.isArray(body.target)
      || Object.keys(body.target).some(key => key !== 'accountId')
      || (body.target.accountId != null && (typeof body.target.accountId !== 'string' || !body.target.accountId || body.target.accountId.length > 200)))) throw new Error('Invalid account target');
    const args = body.arguments ?? {};
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
    if (own.has(body.method)) { if (Object.keys(args).length) throw new Error('This lifecycle operation accepts no arguments'); return; }
    const def = definitions.get(body.method);
    if (!def || def.mode === 'managed') throw new Error(def?.reason ?? 'Unknown function');
    validateArguments(def, args);
    transportDecode(args);
  }
  enqueue(body, origin, generation) {
    this.tail = this.tail.catch(() => {}).then(async () => {
      let started = false;
      try {
        if (!this.platform.start(body.requestId, origin, generation)) return;
        if (body.target?.accountId && (this.status.connection !== 'connected' || this.status.account?.id !== body.target.accountId)) {
          throw new Error('The linked WhatsApp account changed before this operation could start');
        }
        started = true;
        const result = await this.execute(body.method, body.arguments ?? {});
        this.platform.finish(body.requestId, 'succeeded', transportEncode(result));
      } catch (error) { this.platform.finish(body.requestId, started ? 'uncertain' : 'failed', null, { code: error.name, message: String(error.message).slice(0, 400) }); }
    });
  }
  async execute(method, args) {
    if (method === 'connect') return this.connect();
    if (method === 'disconnect') return this.disconnect();
    if (method === 'status') return this.status;
    if (method === 'unlink') {
      const remoteLogout = this.status.connection === 'connected' && !!this.socket;
      if (remoteLogout) await this.socket.logout();
      await this.disconnect();
      this.store.clearSession();
      this.publish({ account: null, detail: null });
      return { unlinked: true, remoteLogout };
    }
    const def = definitions.get(method);
    if (!def || def.mode === 'managed') throw new Error('Function is not remotely callable');
    const socket = this.socket;
    if (!socket) throw new Error('Connect WhatsApp first');
    if (method === 'logout') {
      await socket.logout(); await this.disconnect(); this.store.clearSession(); this.publish({ account: null }); return { unlinked: true };
    }
    const fn = socket[def.name];
    if (typeof fn !== 'function') throw new Error('Function unavailable in this session/library');
    const decoded = transportDecode(args);
    const result = await fn.apply(socket, def.parameters.flatMap(p => p.rest ? (decoded[p.name] ?? []) : [decoded[p.name]]));
    if (method === 'sendMessage' && result?.key?.id) {
      this.store.put(`wire:${result.key.remoteJid}:${result.key.id}`, result);
      this.store.prune('wire:', 500);
    }
    return result;
  }
}
