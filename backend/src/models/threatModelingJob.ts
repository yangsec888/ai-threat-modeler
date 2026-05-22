/**
 * Threat Modeling Job Model and Data Access Layer
 * 
 * Author: Sam Li
 */

import db, { ThreatModelingJob, ThreatModelingJobSourceType, ThreatModelingJobGitRefType } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import {
  parseContextFieldsJson,
  serializeContextFields,
  type ContextFields,
} from '../types/contextFields';

export interface ThreatModelingJobSourceMeta {
  sourceType?: ThreatModelingJobSourceType | null;
  sourceUrl?: string | null;
  gitRef?: string | null;
  gitRefType?: ThreatModelingJobGitRefType | null;
}

export interface CreateThreatModelingJobParams {
  userId: number;
  repoPath: string;
  query?: string;
  repoName?: string | null;
  gitBranch?: string | null;
  gitCommit?: string | null;
  sourceMeta?: ThreatModelingJobSourceMeta;
  context?: string | null;
  contextFields?: ContextFields | null;
  extractedDir?: string | null;
  uploadedZipPath?: string | null;
}

export interface ThreatModelingJobDto extends ThreatModelingJob {
  contextFields: ContextFields | null;
}

function enrichJob(job: ThreatModelingJob): ThreatModelingJobDto {
  return {
    ...job,
    contextFields: parseContextFieldsJson(job.context_fields),
  };
}

export class ThreatModelingJobModel {
  static create(params: CreateThreatModelingJobParams): ThreatModelingJobDto;
  static create(
    userId: number,
    repoPath: string,
    query?: string,
    repoName?: string | null,
    gitBranch?: string | null,
    gitCommit?: string | null,
    sourceMeta?: ThreatModelingJobSourceMeta,
  ): ThreatModelingJobDto;
  static create(
    paramsOrUserId: CreateThreatModelingJobParams | number,
    repoPath?: string,
    query?: string,
    repoName?: string | null,
    gitBranch?: string | null,
    gitCommit?: string | null,
    sourceMeta?: ThreatModelingJobSourceMeta,
  ): ThreatModelingJobDto {
    const params: CreateThreatModelingJobParams =
      typeof paramsOrUserId === 'number'
        ? {
            userId: paramsOrUserId,
            repoPath: repoPath!,
            query,
            repoName,
            gitBranch,
            gitCommit,
            sourceMeta,
          }
        : paramsOrUserId;
    const jobId = uuidv4();
    const contextFieldsJson = serializeContextFields(params.contextFields);
    const stmt = db.prepare(`
      INSERT INTO threat_modeling_jobs (
        id, user_id, repo_path, query, status,
        repo_name, git_branch, git_commit,
        source_type, source_url, git_ref, git_ref_type,
        context, context_fields, extracted_dir, uploaded_zip_path
      )
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      jobId,
      params.userId,
      params.repoPath,
      params.query || null,
      params.repoName || null,
      params.gitBranch || null,
      params.gitCommit || null,
      params.sourceMeta?.sourceType ?? 'upload',
      params.sourceMeta?.sourceUrl ?? null,
      params.sourceMeta?.gitRef ?? null,
      params.sourceMeta?.gitRefType ?? null,
      params.context ?? null,
      contextFieldsJson,
      params.extractedDir ?? null,
      params.uploadedZipPath ?? null,
    );

    return this.findById(jobId);
  }

  static findById(id: string): ThreatModelingJobDto {
    const stmt = db.prepare('SELECT * FROM threat_modeling_jobs WHERE id = ?');
    const job = stmt.get(id) as ThreatModelingJob | undefined;
    
    if (!job) {
      throw new Error('Job not found');
    }
    
    return enrichJob(job);
  }

  static findByUserId(userId: number, limit: number = 50): ThreatModelingJobDto[] {
    const stmt = db.prepare(`
      SELECT * FROM threat_modeling_jobs 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return (stmt.all(userId, limit) as ThreatModelingJob[]).map(enrichJob);
  }

  static findAllWithUsers(limit: number = 50): Array<ThreatModelingJobDto & { username: string }> {
    const stmt = db.prepare(`
      SELECT tmj.*, u.username 
      FROM threat_modeling_jobs tmj
      LEFT JOIN users u ON tmj.user_id = u.id
      ORDER BY tmj.created_at DESC 
      LIMIT ?
    `);
    return (stmt.all(limit) as Array<ThreatModelingJob & { username: string }>).map((row) => ({
      ...enrichJob(row),
      username: row.username,
    }));
  }

  static updateStatus(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    reportPath?: string | null,
    errorMessage?: string | null,
    dataFlowDiagramPath?: string | null,
    threatModelPath?: string | null,
    riskRegistryPath?: string | null
  ): ThreatModelingJobDto {
    const updates: string[] = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values: unknown[] = [status];

    if (reportPath !== undefined) {
      updates.push('report_path = ?');
      values.push(reportPath);
    }

    if (dataFlowDiagramPath !== undefined) {
      updates.push('data_flow_diagram_path = ?');
      values.push(dataFlowDiagramPath);
    }

    if (threatModelPath !== undefined) {
      updates.push('threat_model_path = ?');
      values.push(threatModelPath);
    }

    if (riskRegistryPath !== undefined) {
      updates.push('risk_registry_path = ?');
      values.push(riskRegistryPath);
    }

    if (errorMessage !== undefined) {
      updates.push('error_message = ?');
      values.push(errorMessage);
    }

    if (status === 'completed' || status === 'failed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    const stmt = db.prepare(`
      UPDATE threat_modeling_jobs 
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...values, id);
    
    return this.findById(id);
  }

  static updateReports(
    id: string,
    dataFlowDiagramPath: string | null,
    threatModelPath: string | null,
    riskRegistryPath: string | null
  ): ThreatModelingJobDto {
    return this.updateStatus(
      id,
      'completed',
      threatModelPath,
      null,
      dataFlowDiagramPath,
      threatModelPath,
      riskRegistryPath
    );
  }

  static updateErrorMessage(id: string, errorMessage: string): ThreatModelingJobDto {
    return this.updateStatus(id, 'failed', null, errorMessage);
  }

  static updateMetadata(id: string, repoName: string | null, gitBranch: string | null, gitCommit: string | null): ThreatModelingJobDto {
    const stmt = db.prepare(`
      UPDATE threat_modeling_jobs 
      SET repo_name = ?, git_branch = ?, git_commit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(repoName, gitBranch, gitCommit, id);
    return this.findById(id);
  }

  static updateExecutionMetrics(id: string, executionDuration: number | null, apiCost: string | null): ThreatModelingJobDto {
    const stmt = db.prepare(`
      UPDATE threat_modeling_jobs 
      SET execution_duration = ?, api_cost = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(executionDuration, apiCost, id);
    return this.findById(id);
  }

  static delete(id: string): void {
    const stmt = db.prepare('DELETE FROM threat_modeling_jobs WHERE id = ?');
    stmt.run(id);
  }
}
