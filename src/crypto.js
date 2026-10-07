const crypto = require('node:crypto');

class DecryptError extends Error {}

const keyFor = (secret) => crypto.createHash('sha256').update(secret, 'utf8').digest();

function encrypt(plain, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

function decrypt(payload, secret) {
  const [v, iv, tag, ct] = String(payload).split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new DecryptError('Unknown ciphertext format');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyFor(secret), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch {
    throw new DecryptError('Cannot decrypt stored key — KEYSERVICE_ENCRYPTION_KEY changed?');
  }
}

module.exports = { encrypt, decrypt, DecryptError };
