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
};

export function buildAgentRunInvocation(
  config: AgentProviderConfig,
  roleArgs: string[],
  options?: { modelOverride?: string },
): AgentRunInvocation {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const args = [...roleArgs];

  if (config.provider === 'claude') {
    args.push('-k', config.apiKey, '-u', config.baseUrl);
    const model = options?.modelOverride ?? config.model;
    if (model) {
      args.push('-m', model);
    }
    env.ANTHROPIC_API_KEY = config.apiKey;
    if (config.claudeCodeMaxOutputTokens) {
      env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = config.claudeCodeMaxOutputTokens.toString();
    }
  } else {
    const model = options?.modelOverride ?? config.model ?? 'gpt-4.1';
    args.push('--provider', 'codex', '-m', model);
    env.AGENT_PROVIDER = 'codex';
    env.CODEX_API_KEY = config.apiKey;
    if (config.baseUrl) {
      env.CODEX_BASE_URL = config.baseUrl;
    }
  }

  return { args, env };
}
