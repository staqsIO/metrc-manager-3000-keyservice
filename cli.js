#!/usr/bin/env node
const { loadConfig } = require('./src/config');
const { createStore } = require('./src/store');

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
  const [cmd, service, keyArg] = process.argv.slice(2);
  const usage = 'Usage: node cli.js set-key <service> <key|->  |  node cli.js list <service>';
  if (!cmd || !service) { console.error(usage); process.exit(2); }
  const config = loadConfig(process.env);
  const store = createStore({ databaseUrl: config.databaseUrl, encryptionKey: config.encryptionKey });
  await store.init();
  try {
    if (cmd === 'set-key') {
      const key = keyArg === '-' ? await readStdin() : keyArg;
      if (!key) { console.error(usage); process.exit(2); }
      await store.setKey(service, key);
      console.log(`Stored new ${service} key ending in ${key.slice(-4)}; previous keys deactivated. Running services pick it up within 5 minutes (or POST /api/refresh).`);
    } else if (cmd === 'list') {
      for (const k of await store.listKeys(service)) {
        console.log(`${k.isActive ? '*' : ' '} #${k.id} ••••${k.last4} created ${new Date(k.createdAt).toISOString()}`);
      }
    } else { console.error(usage); process.exit(2); }
  } finally { await store.close(); }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
