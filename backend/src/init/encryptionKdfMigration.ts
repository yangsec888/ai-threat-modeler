/**
 * One-time KDF-iteration migration for at-rest encrypted secrets.
 *
 * Earlier installs derived the AES key with 100,000 PBKDF2 iterations.
 * SEC-004 bumps that to 310,000 (OWASP 2023). The salt+IV+tag are stored
 * inside the ciphertext, but the iteration count is not, so existing
 * ciphertext must be re-encrypted with the new derivation.
 *
 * This migration:
 *   1. Reads `settings.encryption_kdf_version`. If already 2, no-op.
 *   2. For every encrypted column (anthropic_api_key, github_tokens.token_encrypted)
 *      attempts decryption with the current 310k iteration count. On failure
 *      (i.e. existing legacy ciphertext) it falls back to 100k, re-encrypts
 *      with 310k, and writes the new ciphertext back. The legacy ciphertext
 *      is preserved in `settings.anthropic_api_key_legacy_bak` so an admin
 *      can recover if anything goes wrong.
 *   3. Sets `settings.encryption_kdf_version = 2`.
 *
 * Author: Sam Li
 */

import db from '../db/database';
import { encrypt, decrypt, decryptWithFallback, PBKDF2_ITERATIONS } from '../utils/encryption';
import logger from '../utils/logger';

const TARGET_KDF_VERSION = 2;

interface SettingsRow {
  encryption_key: string;
  encryption_kdf_version: number | null;
  anthropic_api_key: string | null;
  anthropic_api_key_legacy_bak: string | null;
}

interface GitHubTokenRow {
  id: number;
  token_encrypted: string;
}

export function runEncryptionKdfMigration(): void {
  let row: SettingsRow | undefined;
  try {
    row = db.prepare(
      'SELECT encryption_key, encryption_kdf_version, anthropic_api_key, anthropic_api_key_legacy_bak FROM settings WHERE id = 1'
    ).get() as SettingsRow | undefined;
  } catch (err) {
    logger.warn('KDF migration: could not read settings row, skipping', { error: err });
    return;
  }

  if (!row || !row.encryption_key) {
    return;
  }

  if ((row.encryption_kdf_version ?? 1) >= TARGET_KDF_VERSION) {
    return;
  }

  logger.info(`🔐 Running encryption KDF migration -> ${PBKDF2_ITERATIONS} iterations...`);

  // Anthropic API key: try current iter, then fall back to legacy
  if (row.anthropic_api_key) {
    try {
      decrypt(row.anthropic_api_key, row.encryption_key, PBKDF2_ITERATIONS);
      logger.info('   anthropic_api_key already on current KDF; skipping');
    } catch {
      try {
        const plaintext = decryptWithFallback(row.anthropic_api_key, row.encryption_key);
        const reEncrypted = encrypt(plaintext, row.encryption_key);
        db.prepare(
          `UPDATE settings
             SET anthropic_api_key_legacy_bak = COALESCE(anthropic_api_key_legacy_bak, ?),
                 anthropic_api_key = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = 1`
        ).run(row.anthropic_api_key, reEncrypted);
        logger.info('   ✅ Re-encrypted anthropic_api_key with new KDF (legacy ciphertext preserved as backup)');
      } catch (err) {
        logger.error('   ❌ Failed to re-encrypt anthropic_api_key; aborting migration before bumping version', { error: err });
        return;
      }
    }
  }

  // GitHub PATs: re-encrypt every row that doesn't decrypt under the new KDF
  let tokenRows: GitHubTokenRow[] = [];
  try {
    tokenRows = db.prepare('SELECT id, token_encrypted FROM github_tokens').all() as GitHubTokenRow[];
  } catch {
    // Table may not exist yet on very fresh installs that never ran the
    // pre-migration boot path. The CREATE TABLE happens earlier in
    // db/database.ts so this should not hit in practice.
    tokenRows = [];
  }
  for (const t of tokenRows) {
    try {
      decrypt(t.token_encrypted, row.encryption_key, PBKDF2_ITERATIONS);
    } catch {
      try {
        const plaintext = decryptWithFallback(t.token_encrypted, row.encryption_key);
        const reEncrypted = encrypt(plaintext, row.encryption_key);
        db.prepare(
          `UPDATE github_tokens
             SET token_encrypted = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
        ).run(reEncrypted, t.id);
        logger.info(`   ✅ Re-encrypted github_tokens row ${t.id} with new KDF`);
      } catch (err) {
        logger.error(`   ❌ Failed to re-encrypt github_tokens row ${t.id}; aborting migration`, { error: err });
        return;
      }
    }
  }

  db.prepare(
    'UPDATE settings SET encryption_kdf_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
  ).run(TARGET_KDF_VERSION);
  logger.info(`✅ Encryption KDF migration complete; encryption_kdf_version=${TARGET_KDF_VERSION}`);
}
