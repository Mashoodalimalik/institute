import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;

export class CommandStore {
  constructor(path) {
    mkdirSync(dirname(path), {recursive:true});
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, component TEXT NOT NULL, state TEXT NOT NULL, result TEXT, error TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    this.db.prepare("UPDATE commands SET state='uncertain', error=?,updated=? WHERE state='running'").run(JSON.stringify({message:'Backend restarted during execution; inspect the device/account before retrying'}), Date.now());
    this.db.prepare("UPDATE commands SET state='cancelled', error=?,updated=? WHERE state='queued'").run(JSON.stringify({message:'Backend restarted before dispatch'}), Date.now());
  }
  get(id) {
    const row = this.db.prepare('SELECT * FROM commands WHERE id=?').get(id);
    return row ? {requestId:row.id, component:row.component,state:row.state,result:row.result ? JSON.parse(row.result) : null,error:row.error ? JSON.parse(row.error) : null,createdAt:row.created,updatedAt:row.updated} : null;
  }
  submit(body) {
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
    const existing = this.db.prepare('SELECT fingerprint FROM commands WHERE id=?').get(body.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) { const e=new Error('Request ID was already used for a different command'); e.status=409; throw e; }
      return {command:this.get(body.requestId),fresh:false};
    }
    const active = this.db.prepare("SELECT count(*) AS count FROM commands WHERE state IN ('queued','running')").get().count;
    if (active >= 64) { const e=new Error('Local command queue is full'); e.status=429; throw e; }
    // Keep idempotency fingerprints; discard old result bodies (which may contain personal data).
    this.db.prepare("UPDATE commands SET result=NULL WHERE updated < ? AND result IS NOT NULL").run(Date.now()-30*86400000);
    const time = Date.now();
    this.db.prepare("INSERT INTO commands VALUES(?,?,?,'queued',NULL,NULL,?,?)").run(body.requestId,fingerprint,body.component,time,time);
    return {command:this.get(body.requestId),fresh:true};
  }
  finish(id,state,result=null,error=null) {
    this.db.prepare('UPDATE commands SET state=?,result=?,error=?,updated=? WHERE id=?').run(state,result===null?null:JSON.stringify(result),error===null?null:JSON.stringify(error),Date.now(),id);
  }
  preference(key) { const row=this.db.prepare('SELECT value FROM preferences WHERE key=?').get(key); return row ? JSON.parse(row.value) : undefined; }
  hasPending(component) { return this.db.prepare("SELECT count(*) AS count FROM commands WHERE component=? AND state IN ('queued','running')").get(component).count>0; }
  setPreference(key,value) { this.db.prepare('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value)); }
  close() { this.db.close(); }
}
