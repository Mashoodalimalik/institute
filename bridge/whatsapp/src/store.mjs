import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { BufferJSON, initAuthCreds, proto } from 'baileys';
import { protectedKey } from './protected-key.mjs';

export class Store {
  constructor(directory, keyProvider = protectedKey) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const keyPath = join(directory, 'storage.dpapi');
    this.key = keyProvider(keyPath);
    if (this.key.length !== 32) throw new Error('Invalid local storage key');
    this.db = new DatabaseSync(join(directory, 'session.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, value BLOB NOT NULL, updated_at INTEGER NOT NULL)');
  }
  encode(value) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value, BufferJSON.replacer)), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), bytes]);
  }
  decode(value) {
    const data = Buffer.from(value);
    const cipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(), BufferJSON.reviver);
  }
  get(id) { const row = this.db.prepare('SELECT value FROM records WHERE id=?').get(id); return row ? this.decode(row.value) : null; }
  put(id, value) { this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(id, this.encode(value), Date.now()); }
  remove(id) { this.db.prepare('DELETE FROM records WHERE id=?').run(id); }
  recent(prefix, limit = 100) { return this.db.prepare('SELECT value FROM records WHERE id LIKE ? ORDER BY updated_at DESC LIMIT ?').all(prefix + '%', limit).map(row => this.decode(row.value)); }
  prune(prefix, keep) { this.db.prepare('DELETE FROM records WHERE id LIKE ? AND id NOT IN (SELECT id FROM records WHERE id LIKE ? ORDER BY updated_at DESC LIMIT ?)').run(prefix + '%', prefix + '%', keep); }
  clearSession() { this.db.exec('DELETE FROM records'); }
  close() { this.db.close(); }
  auth() {
    const creds = this.get('auth:creds') ?? initAuthCreds();
    return {
      state: {
        creds,
        keys: {
          get: async (type, ids) => Object.fromEntries(ids.map(id => {
            let value = this.get(`auth:${type}:${id}`);
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            return [id, value];
          })),
          set: async data => {
            this.db.exec('BEGIN IMMEDIATE');
            try {
              for (const [type, items] of Object.entries(data)) for (const [id, value] of Object.entries(items)) {
                if (value == null) this.remove(`auth:${type}:${id}`); else this.put(`auth:${type}:${id}`, value);
              }
              this.db.exec('COMMIT');
            } catch (error) { this.db.exec('ROLLBACK'); throw error; }
          },
        },
      },
      save: () => this.put('auth:creds', creds),
    };
  }
}
