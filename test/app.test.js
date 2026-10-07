const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { DecryptError } = require('../src/crypto');

function fakeStore(key = 'sk-test-9999') {
  let calls = 0;
  return {
    get calls() { return calls; },
    getActiveKey: async () => { calls++; return key ? { key, expiresAt: null, metadata: {}, createdAt: new Date(0) } : null; },
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

const auth = (t) => ({ headers: { Authorization: `Bearer ${t}` } });

test('serves the key with a valid token and caches it', async () => {
  const store = fakeStore();
  await withServer(createApp({ store, apiKey: 'secret-token', allowedOrigins: [] }), async (base) => {
    const r = await fetch(`${base}/api/openrouter-key`, auth('secret-token'));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).key, 'sk-test-9999');
    await fetch(`${base}/api/openrouter-key`, auth('secret-token'));
    assert.equal(store.calls, 1);
  });
});

test('rejects missing, wrong, and different-length tokens', async () => {
  await withServer(createApp({ store: fakeStore(), apiKey: 'secret-token', allowedOrigins: [] }), async (base) => {
    assert.equal((await fetch(`${base}/api/openrouter-key`)).status, 401);
    assert.equal((await fetch(`${base}/api/openrouter-key`, auth('secret-tokeX'))).status, 401);
    assert.equal((await fetch(`${base}/api/openrouter-key`, auth('x'))).status, 401);
    assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST' })).status, 401);
  });
});

test('503 when no key is stored; health still 200', async () => {
  await withServer(createApp({ store: fakeStore(null), apiKey: 't', allowedOrigins: [] }), async (base) => {
    const r = await fetch(`${base}/api/openrouter-key`, auth('t'));
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'No active key available');
    const h = await fetch(`${base}/api/health`);
    assert.equal(h.status, 200);
    assert.equal((await h.json()).cache.has_key, false);
  });
});

test('wrong encryption key → 500 with a readable message', async () => {
  const store = { getActiveKey: async () => { throw new DecryptError('Cannot decrypt stored key — KEYSERVICE_ENCRYPTION_KEY changed?'); } };
  await withServer(createApp({ store, apiKey: 't', allowedOrigins: [] }), async (base) => {
    const r = await fetch(`${base}/api/openrouter-key`, auth('t'));
    assert.equal(r.status, 500);
    assert.match((await r.json()).message, /KEYSERVICE_ENCRYPTION_KEY changed/);
  });
});

test('no CORS header unless the origin is allowed', async () => {
  await withServer(createApp({ store: fakeStore(), apiKey: 't', allowedOrigins: ['https://ok.test'] }), async (base) => {
    const bad = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.test' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    const ok = await fetch(`${base}/api/health`, { headers: { Origin: 'https://ok.test' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://ok.test');
  });
});

test('non-decrypt errors do not leak internals to clients', async () => {
  const store = { getActiveKey: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432'); } };
  const orig = console.error; console.error = () => {};
  try {
    await withServer(createApp({ store, apiKey: 't', allowedOrigins: [] }), async (base) => {
      const r = await fetch(`${base}/api/openrouter-key`, auth('t'));
      assert.equal(r.status, 500);
      assert.doesNotMatch(JSON.stringify(await r.json()), /10\.0\.0\.5/);
      const h = await fetch(`${base}/api/health`);
      assert.equal(h.status, 500);
      const hb = await h.json();
      assert.equal(hb.status, 'unhealthy');
      assert.doesNotMatch(JSON.stringify(hb), /10\.0\.0\.5|ECONNREFUSED/);
      const f = await fetch(`${base}/api/refresh`, { method: 'POST', ...auth('t') });
      assert.equal(f.status, 500);
      assert.doesNotMatch(JSON.stringify(await f.json()), /10\.0\.0\.5/);
    });
  } finally { console.error = orig; }
});

test('unknown route returns JSON 404', async () => {
  await withServer(createApp({ store: fakeStore(), apiKey: 't', allowedOrigins: [] }), async (base) => {
    const r = await fetch(`${base}/nope`);
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: 'Not found' });
  });
});

test('malformed JSON body on /api/refresh is not an HTML page', async () => {
  await withServer(createApp({ store: fakeStore(), apiKey: 't', allowedOrigins: [] }), async (base) => {
    const r = await fetch(`${base}/api/refresh`, { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: '{bad' });
    assert.ok(!(r.headers.get('content-type') || '').includes('html'));
    assert.ok(r.status === 200 || (await r.json()));
  });
});
