/**
 * GitHub Personal Access Token (PAT) Model
 *
 * Per-user encrypted PAT storage. The token is encrypted at rest using
 * AES-256-GCM with the install's encryption key (see SettingsModel.getEncryptionKey).
 * The plaintext token is never persisted and never returned through any API.
 *
 * Author: Sam Li
 */

import db, { GitHubToken } from '../db/database';
import { encrypt, decrypt } from '../utils/encryption';
import { SettingsModel } from './settings';

export interface GitHubTokenStatus {
  exists: boolean;
  name: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
}

export class GitHubTokenModel {
  /**
   * Insert or replace the PAT for a user. Replacing resets last_used_at to
   * NULL so admins can verify the new PAT actually works on first use.
   */
  static set(userId: number, plainToken: string, name: string | null): void {
    if (!plainToken || plainToken.trim().length === 0) {
      throw new Error('Token cannot be empty');
    }
    const encryptionKey = SettingsModel.getEncryptionKey();
    const encrypted = encrypt(plainToken, encryptionKey);
    db.prepare(
      `INSERT INTO github_tokens (user_id, token_encrypted, token_name, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         token_encrypted = excluded.token_encrypted,
         token_name = excluded.token_name,
         updated_at = CURRENT_TIMESTAMP,
         last_used_at = NULL`
    ).run(userId, encrypted, name);
  }

  /**
   * Status: never returns the token itself.
   */
  static getStatus(userId: number): GitHubTokenStatus {
    const row = db.prepare(
      'SELECT token_name, created_at, updated_at, last_used_at FROM github_tokens WHERE user_id = ?'
    ).get(userId) as
      | { token_name: string | null; created_at: string; updated_at: string; last_used_at: string | null }
      | undefined;
    if (!row) {
      return { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null };
    }
    return {
      exists: true,
      name: row.token_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
    };
  }

  /**
   * Server-internal accessor for the decrypted PAT. Routes that hand the PAT
   * to outbound code (e.g. the github import handler) call this; never expose
   * the return value over an API response.
   */
  static getDecrypted(userId: number): string | null {
    const row = db.prepare(
      'SELECT token_encrypted FROM github_tokens WHERE user_id = ?'
    ).get(userId) as { token_encrypted: string } | undefined;
    if (!row) return null;
    return decrypt(row.token_encrypted, SettingsModel.getEncryptionKey());
  }

  static delete(userId: number): void {
    db.prepare('DELETE FROM github_tokens WHERE user_id = ?').run(userId);
  }

  static markUsed(userId: number): void {
    db.prepare(
      'UPDATE github_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE user_id = ?'
    ).run(userId);
  }

  /** Test-only helper: return raw row (used for at-rest assertions). */
  static _getRawRow(userId: number): GitHubToken | null {
    const row = db.prepare(
      'SELECT * FROM github_tokens WHERE user_id = ?'
    ).get(userId) as GitHubToken | undefined;
    return row ?? null;
  }
}
