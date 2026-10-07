const { Pool, Client } = require('pg');
const { encrypt, decrypt } = require('./crypto');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS api_keys (
  id bigserial PRIMARY KEY,
  service_name text NOT NULL,
  key_value text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_active_idx ON api_keys (service_name, is_active, created_at DESC);
`;

async function ensureDatabase(databaseUrl) {
  const probe = new Client({ connectionString: databaseUrl });
  try {
    await probe.connect();
    await probe.end();
  } catch (err) {
    if (err.code !== '3D000') throw err; // 3D000 = invalid_catalog_name (database does not exist)
    const u = new URL(databaseUrl);
    const name = decodeURIComponent(u.pathname.slice(1));
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Refusing to create database with name "${name}"`);
    u.pathname = '/postgres';
    const admin = new Client({ connectionString: u.toString() });
    await admin.connect();
    try { await admin.query(`CREATE DATABASE "${name}"`); } catch (e) { if (e.code !== '42P04') throw e; } // 42P04 = already exists
    finally { await admin.end(); }
  }
}

function createStore({ databaseUrl, encryptionKey }) {
  let pool;
  const db = () => {
    if (!pool) {
      pool = new Pool({ connectionString: databaseUrl, max: 5 });
      pool.on('error', (err) => console.error('[keystore] idle database client error:', err.code || err.message));
    }
    return pool;
  };

  return {
    async init() {
      await ensureDatabase(databaseUrl);
      try {
        await db().query(SCHEMA);
      } catch (e) {
        const p = pool; pool = undefined;
        if (p) await p.end().catch(() => {});
        throw e;
      }
    },
    async getActiveKey(service) {
      const r = await db().query(
        `SELECT key_value, expires_at, metadata, created_at FROM api_keys
         WHERE service_name = $1 AND is_active ORDER BY created_at DESC, id DESC LIMIT 1`, [service]);
      if (!r.rows.length) return null;
      const row = r.rows[0];
      return { key: decrypt(row.key_value, encryptionKey), expiresAt: row.expires_at, metadata: row.metadata, createdAt: row.created_at };
    },
    async setKey(service, key, { expiresAt = null, metadata = {} } = {}) {
      const client = await db().connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [service]);
        await client.query('UPDATE api_keys SET is_active = false WHERE service_name = $1 AND is_active', [service]);
        await client.query(
          'INSERT INTO api_keys (service_name, key_value, expires_at, metadata) VALUES ($1, $2, $3, $4)',
          [service, encrypt(key, encryptionKey), expiresAt, metadata]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK'); throw e;
      } finally {
        client.release();
      }
    },
    async listKeys(service) {
      const r = await db().query(
        'SELECT id, is_active, created_at, expires_at, key_value FROM api_keys WHERE service_name = $1 ORDER BY created_at DESC, id DESC', [service]);
      return r.rows.map((row) => {
        let last4 = '????';
        try { last4 = decrypt(row.key_value, encryptionKey).slice(-4); } catch { /* wrong key: show ???? */ }
        return { id: Number(row.id), isActive: row.is_active, createdAt: row.created_at, expiresAt: row.expires_at, last4 };
      });
    },
    async close() { const p = pool; pool = undefined; if (p) await p.end(); },
  };
}

module.exports = { createStore, ensureDatabase };
