const express = require('express');
const cors = require('cors');
const { timingSafeEqual } = require('node:crypto');
const { DecryptError } = require('./crypto');

const log = (level, message, data) =>
  (level === 'error' ? console.error : console.log)(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'keyservice', message, ...(data ? { data } : {}) }));

function tokenMatches(header, expected) {
  if (!header || !header.startsWith('Bearer ')) return false;
  const got = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

// Only DecryptError text is safe (and useful) to show clients; anything else may leak hosts/ports.
const publicMessage = (err) => (err instanceof DecryptError ? err.message : 'Internal error');

function createApp({ store, apiKey, allowedOrigins, cacheTtlMs = 5 * 60 * 1000, now = Date.now }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));

  const requireAuth = (req, res, next) =>
    tokenMatches(req.headers.authorization, apiKey) ? next() : res.status(401).json({ error: 'Unauthorized' });

  let cache = null;      // { key, expiresAt, metadata, cachedAt }
  let inflight = null;

  async function refresh() {
    inflight ??= store.getActiveKey('openrouter')
      .then((k) => { cache = k ? { ...k, cachedAt: new Date(now()).toISOString() } : null; return cache; })
      .finally(() => { inflight = null; });
    return inflight;
  }

  async function getKey() {
    if (cache && now() - Date.parse(cache.cachedAt) < cacheTtlMs) return cache;
    return refresh();
  }

  app.get('/api/openrouter-key', requireAuth, async (_req, res) => {
    try {
      const k = await getKey();
      if (!k) return res.status(503).json({ error: 'No active key available', message: 'Set one with: node cli.js set-key openrouter -' });
      res.json({ key: k.key, expires_at: k.expiresAt, cached_at: k.cachedAt, metadata: k.metadata });
    } catch (err) {
      log('error', 'serving key failed', { error: err.message });
      res.status(500).json({ error: 'Internal server error', message: publicMessage(err) });
    }
  });

  app.get('/api/health', async (_req, res) => {
    try {
      const k = await getKey();
      res.json({ status: 'healthy', cache: { has_key: Boolean(k), cached_at: k?.cachedAt ?? null, expires_at: k?.expiresAt ?? null }, timestamp: new Date().toISOString() });
    } catch (err) {
      log('error', 'health check failed', { error: err.message });
      res.status(500).json({ status: 'unhealthy', timestamp: new Date().toISOString() });
    }
  });

  app.post('/api/refresh', requireAuth, async (_req, res) => {
    try {
      const k = await refresh();
      res.json({ success: true, cached_at: k?.cachedAt ?? null });
    } catch (err) {
      log('error', 'refresh failed', { error: err.message });
      res.status(500).json({ success: false, error: publicMessage(err) });
    }
  });

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    log('error', 'unhandled error', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

module.exports = { createApp };
