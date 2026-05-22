/**
 * Regression tests for ThreatModelingStagingModel.deleteStale.
 *
 * Bug history (v1.7.0 dev): SQLite's CURRENT_TIMESTAMP stores `created_at`
 * as `'YYYY-MM-DD HH:MM:SS'` (space separator), but the JavaScript caller
 * was supplying the cutoff as `Date.toISOString()` → `'YYYY-MM-DDTHH:MM:SS.sssZ'`
 * (with a literal `T`). Plain string `<` evaluated `' '` (32) < `'T'` (84),
 * so a freshly-created row's `created_at` was lexically *less than* the
 * 30-min-ago cutoff and the watchdog was sweeping `ready` rows ~2 minutes
 * after they were created. These tests pin the fix (wrap both sides in
 * SQLite's `datetime(...)` so the comparison is by datetime, not bytes).
 */

import { ThreatModelingStagingModel } from '../../models/threatModelingStaging';
import { UserModel } from '../../models/user';
import db from '../../db/database';

describe('ThreatModelingStagingModel.deleteStale', () => {
  let testUserId: number;

  beforeAll(async () => {
    const u = await UserModel.create(
      'staging-gc-test',
      'staging-gc@example.com',
      'password123',
      true,
    );
    testUserId = u.id;
  });

  beforeEach(() => {
    db.prepare('DELETE FROM threat_modeling_stagings WHERE user_id = ?').run(testUserId);
  });

  afterAll(() => {
    db.prepare('DELETE FROM threat_modeling_stagings WHERE user_id = ?').run(testUserId);
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  });

  it('does not sweep a fresh ready row inside the TTL window (regression: T-vs-space)', () => {
    const row = ThreatModelingStagingModel.create({
      userId: testUserId,
      sourceType: 'github',
      sourceUrl: 'https://github.com/octocat/Hello-World',
      repoName: 'Hello-World',
    });
    ThreatModelingStagingModel.updateStatus(row.id, 'ready');

    // 30-minute cutoff (the production default). `created_at` is now,
    // `expires_at` is now+30min — neither should match.
    const swept = ThreatModelingStagingModel.deleteStale(30 * 60 * 1000);

    expect(swept.find((r) => r.id === row.id)).toBeUndefined();
    const after = ThreatModelingStagingModel.findByIdRaw(row.id);
    expect(after.status).toBe('ready');
  });

  it('does not sweep a fresh row even with a tiny 1ms threshold when expires_at is still in the future', () => {
    // This is the smoking-gun assertion: with the old lexical-string
    // comparison, the fresh `created_at` (space-separator) was always
    // "less than" the ISO-formatted cutoff, so any threshold >= 1ms swept
    // the row. The fix only sweeps once `created_at` is *actually* earlier
    // than the cutoff time.
    const row = ThreatModelingStagingModel.create({
      userId: testUserId,
      sourceType: 'upload',
      repoName: 'just-now',
    });

    // Freeze "now" forwards by zero seconds — created_at is fresh.
    // expires_at is row creation + 30min, well in the future.
    const swept = ThreatModelingStagingModel.deleteStale(1);

    expect(swept.find((r) => r.id === row.id)).toBeUndefined();
  });

  it('sweeps a row whose expires_at is in the past', () => {
    const row = ThreatModelingStagingModel.create({
      userId: testUserId,
      sourceType: 'upload',
      repoName: 'expired',
    });
    // Force expires_at into the past.
    db.prepare(
      `UPDATE threat_modeling_stagings SET expires_at = datetime('now', '-1 hour') WHERE id = ?`,
    ).run(row.id);

    const swept = ThreatModelingStagingModel.deleteStale(30 * 60 * 1000);

    expect(swept.find((r) => r.id === row.id)).toBeDefined();
    const after = ThreatModelingStagingModel.findByIdRaw(row.id);
    expect(after.status).toBe('expired');
  });

  it('sweeps a row whose created_at is older than the cutoff', () => {
    const row = ThreatModelingStagingModel.create({
      userId: testUserId,
      sourceType: 'upload',
      repoName: 'old',
    });
    // Force created_at into the past while leaving expires_at in the future
    // (simulates a very long agent stall).
    db.prepare(
      `UPDATE threat_modeling_stagings
       SET created_at = datetime('now', '-2 hours'),
           expires_at = datetime('now', '+30 minutes')
       WHERE id = ?`,
    ).run(row.id);

    const swept = ThreatModelingStagingModel.deleteStale(30 * 60 * 1000);

    expect(swept.find((r) => r.id === row.id)).toBeDefined();
  });

  it('never touches terminal rows (consumed, cancelled, expired)', () => {
    const consumed = ThreatModelingStagingModel.create({
      userId: testUserId,
      sourceType: 'upload',
      repoName: 'a',
    });
    ThreatModelingStagingModel.markConsumed(consumed.id);

    const cancelled = ThreatModelingStagingModel.create({
      userId: testUserId,
      sourceType: 'upload',
      repoName: 'b',
    });
    ThreatModelingStagingModel.markCancelled(cancelled.id);

    // Force both into the past in case the comparison would otherwise match.
    db.prepare(
      `UPDATE threat_modeling_stagings
       SET created_at = datetime('now', '-2 hours'),
           expires_at = datetime('now', '-1 hour')
       WHERE id IN (?, ?)`,
    ).run(consumed.id, cancelled.id);

    const swept = ThreatModelingStagingModel.deleteStale(30 * 60 * 1000);

    expect(swept.find((r) => r.id === consumed.id)).toBeUndefined();
    expect(swept.find((r) => r.id === cancelled.id)).toBeUndefined();
  });
});
