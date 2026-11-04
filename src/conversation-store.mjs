import { stableJson } from './data.mjs';
export const MEMORY_TTL = 30 * 60 * 1000;
export const EVENT_TTL = 24 * 60 * 60 * 1000;
export const WRITE_TTL = 24 * 60 * 60 * 1000;

export function writePolicy(env = {}) {
  const writeTtlMs = Number(env.WRITE_RECORD_TTL_MS ?? WRITE_TTL);
  const writeLockScope = env.WRITE_LOCK_SCOPE ?? 'user';
  if (!Number.isSafeInteger(writeTtlMs) || writeTtlMs < 1 ||
      !['user', 'action'].includes(writeLockScope)) throw new Error('Invalid write policy');
  return Object.freeze({writeTtlMs, writeLockScope});
}

export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export class ConversationStore {
  constructor(storage, now = Date.now, policy = {}) {
    this.policy=writePolicy({WRITE_RECORD_TTL_MS:policy.writeTtlMs, WRITE_LOCK_SCOPE:policy.writeLockScope});
    this.storage=storage; this.sql=storage.sql; this.now=now;
    this.sql.exec('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, status TEXT NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS event_expiry ON events(expires)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY, summary TEXT NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS writes (id TEXT PRIMARY KEY, outcome TEXT NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS write_expiry ON writes(expires)');
    // Old rows have no action identity: keep their unknown outcomes locked conservatively.
    if(!this.sql.exec('PRAGMA table_info(writes)').toArray().some(column=>column.name==='action_id'))
      this.sql.exec('ALTER TABLE writes ADD COLUMN action_id TEXT');
    this.sql.exec('CREATE TABLE IF NOT EXISTS lookup_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS rates (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS case_binding (id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS member_session (id INTEGER PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS conversation_case (id INTEGER PRIMARY KEY, test_case_id TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS member_attempts (test_case_id TEXT PRIMARY KEY, count INTEGER NOT NULL)');
  }
  clean() {
    for(const table of ['events','memory','writes','rates','lookup_state','member_session']) this.sql.exec(`DELETE FROM ${table} WHERE expires <= ?`,this.now());
  }
  claim(id) {
    this.clean();
    if(this.sql.exec('SELECT id FROM events WHERE id = ?',id).toArray().length) return false;
    this.sql.exec('INSERT INTO events VALUES (?, ?, ?)',id,'processing',this.now()+EVENT_TTL);
    return true;
  }
  mark(id,status) { this.sql.exec('UPDATE events SET status = ? WHERE id = ?',status,id); }
  summary() { return this.sql.exec('SELECT summary FROM memory WHERE id = 1 AND expires > ?',this.now()).toArray()[0]?.summary ?? ''; }
  testCaseId() { return this.sql.exec('SELECT test_case_id FROM conversation_case WHERE id = 1').toArray()[0]?.test_case_id ?? ''; }
  rememberCase(id) {
    if(typeof id!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)) throw new Error('INVALID_TEST_CASE_ID');
    if(this.testCaseId()===id) return false;
    this.sql.exec('DELETE FROM memory');
    this.sql.exec('DELETE FROM lookup_state');
    this.clearMemberSession();
    this.sql.exec('INSERT OR REPLACE INTO conversation_case VALUES (1, ?)',id);
    return true;
  }
  bindCase(fingerprint) {
    if(typeof fingerprint!=='string' || (fingerprint!=='' && !/^[a-f0-9]{64}$/.test(fingerprint))) throw new Error('Invalid case binding');
    const prior=this.sql.exec('SELECT fingerprint FROM case_binding WHERE id = 1').toArray()[0];
    if(prior?.fingerprint===fingerprint) return false;
    this.sql.exec('DELETE FROM memory');
    this.sql.exec('DELETE FROM lookup_state');
    this.sql.exec('INSERT OR REPLACE INTO case_binding VALUES (1, ?)',fingerprint);
    return true;
  }
  remember(summary) {
    if(!summary) {this.sql.exec('DELETE FROM memory');return;}
    this.sql.exec('INSERT OR REPLACE INTO memory VALUES (1, ?, ?)',summary,this.now()+MEMORY_TTL);
  }
  memberSession() {
    const row=this.sql.exec('SELECT data FROM member_session WHERE id = 1 AND expires > ?',this.now()).toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
  allowMemberVerification(testCaseId) {
    const count=this.sql.exec('SELECT count FROM member_attempts WHERE test_case_id = ?',testCaseId).toArray()[0]?.count ?? 0;
    if(count>=3) return false;
    this.sql.exec('INSERT OR REPLACE INTO member_attempts VALUES (?, ?)',testCaseId,count+1);
    return true;
  }
  clearMemberSession() {this.sql.exec('DELETE FROM member_session');this.remember('');this.rememberLookup({});}
  rememberMemberSession(value) {this.sql.exec('INSERT OR REPLACE INTO member_session VALUES (1, ?, ?)',JSON.stringify(value),value.expiresAt);}
  lookup() {
    const row=this.sql.exec('SELECT data FROM lookup_state WHERE id = 1 AND expires > ?',this.now()).toArray()[0];
    return row ? JSON.parse(row.data) : {};
  }
  rememberLookup(state) {
    if(!state || !Object.keys(state).length) {this.sql.exec('DELETE FROM lookup_state');return;}
    this.sql.exec('INSERT OR REPLACE INTO lookup_state VALUES (1, ?, ?)',JSON.stringify(state),this.now()+MEMORY_TTL);
  }
  allow(id,limit,windowMs) {
    const current=this.sql.exec('SELECT count, expires FROM rates WHERE id = ?',id).toArray()[0];
    if(current && current.expires>this.now() && current.count>=limit) return false;
    const expires=current?.expires>this.now() ? current.expires : this.now()+windowMs;
    const count=current?.expires>this.now() ? current.count+1 : 1;
    this.sql.exec('INSERT OR REPLACE INTO rates VALUES (?, ?, ?)',id,count,expires);
    return true;
  }
  journal() {
    return {
      lockScope: this.policy.writeLockScope,
      reserve: async (name,args,idempotencyArgs=args) => {
        const id=await hash(stableJson([name,idempotencyArgs]));
        const legacyId=await hash(stableJson([name,args]));
        const actionId=await hash(name);
        this.clean();
        const unknown=this.policy.writeLockScope==='user'
          ? this.sql.exec("SELECT id FROM writes WHERE outcome = 'unknown' LIMIT 1")
          : this.sql.exec("SELECT id FROM writes WHERE outcome = 'unknown' AND (action_id = ? OR action_id IS NULL) LIMIT 1",actionId);
        if(unknown.toArray().length) return 'locked';
        if(this.sql.exec('SELECT id FROM writes WHERE id = ?',id).toArray().length) return 'duplicate';
        if(legacyId!==id && this.sql.exec('SELECT id FROM writes WHERE id = ?',legacyId).toArray().length) return 'duplicate';
        this.sql.exec('INSERT INTO writes (id, outcome, expires, action_id) VALUES (?, ?, ?, ?)',id,'unknown',this.now()+this.policy.writeTtlMs,actionId);
        // Explicit durability barrier before any external mutation.
        await this.storage.sync();
        return 'reserved';
      },
      settle: async (name,args,outcome,idempotencyArgs=args) => {
        if(!['success','rejected'].includes(outcome)) throw new Error('Invalid outcome');
        const id=await hash(stableJson([name,idempotencyArgs]));
        this.sql.exec('UPDATE writes SET outcome = ? WHERE id = ?',outcome,id);
        await this.storage.sync();
      },
    };
  }
  async requestStatus(name) {
    if(!['request_address_change','request_cash_receipt'].includes(name))throw new Error('Invalid request status action');
    const actionId=await hash(name);
    const rows=this.sql.exec('SELECT outcome, COUNT(*) AS count FROM writes WHERE action_id = ? AND expires > ? GROUP BY outcome',actionId,this.now()).toArray();
    return Object.fromEntries(['success','rejected','unknown'].map(outcome=>[outcome,Number(rows.find(r=>r.outcome===outcome)?.count??0)]));
  }
  async schedule() {
    // Workerd limits compound SELECT terms; query each small expiry index separately.
    const expiries=['memory','events','writes','rates','lookup_state','member_session']
      .map(table=>this.sql.exec(`SELECT MIN(expires) AS expiry FROM ${table}`).toArray()[0]?.expiry)
      .filter(value=>Number.isFinite(value));
    if(expiries.length) await this.storage.setAlarm(Math.max(this.now()+1000,Math.min(...expiries)));
    else await this.storage.deleteAlarm();
  }
}
