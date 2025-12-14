/**
 * Threat Modeling Job Model and Data Access Layer
 * 
 * Author: Sam Li
 */

import db, { ThreatModelingJob } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export class ThreatModelingJobModel {
  static create(
    userId: number,
    repoPath: string,
    query?: string,
    repoName?: string | null,
    gitBranch?: string | null,
    gitCommit?: string | null
  ): ThreatModelingJob {
    const jobId = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO threat_modeling_jobs (id, user_id, repo_path, query, status, repo_name, git_branch, git_commit)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `);
    
    stmt.run(jobId, userId, repoPath, query || null, repoName || null, gitBranch || null, gitCommit || null);
    
    return this.findById(jobId);
  }

  static findById(id: string): ThreatModelingJob {
    const stmt = db.prepare('SELECT * FROM threat_modeling_jobs WHERE id = ?');
    const job = stmt.get(id) as ThreatModelingJob | undefined;
    
    if (!job) {
      throw new Error('Job not found');
    }
    
    return job;
  }

  static findByUserId(userId: number, limit: number = 50): ThreatModelingJob[] {
    const stmt = db.prepare(`
      SELECT * FROM threat_modeling_jobs 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(userId, limit) as ThreatModelingJob[];
  }

  static findAllWithUsers(limit: number = 50): Array<ThreatModelingJob & { username: string }> {
    const stmt = db.prepare(`
      SELECT tmj.*, u.username 
      FROM threat_modeling_jobs tmj
      LEFT JOIN users u ON tmj.user_id = u.id
      ORDER BY tmj.created_at DESC 
      LIMIT ?
    `);
    return stmt.all(limit) as Array<ThreatModelingJob & { username: string }>;
  }

  static updateStatus(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    reportPath?: string | null,
    errorMessage?: string | null,
    dataFlowDiagramPath?: string | null,
    threatModelPath?: string | null,
    riskRegistryPath?: string | null
  ): ThreatModelingJob {
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
  ): ThreatModelingJob {
    return this.updateStatus(
      id,
      'completed',
      threatModelPath, // report_path for backward compatibility
      null, // errorMessage
      dataFlowDiagramPath,
      threatModelPath,
      riskRegistryPath
    );
  }

  static updateErrorMessage(id: string, errorMessage: string): ThreatModelingJob {
    return this.updateStatus(id, 'failed', null, errorMessage);
  }

  static updateMetadata(id: string, repoName: string | null, gitBranch: string | null, gitCommit: string | null): ThreatModelingJob {
    const stmt = db.prepare(`
      UPDATE threat_modeling_jobs 
      SET repo_name = ?, git_branch = ?, git_commit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(repoName, gitBranch, gitCommit, id);
    return this.findById(id);
  }

  static updateExecutionMetrics(id: string, executionDuration: number | null, apiCost: string | null): ThreatModelingJob {
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

