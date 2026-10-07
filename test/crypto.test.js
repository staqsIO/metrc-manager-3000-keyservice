const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt, DecryptError } = require('../src/crypto');

test('round trip', () => {
  const c = encrypt('sk-or-v1-secret', 'k1');
  assert.match(c, /^v1:/);
  assert.notEqual(c.includes('sk-or-v1-secret'), true);
  assert.equal(decrypt(c, 'k1'), 'sk-or-v1-secret');
});

test('wrong secret throws DecryptError', () => {
  const c = encrypt('x', 'k1');
  assert.throws(() => decrypt(c, 'k2'), DecryptError);
});

test('random IV makes ciphertexts differ', () => {
  assert.notEqual(encrypt('same', 'k'), encrypt('same', 'k'));
});
