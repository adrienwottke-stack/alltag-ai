import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';

export const DAY = 86_400_000;
export const CATEGORIES = ['reply', 'letter', 'write', 'ask'];
export const ISSUES = ['start', 'unclear', 'wrong', 'technical', 'other'];

export function createStore(directory, secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw new Error('A 32-byte DATA_KEY is required.');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const key = Buffer.from(secret, 'hex');
  const db = new DatabaseSync(join(directory, 'alltag.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, code_hash TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','tester')), is_test INTEGER NOT NULL DEFAULT 0,
      accepted_at INTEGER, consent_version TEXT, share_content INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL, input_hash TEXT NOT NULL, state TEXT NOT NULL,
      created_at INTEGER NOT NULL, UNIQUE(user_id,client_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      request_id TEXT REFERENCES requests(id) ON DELETE CASCADE,
      role TEXT NOT NULL, content TEXT NOT NULL, has_image INTEGER NOT NULL DEFAULT 0,
      shared INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      request_id TEXT NOT NULL, category TEXT NOT NULL, state TEXT NOT NULL,
      input_tokens INTEGER, cached_tokens INTEGER, output_tokens INTEGER,
      cost_micros INTEGER NOT NULL DEFAULT 30000, latency_ms INTEGER, error_code TEXT,
      model TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, category TEXT, message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id TEXT UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
      rating TEXT, issue TEXT, note TEXT, minutes INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reply_guides (
      request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
      intent TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS draft_edits (
      message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      content TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voice_requests (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      client_id TEXT NOT NULL, input_hash TEXT, state TEXT NOT NULL,
      transcript TEXT, seconds REAL, cost_micros INTEGER NOT NULL DEFAULT 30000,
      usage_known INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER, error_code TEXT,
      model TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id,client_id)
    );
    CREATE TABLE IF NOT EXISTS request_entries (
      request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
      entry TEXT NOT NULL, voice_id TEXT REFERENCES voice_requests(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS share_keys (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shortcut_invites (
      token_hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,created_at);
    CREATE INDEX IF NOT EXISTS attempts_day ON attempts(created_at,user_id);
    CREATE INDEX IF NOT EXISTS voice_day ON voice_requests(created_at,user_id);
    CREATE INDEX IF NOT EXISTS events_day ON events(created_at,user_id);
    CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(user_id,updated_at);
  `);
  const hash = text => createHmac('sha256', key).update(String(text)).digest('hex');
  const seal = text => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  };
  const open = text => {
    const buf = Buffer.from(text, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  };
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const addUser = (label, role = 'tester', isTest = false, suppliedCode) => {
    const code = suppliedCode || Array.from({ length: 4 }, () => randomBytes(3).toString('hex').toUpperCase()).join('-');
    const id = randomUUID();
    run('INSERT INTO users(id,label,code_hash,role,is_test,created_at) VALUES(?,?,?,?,?,?)', id, label, hash(normalizeCode(code)), role, Number(isTest), Date.now());
    return { id, label, role, isTest, code };
  };
  const event = (userId, type, category = null, messageId = null) => run('INSERT INTO events VALUES(?,?,?,?,?,?)', randomUUID(), userId, type, category, messageId, Date.now());
  const cleanup = () => {
    const cutoff = Date.now() - 30 * DAY;
    db.exec('BEGIN');
    try {
      run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
      run('DELETE FROM feedback WHERE created_at < ?', cutoff);
      run('DELETE FROM events WHERE created_at < ?', cutoff);
      run('DELETE FROM messages WHERE created_at < ?', cutoff);
      run('DELETE FROM requests WHERE created_at < ?', cutoff);
      run('DELETE FROM conversations WHERE updated_at < ?', cutoff);
      run('DELETE FROM conversations WHERE NOT EXISTS (SELECT 1 FROM messages WHERE messages.conversation_id=conversations.id)');
      for (const conversation of all('SELECT id FROM conversations WHERE created_at < ?', cutoff)) {
        const first = get('SELECT content FROM messages WHERE conversation_id=? ORDER BY created_at,rowid LIMIT 1', conversation.id);
        if (first) run('UPDATE conversations SET title=? WHERE id=?', seal(open(first.content).slice(0,65)), conversation.id);
      }
      run('DELETE FROM attempts WHERE created_at < ?', cutoff);
      run('DELETE FROM voice_requests WHERE created_at < ?', cutoff);
      run('DELETE FROM share_keys WHERE expires_at < ?', Date.now());
      run('DELETE FROM shortcut_invites WHERE expires_at < ?', Date.now());
      db.exec('COMMIT');
      // Erased contents cannot linger in SQLite freelist pages.
      db.exec('PRAGMA secure_delete=ON; PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  db.exec('PRAGMA secure_delete=ON;');
  return { db, all, get, run, hash, seal, open, addUser, event, cleanup };
}

export const normalizeCode = text => String(text).toUpperCase().replace(/[\s-]/g, '');
export const publicUser = u => ({ id: u.id, label: u.label, role: u.role, isTest: Boolean(u.is_test), accepted: Boolean(u.accepted_at), shareContent: Boolean(u.share_content) });
