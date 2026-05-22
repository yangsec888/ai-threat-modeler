/**
 * Threat modeling staging model (context extraction step).
 */

import * as fs from 'fs';
import db, {
  ThreatModelingStaging,
  StagingStatus,
  ThreatModelingJobSourceType,
  ThreatModelingJobGitRefType,
} from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import {
  parseContextFieldsJson,
  serializeContextFields,
  type ContextFields,
} from '../types/contextFields';

const STAGING_TTL_MS = 30 * 60 * 1000;

export interface CreateStagingParams {
  userId: number;
  sourceType: ThreatModelingJobSourceType;
  sourceUrl?: string | null;
  repoName?: string | null;
  gitBranch?: string | null;
  gitCommit?: string | null;
  gitRef?: string | null;
  gitRefType?: ThreatModelingJobGitRefType | null;
  repoPath?: string | null;
  uploadedZipPath?: string | null;
  extractedDir?: string | null;
}

export interface ThreatModelingStagingDto {
  id: string;
  userId: number;
  sourceType: ThreatModelingJobSourceType;
  sourceUrl: string | null;
  repoName: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
  gitRef: string | null;
  gitRefType: ThreatModelingJobGitRefType | null;
  status: StagingStatus;
  draftContextFields: ContextFields | null;
  extractionError: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

function rowToDto(row: ThreatModelingStaging): ThreatModelingStagingDto {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    repoName: row.repo_name,
    gitBranch: row.git_branch,
    gitCommit: row.git_commit,
    gitRef: row.git_ref,
    gitRefType: row.git_ref_type,
    status: row.status,
    draftContextFields: parseContextFieldsJson(row.draft_context_fields),
    extractionError: row.extraction_error,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ThreatModelingStagingModel {
  static create(params: CreateStagingParams): ThreatModelingStaging {
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + STAGING_TTL_MS).toISOString();

    db.prepare(`
      INSERT INTO threat_modeling_stagings (
        id, user_id, source_type, source_url, repo_name,
        git_branch, git_commit, git_ref, git_ref_type,
        repo_path, uploaded_zip_path, extracted_dir,
        status, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id,
      params.userId,
      params.sourceType,
      params.sourceUrl ?? null,
      params.repoName ?? null,
      params.gitBranch ?? null,
      params.gitCommit ?? null,
      params.gitRef ?? null,
      params.gitRefType ?? null,
      params.repoPath ?? null,
      params.uploadedZipPath ?? null,
      params.extractedDir ?? null,
      expiresAt,
    );

    return this.findByIdRaw(id);
  }

  static findByIdRaw(id: string): ThreatModelingStaging {
    const row = db.prepare('SELECT * FROM threat_modeling_stagings WHERE id = ?').get(id) as
      | ThreatModelingStaging
      | undefined;
    if (!row) {
      throw new Error('Staging not found');
    }
    return row;
  }

  static findById(id: string): ThreatModelingStagingDto | null {
    try {
      const row = this.findByIdRaw(id);
      if (this.isExpiredRow(row)) {
        return null;
      }
      return rowToDto(row);
    } catch {
      return null;
    }
  }

  static isExpiredRow(row: ThreatModelingStaging): boolean {
    if (row.status === 'expired') return true;
    const expires = new Date(row.expires_at).getTime();
    return Date.now() > expires;
  }

  static findActiveByUser(userId: number): ThreatModelingStaging | null {
    const row = db
      .prepare(
        `SELECT * FROM threat_modeling_stagings
         WHERE user_id = ? AND status IN ('pending', 'extracting', 'ready', 'failed')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(userId) as ThreatModelingStaging | undefined;
    return row ?? null;
  }

  static updateStatus(id: string, status: StagingStatus, extractionError?: string | null): void {
    if (extractionError !== undefined) {
      db.prepare(
        `UPDATE threat_modeling_stagings SET status = ?, extraction_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(status, extractionError, id);
    } else {
      db.prepare(
        `UPDATE threat_modeling_stagings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(status, id);
    }
  }

  static setDraftFields(id: string, fields: ContextFields, rawJson: string): void {
    db.prepare(
      `UPDATE threat_modeling_stagings
       SET draft_context_fields = ?, extraction_raw = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(serializeContextFields(fields), rawJson, id);
  }

  static markConsumed(id: string): void {
    this.updateStatus(id, 'consumed');
  }

  static markFailed(id: string, error: string): void {
    this.updateStatus(id, 'failed', error);
  }

  static markCancelled(id: string): void {
    this.updateStatus(id, 'cancelled');
  }

  static markExpired(id: string): void {
    this.updateStatus(id, 'expired');
  }

  static setExtractedPaths(
    id: string,
    uploadedZipPath: string,
    extractedDir: string,
  ): void {
    db.prepare(
      `UPDATE threat_modeling_stagings
       SET uploaded_zip_path = ?, extracted_dir = ?, repo_path = ?, status = 'extracting', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(uploadedZipPath, extractedDir, extractedDir, id);
  }

  /**
   * GC: only non-terminal rows older than threshold. Returns rows swept.
   *
   * IMPORTANT: `created_at` is set by SQLite's CURRENT_TIMESTAMP and stored
   * with a space separator (`YYYY-MM-DD HH:MM:SS`), while `expires_at` is
   * inserted from JS as `Date.toISOString()` (`YYYY-MM-DDTHH:MM:SS.sssZ`,
   * with a literal `T`). Plain `<` comparison treats both columns as strings;
   * the `T` (ASCII 84) is greater than space (32), so a fresh row's
   * `created_at` would lexically compare *less than* the cutoff ISO string
   * and every new staging would be GC'd within minutes (regression seen in
   * v1.7.0 dev: rows aged 2 min were being expired against a 30-min TTL).
   * Both sides are now wrapped in SQLite's `datetime(...)` so they're
   * compared as actual datetimes.
   */
  static deleteStale(thresholdMs: number = STAGING_TTL_MS): ThreatModelingStaging[] {
    const cutoff = new Date(Date.now() - thresholdMs).toISOString();
    const rows = db
      .prepare(
        `SELECT * FROM threat_modeling_stagings
         WHERE status IN ('pending', 'extracting', 'ready', 'failed')
         AND (datetime(expires_at) < datetime('now')
              OR datetime(created_at) < datetime(?))`,
      )
      .all(cutoff) as ThreatModelingStaging[];

    for (const row of rows) {
      this.markExpired(row.id);
    }
    return rows;
  }

  static deletePaths(row: ThreatModelingStaging): void {
    if (row.uploaded_zip_path && fs.existsSync(row.uploaded_zip_path)) {
      try {
        fs.unlinkSync(row.uploaded_zip_path);
      } catch {
        /* ignore */
      }
    }
    if (row.extracted_dir && fs.existsSync(row.extracted_dir)) {
      try {
        fs.rmSync(row.extracted_dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}
