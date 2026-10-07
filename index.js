const { loadConfig, ConfigError } = require('./src/config');
const { createStore } = require('./src/store');
const { createApp } = require('./src/app');

async function main() {
  let config;
  try { config = loadConfig(process.env); } catch (e) {
    if (e instanceof ConfigError) { console.error(e.message); process.exit(1); }
    throw e;
  }
  const store = createStore({ databaseUrl: config.databaseUrl, encryptionKey: config.encryptionKey });
  await store.init();
  const server = createApp({ store, apiKey: config.apiKey, allowedOrigins: config.allowedOrigins })
    .listen(config.port, () => console.log(`keyservice listening on :${config.port}`));

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    setTimeout(() => process.exit(1), 5000).unref();
    server.close(async () => {
      try { await store.close(); } catch (e) { console.error('store close failed:', e.message); }
      process.exit(0);
    });
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => { console.error('keyservice failed to start:', e.message); process.exit(1); });
