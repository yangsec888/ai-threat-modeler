/**
 * Tests for the encryption KDF migration that re-encrypts ciphertext from
 * the legacy 100k iteration count to 310k.
 *
 * Author: Sam Li
 */

jest.mock('better-sqlite3', () => {
  const actual = jest.requireActual('better-sqlite3');
  return jest.fn((_path: string, opts?: object) => actual(':memory:', opts));
});

import db from '../../db/database';
import { runEncryptionKdfMigration } from '../../init/encryptionKdfMigration';
import {
  encrypt,
  decrypt,
  PBKDF2_ITERATIONS,
  LEGACY_PBKDF2_ITERATIONS,
} from '../../utils/encryption';
import * as crypto from 'crypto';

function buildLegacyCiphertext(plaintext: string, key: string): string {
  const salt = crypto.randomBytes(64);
  const iv = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(key, salt, LEGACY_PBKDF2_ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;
}

describe('runEncryptionKdfMigration', () => {
  let encKey: string;

  beforeEach(() => {
    const row = db.prepare('SELECT encryption_key FROM settings WHERE id = 1').get() as { encryption_key: string };
    encKey = row.encryption_key;
    // Reset migration state for each test
    db.prepare('UPDATE settings SET encryption_kdf_version = 1, anthropic_api_key = NULL, anthropic_api_key_legacy_bak = NULL WHERE id = 1').run();
    db.prepare('DELETE FROM github_tokens').run();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, role)
                VALUES (1, 'kdfuser', 'kdf@example.com', 'h', 'Admin')`).run();
  });

  it('is a no-op when encryption_kdf_version is already at target', () => {
    db.prepare('UPDATE settings SET encryption_kdf_version = 2 WHERE id = 1').run();
    const legacy = buildLegacyCiphertext('legacy', encKey);
    db.prepare('UPDATE settings SET anthropic_api_key = ? WHERE id = 1').run(legacy);

    runEncryptionKdfMigration();

    const after = db.prepare('SELECT anthropic_api_key FROM settings WHERE id = 1').get() as { anthropic_api_key: string };
    // Untouched -> still the legacy ciphertext
    expect(after.anthropic_api_key).toBe(legacy);
  });

  it('re-encrypts legacy anthropic_api_key with new KDF, preserves legacy in backup column', () => {
    const legacy = buildLegacyCiphertext('sk-ant-legacy', encKey);
    db.prepare('UPDATE settings SET anthropic_api_key = ? WHERE id = 1').run(legacy);

    runEncryptionKdfMigration();

    const row = db.prepare('SELECT anthropic_api_key, anthropic_api_key_legacy_bak, encryption_kdf_version FROM settings WHERE id = 1').get() as {
      anthropic_api_key: string;
      anthropic_api_key_legacy_bak: string | null;
      encryption_kdf_version: number;
    };

    expect(row.encryption_kdf_version).toBe(2);
    expect(row.anthropic_api_key_legacy_bak).toBe(legacy);
    expect(row.anthropic_api_key).not.toBe(legacy);
    // Now decryptable at the new (default) iteration count
    expect(decrypt(row.anthropic_api_key, encKey, PBKDF2_ITERATIONS)).toBe('sk-ant-legacy');
  });

  it('leaves already-modern ciphertext unchanged', () => {
    const modern = encrypt('sk-ant-modern', encKey);
    db.prepare('UPDATE settings SET anthropic_api_key = ? WHERE id = 1').run(modern);

    runEncryptionKdfMigration();

    const row = db.prepare('SELECT anthropic_api_key, encryption_kdf_version FROM settings WHERE id = 1').get() as {
      anthropic_api_key: string;
      encryption_kdf_version: number;
    };
    expect(row.encryption_kdf_version).toBe(2);
    expect(row.anthropic_api_key).toBe(modern);
  });

  it('re-encrypts every legacy github_tokens row', () => {
    const legacy = buildLegacyCiphertext('ghp_legacy_abc', encKey);
    db.prepare(
      'INSERT INTO github_tokens (user_id, token_encrypted, token_name) VALUES (1, ?, ?)'
    ).run(legacy, 'legacy-pat');

    runEncryptionKdfMigration();

    const row = db.prepare('SELECT token_encrypted FROM github_tokens WHERE user_id = 1').get() as { token_encrypted: string };
    expect(row.token_encrypted).not.toBe(legacy);
    expect(decrypt(row.token_encrypted, encKey, PBKDF2_ITERATIONS)).toBe('ghp_legacy_abc');
  });

  it('is idempotent on re-run', () => {
    const legacy = buildLegacyCiphertext('once', encKey);
    db.prepare('UPDATE settings SET anthropic_api_key = ? WHERE id = 1').run(legacy);

    runEncryptionKdfMigration();
    const after1 = db.prepare('SELECT anthropic_api_key FROM settings WHERE id = 1').get() as { anthropic_api_key: string };

    runEncryptionKdfMigration();
    const after2 = db.prepare('SELECT anthropic_api_key FROM settings WHERE id = 1').get() as { anthropic_api_key: string };

    expect(after1.anthropic_api_key).toBe(after2.anthropic_api_key);
  });
});
