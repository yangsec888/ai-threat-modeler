/**
 * Orchestrate async context extraction for staging rows.
 */

import { SettingsModel } from '../models/settings';
import { ThreatModelingStagingModel } from '../models/threatModelingStaging';
import { runContextExtractor } from './contextExtractorRunner';
import logger from '../utils/logger';

export function getAgentSettingsForAgent() {
  return SettingsModel.getAgentProviderConfig();
}

export function scheduleStagingExtraction(
  stagingId: string,
  extractedDir: string,
  repoName: string,
  owner: string = 'unknown',
): void {
  let providerConfig;
  try {
    providerConfig = getAgentSettingsForAgent();
  } catch (err) {
    logger.error('scheduleStagingExtraction.missingProviderConfig', {
      stagingId,
      error: err instanceof Error ? err.message : String(err),
    });
    ThreatModelingStagingModel.markFailed(
      stagingId,
      err instanceof Error ? err.message : 'Agent provider not configured',
    );
    return;
  }

  runContextExtractor(
    stagingId,
    extractedDir,
    providerConfig,
    repoName,
    owner,
  ).catch((err) => {
    logger.error('scheduleStagingExtraction.error', {
      stagingId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      ThreatModelingStagingModel.markFailed(
        stagingId,
        err instanceof Error ? err.message : 'Context extraction failed',
      );
    } catch {
      /* ignore */
    }
  });
}
