/**
 * Tests for encryption utility — KDF iteration count + fallback decrypt
 *
 * Author: Sam Li
 */
import {
  encrypt,
  decrypt,
  decryptWithFallback,
  PBKDF2_ITERATIONS,
  LEGACY_PBKDF2_ITERATIONS,
} from '../../utils/encryption';

describe('encryption utility', () => {
  const KEY = 'test-encryption-key-with-enough-entropy-for-tests-1234';

  it('SEC-004: PBKDF2 iteration count is OWASP-2023 (310k)', () => {
    expect(PBKDF2_ITERATIONS).toBe(310_000);
    expect(LEGACY_PBKDF2_ITERATIONS).toBe(100_000);
  });

  it('encrypt -> decrypt round-trips', () => {
    const plaintext = 'sk-ant-1234567890abcdef';
    const ciphertext = encrypt(plaintext, KEY);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext, KEY)).toBe(plaintext);
  });

  it('produces different ciphertext on each encryption (random IV/salt)', () => {
    const plaintext = 'same-input-twice';
    const a = encrypt(plaintext, KEY);
    const b = encrypt(plaintext, KEY);
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY)).toBe(plaintext);
    expect(decrypt(b, KEY)).toBe(plaintext);
  });

  it('decrypt with wrong key throws', () => {
    const ciphertext = encrypt('secret', KEY);
    expect(() => decrypt(ciphertext, 'different-key')).toThrow();
  });

  it('decryptWithFallback recovers ciphertext encrypted with legacy 100k iterations', () => {
    // Manually craft a legacy ciphertext using only public encrypt()
    // by passing an iteration override -- not exposed, so build via Node directly.
    const crypto = require('crypto');
    const salt = crypto.randomBytes(64);
    const iv = crypto.randomBytes(16);
    const legacyKey = crypto.pbkdf2Sync(KEY, salt, LEGACY_PBKDF2_ITERATIONS, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
    let enc = cipher.update('legacy-secret', 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag();
    const legacyCiphertext = `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;

    // Default decrypt at 310k iterations should fail
    expect(() => decrypt(legacyCiphertext, KEY)).toThrow();

    // Fallback recovers it
    expect(decryptWithFallback(legacyCiphertext, KEY)).toBe('legacy-secret');
  });
});
