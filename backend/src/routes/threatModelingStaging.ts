/**
 * Staging routes for two-step threat modeling with context extraction.
 */

import { Router, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import type { Multer } from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireJobScheduling } from '../middleware/permissions';
import { ThreatModelingStagingModel } from '../models/threatModelingStaging';
import { ThreatModelingJobModel } from '../models/threatModelingJob';
import { extractZip } from '../services/zipExtract';
import { scheduleStagingExtraction } from '../services/stagingOrchestrator';
import { concatContextFields } from '../services/contextConcatenator';
import {
  emptyContextFields,
  listPopulatedContextFieldNames,
  normalizeContextFields,
} from '../types/contextFields';
import logger from '../utils/logger';

export const LEGACY_GONE_BODY = {
  error: 'gone',
  message:
    'POST /api/threat-modeling has been removed. Use POST /api/threat-modeling/stage followed by POST /api/threat-modeling/stage/:id/run.',
  migrate: {
    stage: '/api/threat-modeling/stage',
    run: '/api/threat-modeling/stage/:id/run',
  },
};

function mapStagingResponse(dto: ReturnType<typeof ThreatModelingStagingModel.findById>) {
  if (!dto) return null;
  return {
    stagingId: dto.id,
    status: dto.status,
    draftContextFields: dto.draftContextFields,
    extractionError: dto.extractionError,
    expiresAt: dto.expiresAt,
    sourceType: dto.sourceType,
    repoName: dto.repoName,
    gitBranch: dto.gitBranch,
    gitCommit: dto.gitCommit,
    gitRef: dto.gitRef,
    gitRefType: dto.gitRefType,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function mapJobResponse(job: ReturnType<typeof ThreatModelingJobModel.findById>) {
  return {
    id: job.id,
    status: job.status,
    repoPath: job.repo_path,
    query: job.query,
    repoName: job.repo_name,
    gitBranch: job.git_branch,
    gitCommit: job.git_commit,
    sourceType: job.source_type ?? 'upload',
    sourceUrl: job.source_url,
    gitRef: job.git_ref,
    gitRefType: job.git_ref_type,
    context: job.context,
    contextFields: job.contextFields,
    executionDuration: job.execution_duration,
    apiCost: job.api_cost,
    createdAt: job.created_at,
  };
}

export interface StagingRouteDeps {
  processThreatModelingJob: (
    jobId: string,
    repoPath: string,
    query: string,
    uploadedZipPath?: string,
    extractedDir?: string,
    zipFileName?: string,
  ) => Promise<void>;
}

export function registerThreatModelingStagingRoutes(
  router: Router,
  upload: Multer,
  deps: StagingRouteDeps,
): void {
  const { processThreatModelingJob } = deps;
  router.post(
    '/stage',
    authenticateToken,
    requireJobScheduling,
    upload.single('repository'),
    async (req: AuthRequest, res: Response) => {
      let uploadedZipPath: string | undefined;
      let extractedDir: string | undefined;

      try {
        const userId = req.userId!;
        const { repoName, gitBranch, gitCommit } = req.body;

        if (!req.file) {
          return res.status(400).json({ error: 'Repository ZIP file upload required' });
        }

        uploadedZipPath = req.file.path;
        extractedDir = path.join(
          process.cwd(),
          'uploads',
          'threat-modeling',
          `extracted-staging-${req.file.filename}`,
        );

        await extractZip(uploadedZipPath, extractedDir);

        const detectedName =
          (typeof repoName === 'string' && repoName.trim()) ||
          req.file.originalname.replace(/\.zip$/i, '') ||
          'repo';

        const staging = ThreatModelingStagingModel.create({
          userId,
          sourceType: 'upload',
          repoName: detectedName,
          gitBranch: gitBranch || null,
          gitCommit: gitCommit || null,
          uploadedZipPath,
          extractedDir,
          repoPath: extractedDir,
        });

        scheduleStagingExtraction(staging.id, extractedDir, detectedName, 'unknown');

        return res.status(202).json({
          stagingId: staging.id,
          status: 'pending',
        });
      } catch (error: unknown) {
        logger.error('Staging upload error:', error);
        if (uploadedZipPath && fs.existsSync(uploadedZipPath)) {
          try {
            fs.unlinkSync(uploadedZipPath);
          } catch {
            /* ignore */
          }
        }
        if (extractedDir && fs.existsSync(extractedDir)) {
          try {
            fs.rmSync(extractedDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to stage repository', message });
      }
    },
  );

  router.get('/stage/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const row = ThreatModelingStagingModel.findByIdRaw(req.params.id);
      if (ThreatModelingStagingModel.isExpiredRow(row)) {
        return res.status(404).json({ error: 'Staging session not found or expired' });
      }
      if (row.user_id !== req.userId!) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const dto = ThreatModelingStagingModel.findById(req.params.id);
      return res.json(mapStagingResponse(dto));
    } catch {
      return res.status(404).json({ error: 'Staging session not found or expired' });
    }
  });

  router.post(
    '/stage/:id/run',
    authenticateToken,
    requireJobScheduling,
    async (req: AuthRequest, res: Response) => {
      try {
        const stagingId = req.params.id;
        const userId = req.userId!;

        let row;
        try {
          row = ThreatModelingStagingModel.findByIdRaw(stagingId);
        } catch {
          return res.status(404).json({ error: 'Staging session not found or expired' });
        }

        if (ThreatModelingStagingModel.isExpiredRow(row)) {
          return res.status(404).json({ error: 'Staging session not found or expired' });
        }

        if (row.user_id !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (row.status === 'consumed') {
          return res.status(409).json({ error: 'Staging already consumed' });
        }

        if (row.status !== 'ready' && row.status !== 'failed') {
          return res.status(409).json({
            error: `Cannot run staging in status: ${row.status}`,
          });
        }

        const body = req.body ?? {};
        const rawFields = body.contextFields ?? emptyContextFields();
        let contextFields;
        try {
          contextFields = normalizeContextFields(
            typeof rawFields === 'object' && rawFields !== null
              ? (rawFields as Record<string, unknown>)
              : {},
            { strict: true },
          );
        } catch (validationErr) {
          const message =
            validationErr instanceof Error ? validationErr.message : 'Invalid contextFields';
          return res.status(400).json({ error: message });
        }

        const contextString = concatContextFields(contextFields);
        const extractedDir = row.extracted_dir;
        if (!extractedDir || !fs.existsSync(extractedDir)) {
          return res.status(500).json({ error: 'Staged repository files are missing' });
        }

        const jobRepoPath =
          row.source_type === 'github' && row.source_url
            ? `[GITHUB] ${row.source_url}`
            : `[STAGED] ${row.repo_name ?? 'repository'}`;

        const job = ThreatModelingJobModel.create({
          userId,
          repoPath: jobRepoPath,
          query: 'Perform threat modeling analysis',
          repoName: row.repo_name,
          gitBranch: row.git_branch,
          gitCommit: row.git_commit,
          sourceMeta: {
            sourceType: row.source_type,
            sourceUrl: row.source_url,
            gitRef: row.git_ref,
            gitRefType: row.git_ref_type,
          },
          context: contextString || null,
          contextFields,
          extractedDir,
          uploadedZipPath: row.uploaded_zip_path,
        });

        ThreatModelingStagingModel.markConsumed(stagingId);

        const draft = ThreatModelingStagingModel.findById(stagingId);
        const contextEdited =
          draft?.draftContextFields != null &&
          JSON.stringify(draft.draftContextFields) !== JSON.stringify(contextFields);

        logger.info('staging.run', {
          stagingId,
          jobId: job.id,
          contextProvided: contextString.length > 0,
          contextLength: contextString.length,
          contextFieldsPresent: listPopulatedContextFieldNames(contextFields),
          contextEdited,
        });

        processThreatModelingJob(
          job.id,
          extractedDir,
          job.query || 'Perform threat modeling analysis',
          row.uploaded_zip_path ?? undefined,
          extractedDir,
          `${row.repo_name ?? 'repo'}.zip`,
        ).catch((err) => logger.error('Background job processing error:', err));

        return res.json({
          jobId: job.id,
          job: mapJobResponse(job),
        });
      } catch (error: unknown) {
        logger.error('Staging run error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({ error: 'Failed to start threat modeling job', message });
      }
    },
  );

  router.delete('/stage/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const stagingId = req.params.id;
      let row;
      try {
        row = ThreatModelingStagingModel.findByIdRaw(stagingId);
      } catch {
        return res.status(404).json({ error: 'Staging not found' });
      }

      if (row.user_id !== req.userId!) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (row.status !== 'cancelled') {
        ThreatModelingStagingModel.markCancelled(stagingId);
        ThreatModelingStagingModel.deletePaths(row);
      }

      return res.status(204).send();
    } catch (error: unknown) {
      logger.error('Staging cancel error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'Failed to cancel staging', message });
    }
  });
}
