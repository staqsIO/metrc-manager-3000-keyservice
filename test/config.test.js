const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, ConfigError } = require('../src/config');

test('lists every missing required variable', () => {
  assert.throws(() => loadConfig({}), (e) => e instanceof ConfigError
    && /KEY_SERVICE_API_KEY/.test(e.message) && /KEYSERVICE_DATABASE_URL/.test(e.message) && /KEYSERVICE_ENCRYPTION_KEY/.test(e.message));
});

test('parses a full config', () => {
  const c = loadConfig({ KEY_SERVICE_API_KEY: 't', KEYSERVICE_DATABASE_URL: 'postgresql://x', KEYSERVICE_ENCRYPTION_KEY: 'e', PORT: '4000', ALLOWED_ORIGINS: 'https://a.test, https://b.test' });
  assert.deepEqual(c, { port: 4000, apiKey: 't', databaseUrl: 'postgresql://x', encryptionKey: 'e', allowedOrigins: ['https://a.test', 'https://b.test'] });
});

test('defaults port to 3001 and origins to none', () => {
  const c = loadConfig({ KEY_SERVICE_API_KEY: 't', KEYSERVICE_DATABASE_URL: 'postgresql://x', KEYSERVICE_ENCRYPTION_KEY: 'e' });
  assert.equal(c.port, 3001);
  assert.deepEqual(c.allowedOrigins, []);
});
