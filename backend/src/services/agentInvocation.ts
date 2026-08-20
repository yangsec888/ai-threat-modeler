/**
 * Build agent-run CLI argv and env from admin provider settings.
 *
 * Author: Sam Li
 */

import type { AgentProviderConfig } from '../models/settings';

export interface AgentRunInvocation {
  args: string[];
  env: NodeJS.ProcessEnv;
}

/** Cheap model for context_extractor (tool-less structured JSON transform). */
export const CONTEXT_EXTRACTOR_MODEL: Record<AgentProviderConfig['provider'], string> = {
  claude: 'haiku',
  codex: 'gpt-4.1-mini',
  // DeepInfra's cheapest capable tier. At $0.09/$0.18 per M it is ~8x cheaper
  // than Kimi-K2.6 and carries a 1M context window, which matters because the
  // extraction prompt can reach ~5 MB.
  deepinfra: 'deepseek-ai/DeepSeek-V4-Flash',
};

/**
 * Per-provider wall-clock budget for the tool-less context_extractor call.
 *
 * Claude (`haiku`) and Codex (`gpt-4.1-mini`) are fast, cheap models that finish
 * the transform well under two minutes. DeepInfra's `DeepSeek-V4-Flash` is
 * likewise a mini tier, but its latency on a large (up to 5 MB) extraction
 * prompt can still exceed 120s; keep the wider budget so a healthy run is not
 * killed mid-flight. Overridable globally via `CONTEXT_EXTRACTOR_TIMEOUT_MS`.
 */
export const CONTEXT_EXTRACTOR_TIMEOUT_MS: Record<AgentProviderConfig['provider'], number> = {
  claude: 120_000,
  codex: 120_000,
  deepinfra: 300_000,
};

export function buildAgentRunInvocation(
  config: AgentProviderConfig,
  roleArgs: string[],
  options?: { modelOverride?: string; reasoningEffortOverride?: string },
): AgentRunInvocation {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const args = [...roleArgs];

  switch (config.provider) {
    case 'claude': {
      args.push('-k', config.apiKey, '-u', config.baseUrl);
      const model = options?.modelOverride ?? config.model;
      if (model) {
        args.push('-m', model);
      }
      env.ANTHROPIC_API_KEY = config.apiKey;
      if (config.claudeCodeMaxOutputTokens) {
        env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = config.claudeCodeMaxOutputTokens.toString();
      }
      break;
    }
    case 'codex': {
      const model = options?.modelOverride ?? config.model ?? 'gpt-4.1';
      args.push('--provider', 'codex', '-m', model);
      env.AGENT_PROVIDER = 'codex';
      env.CODEX_API_KEY = config.apiKey;
      if (config.baseUrl) {
        env.CODEX_BASE_URL = config.baseUrl;
      }
      break;
    }
    case 'deepinfra': {
      const model = options?.modelOverride ?? config.model ?? 'moonshotai/Kimi-K2.6';
      args.push('--provider', 'deepinfra', '-m', model);
      const reasoningEffort = options?.reasoningEffortOverride ?? config.reasoningEffort;
      if (reasoningEffort) {
        args.push('--reasoning-effort', reasoningEffort);
      }
      env.AGENT_PROVIDER = 'deepinfra';
      env.DEEPINFRA_API_KEY = config.apiKey;
      if (config.baseUrl) {
        env.DEEPINFRA_BASE_URL = config.baseUrl;
      }
      break;
    }
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unsupported LLM provider: ${String(_exhaustive)}`);
    }
  }

  return { args, env };
}
