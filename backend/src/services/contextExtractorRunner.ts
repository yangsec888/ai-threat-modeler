/**
 * Run context_extractor agent against a staged repository.
 *
 * Does NOT use ChdirMutex; instead spawns agent-run with `cwd` set to a
 * per-invocation temp directory and passes relative filenames for the
 * --extract-context input and -o output. appsec-agent's CLI rejects
 * absolute paths and traversal segments, so this isolation is required.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { findAgentRunPath } from './agentRunPath';
import { buildExtractionContext } from './extractionContextBuilder';
import { ThreatModelingStagingModel } from '../models/threatModelingStaging';
import { mapExtractorResultToDraft } from '../types/contextFields';
import { awaitAgentChildExit } from '../utils/awaitAgentChildExit';
import { buildAgentRunInvocation, CONTEXT_EXTRACTOR_MODEL } from './agentInvocation';
import type { AgentProviderConfig } from '../models/settings';
import logger from '../utils/logger';

const EXTRACTOR_TIMEOUT_MS = 120_000;

export async function runContextExtractor(
  stagingId: string,
  extractedDir: string,
  providerConfig: AgentProviderConfig,
  repoName: string,
  owner: string = 'unknown',
): Promise<void> {
  const staging = ThreatModelingStagingModel.findByIdRaw(stagingId);
  ThreatModelingStagingModel.updateStatus(stagingId, 'extracting');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-extract-'));
  // appsec-agent rejects absolute paths and traversal segments for both
  // --extract-context and -o, so we spawn the agent with cwd=tempDir and
  // pass plain filenames relative to that directory.
  const contextInputName = 'extraction-context.json';
  const outputName = 'extraction-output.json';
  const contextInputPath = path.join(tempDir, contextInputName);
  const outputPath = path.join(tempDir, outputName);

  try {
    const ctx = buildExtractionContext(extractedDir, repoName, {
      owner,
      gitBranch: staging.git_branch,
      gitCommit: staging.git_commit,
    });
    fs.writeFileSync(contextInputPath, JSON.stringify(ctx, null, 2), 'utf-8');

    const agentRunPath = findAgentRunPath();
    const roleArgs = [
      'node',
      agentRunPath,
      '-r',
      'context_extractor',
      '--extract-context',
      contextInputName,
      '-o',
      outputName,
      '-f',
      'json',
    ];
    const { args: providerArgs, env } = buildAgentRunInvocation(
      providerConfig,
      [],
      { modelOverride: CONTEXT_EXTRACTOR_MODEL[providerConfig.provider] },
    );
    const agentRunCommand = [...roleArgs, ...providerArgs];

    const child = spawn(agentRunCommand[0], agentRunCommand.slice(1), {
      cwd: tempDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (d: string) => {
        stdout += d;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf-8');
      child.stderr.on('data', (d: string) => {
        stderr += d;
      });
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        reject(new Error('Context extractor timed out after 120s'));
      }, EXTRACTOR_TIMEOUT_MS);
    });

    const exitPromise = awaitAgentChildExit(child, stagingId, { graceMs: 5_000 });

    await Promise.race([exitPromise, timeoutPromise]);

    if (!fs.existsSync(outputPath)) {
      const fromStdout = tryParseJson(stdout);
      if (fromStdout) {
        persistExtraction(stagingId, fromStdout, stdout);
        return;
      }
      throw new Error(
        `Context extractor produced no output file. stderr: ${stderr.slice(0, 500)}`,
      );
    }

    const rawText = fs.readFileSync(outputPath, 'utf-8');
    const parsed = tryParseJson(rawText);
    if (!parsed) {
      throw new Error('Context extractor output is not valid JSON');
    }

    persistExtraction(stagingId, parsed, rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('contextExtractor.failed', { stagingId, error: message });
    ThreatModelingStagingModel.markFailed(stagingId, message);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function persistExtraction(
  stagingId: string,
  parsed: Record<string, unknown>,
  rawText: string,
): void {
  const draft = mapExtractorResultToDraft(parsed);
  for (const [key, cap] of Object.entries({
    developer_context: 2000,
    project_summary: 500,
  })) {
    const rawVal = parsed[key];
    if (typeof rawVal === 'string' && rawVal.length > cap) {
      logger.warn('contextExtractor.fieldTruncated', { stagingId, field: key, length: rawVal.length });
    }
  }
  ThreatModelingStagingModel.setDraftFields(stagingId, draft, rawText);
  logger.info('contextExtractor.ready', { stagingId });
}
