class ConfigError extends Error {}

const REQUIRED = ['KEY_SERVICE_API_KEY', 'KEYSERVICE_DATABASE_URL', 'KEYSERVICE_ENCRYPTION_KEY'];

function loadConfig(env) {
  const missing = REQUIRED.filter((k) => !env[k] || !String(env[k]).trim());
  if (missing.length) throw new ConfigError(`Missing required environment variables: ${missing.join(', ')}`);
  return {
    port: parseInt(env.PORT || '3001', 10),
    apiKey: env.KEY_SERVICE_API_KEY.trim(),
    databaseUrl: env.KEYSERVICE_DATABASE_URL.trim(),
    encryptionKey: env.KEYSERVICE_ENCRYPTION_KEY,
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

module.exports = { loadConfig, ConfigError };
