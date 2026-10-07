const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { createStore } = require('../src/store');

const ADMIN_URL = process.env.TEST_POSTGRES_URL; // e.g. postgresql://postgres:pw@localhost:55434/postgres
const skip = !ADMIN_URL && 'set TEST_POSTGRES_URL to run';
const dbName = `ks_test_${process.pid}`;
const url = ADMIN_URL && ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
let store;

before(async () => { if (!skip) { store = createStore({ databaseUrl: url, encryptionKey: 'enc' }); await store.init(); } });
after(async () => {
  if (skip) return;
  await store.close();
  const c = new Client({ connectionString: ADMIN_URL }); await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${dbName}`); await c.end();
});

test('creates the database when missing and starts empty', { skip }, async () => {
  assert.equal(await store.getActiveKey('openrouter'), null);
});

test('stores encrypted and serves the newest active key', { skip }, async () => {
  await store.setKey('openrouter', 'sk-old-1111');
  await store.setKey('openrouter', 'sk-new-2222', { metadata: { note: 'rotated' } });
  const k = await store.getActiveKey('openrouter');
  assert.equal(k.key, 'sk-new-2222');
  assert.deepEqual(k.metadata, { note: 'rotated' });
  const rows = await store.listKeys('openrouter');
  assert.deepEqual(rows.map((r) => [r.last4, r.isActive]), [['2222', true], ['1111', false]]);
  const c = new Client({ connectionString: url }); await c.connect();
  const raw = await c.query('select key_value from api_keys');
  await c.end();
  assert.ok(raw.rows.every((r) => r.key_value.startsWith('v1:') && !r.key_value.includes('sk-')));
});

test('init is idempotent', { skip }, async () => {
  await store.init();
  assert.equal((await store.getActiveKey('openrouter')).key, 'sk-new-2222');
});

test('concurrent setKey leaves exactly one active key', { skip }, async () => {
  const keys = Array.from({ length: 6 }, (_, i) => `sk-par-${i}${i}${i}${i}`);
  await Promise.all(keys.map((k) => store.setKey('concurrent', k)));
  const active = (await store.listKeys('concurrent')).filter((r) => r.isActive);
  assert.equal(active.length, 1);
  assert.ok(keys.some((k) => k.slice(-4) === active[0].last4));
  assert.ok(keys.includes((await store.getActiveKey('concurrent')).key));
});
