/**
 * Orchestrate async context extraction for staging rows.
 */

import { SettingsModel } from '../models/settings';
import { ThreatModelingStagingModel } from '../models/threatModelingStaging';
import { runContextExtractor } from './contextExtractorRunner';
import logger from '../utils/logger';

export function getAnthropicSettingsForAgent(): {
  anthropicApiKey: string;
  anthropicBaseUrl: string;
  claudeCodeMaxOutputTokens: number | null;
} {
  const anthropicConfig = SettingsModel.getAnthropicConfig();
  const settings = SettingsModel.get(false);
  return {
    anthropicApiKey: anthropicConfig.apiKey,
    anthropicBaseUrl: anthropicConfig.baseUrl,
    claudeCodeMaxOutputTokens: settings.claude_code_max_output_tokens,
  };
}

export function scheduleStagingExtraction(
  stagingId: string,
  extractedDir: string,
  repoName: string,
  owner: string = 'unknown',
): void {
  const { anthropicApiKey, anthropicBaseUrl, claudeCodeMaxOutputTokens } =
    getAnthropicSettingsForAgent();

  runContextExtractor(
    stagingId,
    extractedDir,
    anthropicApiKey,
    anthropicBaseUrl,
    claudeCodeMaxOutputTokens,
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
