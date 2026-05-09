/**
 * Tests for GitHubTokenModel — verifies tokens are encrypted at rest and
 * never persisted in plaintext.
 *
 * Author: Sam Li
 */

// Use a real in-memory better-sqlite3 so we can verify at-rest encryption
// of the token column.
jest.mock('better-sqlite3', () => {
  const actual = jest.requireActual('better-sqlite3');
  return jest.fn((_path: string, opts?: object) => actual(':memory:', opts));
});

import db from '../../db/database';
import { GitHubTokenModel } from '../../models/githubToken';
import { SettingsModel } from '../../models/settings';

describe('GitHubTokenModel', () => {
  beforeEach(() => {
    db.exec('DELETE FROM github_tokens');
    // Make sure a user with id=1 exists for the FK
    db.exec(
      `INSERT OR IGNORE INTO users (id, username, email, password_hash, role)
       VALUES (1, 'testuser', 'test@example.com', 'hash', 'Admin')`
    );
  });

  it('SEC-008: never persists token plaintext', () => {
    GitHubTokenModel.set(1, 'ghp_supersecret_token_123', 'my-pat');
    const raw = GitHubTokenModel._getRawRow(1);
    expect(raw).not.toBeNull();
    expect(raw!.token_encrypted).not.toBe('ghp_supersecret_token_123');
    expect(raw!.token_encrypted).not.toContain('ghp_');
    // Encrypted format is salt:iv:tag:ciphertext (4 hex parts)
    expect(raw!.token_encrypted.split(':').length).toBe(4);
  });

  it('round-trips via internal getDecrypted accessor', () => {
    GitHubTokenModel.set(1, 'ghp_round_trip', null);
    expect(GitHubTokenModel.getDecrypted(1)).toBe('ghp_round_trip');
  });

  it('replaces existing token via ON CONFLICT upsert', () => {
    GitHubTokenModel.set(1, 'first', 'name1');
    GitHubTokenModel.markUsed(1);
    GitHubTokenModel.set(1, 'second', 'name2');
    expect(GitHubTokenModel.getDecrypted(1)).toBe('second');
    const status = GitHubTokenModel.getStatus(1);
    expect(status.exists).toBe(true);
    expect(status.name).toBe('name2');
    // last_used_at must be reset to NULL after replace
    expect(status.lastUsedAt).toBeNull();
  });

  it('getStatus.exists=false when no token', () => {
    expect(GitHubTokenModel.getStatus(1).exists).toBe(false);
    expect(GitHubTokenModel.getDecrypted(1)).toBeNull();
  });

  it('delete removes the token', () => {
    GitHubTokenModel.set(1, 'tok', null);
    GitHubTokenModel.delete(1);
    expect(GitHubTokenModel.getStatus(1).exists).toBe(false);
  });

  it('rejects empty token', () => {
    expect(() => GitHubTokenModel.set(1, '', null)).toThrow();
    expect(() => GitHubTokenModel.set(1, '   ', null)).toThrow();
  });

  it('uses SettingsModel.getEncryptionKey() and not a route-exposed key', () => {
    const spy = jest.spyOn(SettingsModel, 'getEncryptionKey');
    GitHubTokenModel.set(1, 'ghp_uses_internal_key', null);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
