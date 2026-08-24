/**
 * Threat review model — human review loop for threat-model findings.
 *
 * Review status is stored per finding in its own table so updating it never
 * mutates the immutable generated report. It joins back onto the report at
 * read/export time (see `mergeThreatReviews` in routes/threatModeling.ts).
 *
 * Threats only: risks derive their review status from the threats they link to
 * via `related_threats`.
 */

import db from '../db/database';

export const REVIEW_STATUSES = [
  'unreviewed',
  'accepted',
  'mitigated',
  'false_positive',
  'needs_review',
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const isReviewStatus = (value: unknown): value is ReviewStatus =>
  typeof value === 'string' && (REVIEW_STATUSES as readonly string[]).includes(value);

export interface ThreatReviewRow {
  job_id: string;
  finding_id: string;
  status: ReviewStatus;
  note: string | null;
  updated_at: string;
}

export interface ThreatReview {
  jobId: string;
  findingId: string;
  status: ReviewStatus;
  note: string | null;
  updatedAt: string;
}

function rowToDto(row: ThreatReviewRow): ThreatReview {
  return {
    jobId: row.job_id,
    findingId: row.finding_id,
    status: row.status,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export class ThreatReviewModel {
  /**
   * Insert a review row for a finding, or update it if one already exists
   * for the same `(job_id, finding_id)` pair.
   */
  static upsert(
    jobId: string,
    findingId: string,
    status: ReviewStatus,
    note?: string | null,
  ): ThreatReview {
    // Insert; on PK conflict (already reviewed), update status + note.
    db.prepare(
      `INSERT INTO threat_reviews (job_id, finding_id, status, note, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(job_id, finding_id) DO UPDATE SET
         status = excluded.status,
         note = excluded.note,
         updated_at = CURRENT_TIMESTAMP`,
    ).run(jobId, findingId, status, note ?? null);

    const row = db
      .prepare(
        `SELECT job_id, finding_id, status, note, updated_at
         FROM threat_reviews WHERE job_id = ? AND finding_id = ?`,
      )
      .get(jobId, findingId) as ThreatReviewRow | undefined;

    return rowToDto(row!);
  }

  /**
   * All review rows for a job, keyed by finding_id. Returns an empty object
   * when the job has no reviews yet.
   */
  static listForJob(jobId: string): Record<string, ThreatReview> {
    const rows = db
      .prepare(
        `SELECT job_id, finding_id, status, note, updated_at
         FROM threat_reviews WHERE job_id = ?`,
      )
      .all(jobId) as ThreatReviewRow[];

    const byFinding: Record<string, ThreatReview> = {};
    for (const row of rows) {
      byFinding[row.finding_id] = rowToDto(row);
    }
    return byFinding;
  }

  /** Delete all review rows for a job (used on job delete, alongside the FK cascade). */
  static deleteForJob(jobId: string): number {
    const result = db.prepare('DELETE FROM threat_reviews WHERE job_id = ?').run(jobId);
    return result.changes;
  }
}
