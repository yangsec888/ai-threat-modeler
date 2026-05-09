/**
 * Stuck-job watchdog — periodic auto-recovery for `processing` jobs.
 *
 * Why this exists
 * ---------------
 * Two production hangs in v1.6.3 / v1.6.4 left jobs orphaned in `processing`
 * forever, despite the agent having either failed early (size-cap path) or
 * even completed and written a valid threat_model_report.json (close-event
 * path). Tests cannot enumerate every variant of "stuck in processing",
 * so this module is the runtime guard: every N minutes it sweeps stale
 * `processing` rows and resolves them deterministically.
 *
 * Sweep policy
 * ------------
 * For each `threat_modeling_jobs` row with `status = 'processing'` AND
 * `updated_at` older than the threshold (default 60 minutes):
 *
 *   - If `work_dir/<jobId>/threat_model_report.json` exists and parses as
 *     JSON with a `threat_model_report` root key, the agent finished and
 *     we just lost the post-exit handoff. Copy the report into
 *     `threat-modeling-reports/<jobId>/threat_model_report.json` and flip
 *     status → `completed` with a watchdog-annotated `error_message`
 *     explaining the auto-recovery.
 *
 *   - Otherwise the run is unrecoverable from disk. Flip status → `failed`
 *     with a watchdog-annotated `error_message` so the row stops polluting
 *     the UI's "in-flight" view and the user gets a clear next action.
 *
 * The sweep is idempotent: rows that were already `completed`/`failed` are
 * never touched, and a row that was just-recovered moves out of the
 * `status='processing'` filter on the next sweep.
 *
 * Author: Sam Li
 */

import * as fs from 'fs';
import * as path from 'path';
import db from '../db/database';
import { ThreatModelingJobModel } from '../models/threatModelingJob';
import logger from '../utils/logger';

/** Defaults. Both can be overridden by env or by `startStuckJobWatchdog` args. */
export const DEFAULT_WATCHDOG_INTERVAL_MS = 5 * 60 * 1000; // 5 min
export const DEFAULT_WATCHDOG_THRESHOLD_MIN = 60;          // 60 min

export interface StuckJobSweepResult {
  scanned: number;
  recovered: number;
  failed: number;
  /** Per-row outcome, useful for tests and structured logging. */
  outcomes: Array<{
    jobId: string;
    action: 'recovered' | 'failed';
    reason: string;
  }>;
}

interface StuckJobRow {
  id: string;
  updated_at: string;
}

/**
 * Resolve the work_dir / reports base dir relative to the current working
 * directory. Mirrors `processThreatModelingJob`'s convention so paths line
 * up regardless of whether the backend is run from `backend/` (dev) or
 * `/app/` (Docker).
 */
function resolvePaths(jobId: string) {
  const workDir = path.join(process.cwd(), 'work_dir', jobId);
  const reportsBaseDir = path.join(process.cwd(), 'threat-modeling-reports');
  const jobReportDir = path.join(reportsBaseDir, jobId);
  const workReportPath = path.join(workDir, 'threat_model_report.json');
  const destReportPath = path.join(jobReportDir, 'threat_model_report.json');
  return { workDir, reportsBaseDir, jobReportDir, workReportPath, destReportPath };
}

/** Return true iff the file at `p` exists, parses as JSON, and has the expected root key. */
function isValidReport(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === 'object' && 'threat_model_report' in parsed);
  } catch {
    return false;
  }
}

/**
 * Run a single sweep. Returns a summary. Always idempotent and crash-safe:
 * a failure on one row never stops the rest of the sweep.
 */
export function runStuckJobSweep(thresholdMin: number = DEFAULT_WATCHDOG_THRESHOLD_MIN): StuckJobSweepResult {
  const result: StuckJobSweepResult = { scanned: 0, recovered: 0, failed: 0, outcomes: [] };

  let rows: StuckJobRow[] = [];
  try {
    // SQLite stores `updated_at` as ISO-ish text; `datetime('now', '-N minutes')`
    // does the comparison in UTC the same way `CURRENT_TIMESTAMP` writes it.
    const stmt = db.prepare(`
      SELECT id, updated_at
      FROM threat_modeling_jobs
      WHERE status = 'processing'
        AND datetime(updated_at) < datetime('now', '-' || ? || ' minutes')
    `);
    rows = stmt.all(thresholdMin) as StuckJobRow[];
  } catch (err) {
    logger.error('Stuck-job watchdog: failed to query stuck jobs', { error: (err as Error).message });
    return result;
  }

  result.scanned = rows.length;
  if (rows.length === 0) return result;

  logger.warn(
    `🩺 Stuck-job watchdog: ${rows.length} job(s) stuck in 'processing' for >${thresholdMin}m — attempting recovery`,
  );

  for (const row of rows) {
    try {
      const { workReportPath, jobReportDir, destReportPath } = resolvePaths(row.id);

      if (isValidReport(workReportPath)) {
        // The agent finished but the post-exit handoff was lost. Salvage it.
        try { fs.mkdirSync(jobReportDir, { recursive: true }); } catch { /* ignore */ }
        fs.copyFileSync(workReportPath, destReportPath);

        // updateReports flips status → 'completed' and clears error_message.
        // We then overwrite error_message with a watchdog annotation so an
        // operator can see *why* the job appears completed without normal
        // execution metrics. We use updateStatus directly to avoid touching
        // the report-path columns a second time.
        ThreatModelingJobModel.updateReports(row.id, destReportPath, destReportPath, destReportPath);
        const annotation =
          `Watchdog auto-recovery: row was stuck in 'processing' since ${row.updated_at}; ` +
          `a valid threat_model_report.json existed in work_dir/, so it was copied into ` +
          `threat-modeling-reports/<jobId>/ and the row flipped to 'completed'. ` +
          `Investigate why processThreatModelingJob did not complete the handoff for this job.`;
        try {
          db.prepare('UPDATE threat_modeling_jobs SET error_message = ? WHERE id = ?').run(annotation, row.id);
        } catch (annErr) {
          logger.warn(`Stuck-job watchdog: failed to annotate recovered job ${row.id}`, { error: (annErr as Error).message });
        }

        result.recovered += 1;
        result.outcomes.push({ jobId: row.id, action: 'recovered', reason: 'valid report in work_dir' });
        logger.warn(`🩺 Stuck-job watchdog: recovered job ${row.id} (report copied, status='completed')`);
      } else {
        const errorMessage =
          `Watchdog auto-fail: row was stuck in 'processing' since ${row.updated_at} ` +
          `(>${thresholdMin}m) and no valid threat_model_report.json was found in work_dir/. ` +
          `The agent likely crashed silently or the backend was restarted mid-run. ` +
          `Re-import to retry.`;
        ThreatModelingJobModel.updateStatus(row.id, 'failed', null, errorMessage);

        result.failed += 1;
        result.outcomes.push({ jobId: row.id, action: 'failed', reason: 'no valid report in work_dir' });
        logger.warn(`🩺 Stuck-job watchdog: auto-failed job ${row.id} (no recoverable report)`);
      }
    } catch (err) {
      // Per-row failure is not fatal — log and continue.
      logger.error(`Stuck-job watchdog: error processing job ${row.id}`, { error: (err as Error).message });
    }
  }

  logger.warn(
    `🩺 Stuck-job watchdog: sweep complete — scanned=${result.scanned} recovered=${result.recovered} failed=${result.failed}`,
  );
  return result;
}

/**
 * Start the periodic watchdog. Returns a `stop()` function that clears the
 * timer (used by tests; the production server runs until process exit).
 *
 * - The first sweep runs on the next tick, not immediately on call, so
 *   that boot-time logging stays uncluttered.
 * - In `NODE_ENV === 'test'` this is a no-op so unit tests don't get a
 *   ghost timer running against their mocked DB.
 */
export function startStuckJobWatchdog(
  options: { intervalMs?: number; thresholdMin?: number } = {},
): () => void {
  if (process.env.NODE_ENV === 'test') {
    return () => { /* no-op in test env */ };
  }

  const intervalMs =
    options.intervalMs ??
    (Number(process.env.STUCK_JOB_WATCHDOG_INTERVAL_MS) || DEFAULT_WATCHDOG_INTERVAL_MS);
  const thresholdMin =
    options.thresholdMin ??
    (Number(process.env.STUCK_JOB_WATCHDOG_THRESHOLD_MIN) || DEFAULT_WATCHDOG_THRESHOLD_MIN);

  logger.info(
    `🩺 Stuck-job watchdog starting: interval=${intervalMs}ms threshold=${thresholdMin}m`,
  );

  const tick = () => {
    try {
      runStuckJobSweep(thresholdMin);
    } catch (err) {
      // runStuckJobSweep already swallows per-row errors; this is a final
      // safety net so a sweep crash never kills the watchdog timer.
      logger.error('Stuck-job watchdog: sweep crashed', { error: (err as Error).message });
    }
  };

  const handle = setInterval(tick, intervalMs);
  // Allow the process to exit even with the watchdog active (e.g. on SIGINT).
  if (typeof handle.unref === 'function') handle.unref();

  return () => clearInterval(handle);
}
