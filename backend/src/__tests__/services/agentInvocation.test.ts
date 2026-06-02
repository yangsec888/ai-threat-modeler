/**
 * Tests for agent-run invocation builder.
 */

import { buildAgentRunInvocation, CONTEXT_EXTRACTOR_MODEL } from '../../services/agentInvocation';
import type { AgentProviderConfig } from '../../models/settings';

describe('buildAgentRunInvocation', () => {
  const claudeConfig: AgentProviderConfig = {
    provider: 'claude',
    apiKey: 'sk-ant-test',
    baseUrl: 'https://api.anthropic.com',
    model: 'opus',
    claudeCodeMaxOutputTokens: 32000,
  };

  const codexConfig: AgentProviderConfig = {
    provider: 'codex',
    apiKey: 'sk-openai-test',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
    claudeCodeMaxOutputTokens: null,
  };

  it('builds Claude argv and env', () => {
    const { args, env } = buildAgentRunInvocation(claudeConfig, ['-r', 'threat_modeler']);
    expect(args).toEqual([
      '-r', 'threat_modeler',
      '-k', 'sk-ant-test',
      '-u', 'https://api.anthropic.com',
      '-m', 'opus',
    ]);
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('32000');
    expect(args).not.toContain('--provider');
  });

  it('builds Codex argv and env without Anthropic flags', () => {
    const { args, env } = buildAgentRunInvocation(codexConfig, ['-r', 'threat_modeler']);
    expect(args).toEqual([
      '-r', 'threat_modeler',
      '--provider', 'codex',
      '-m', 'gpt-4.1',
    ]);
    expect(env.AGENT_PROVIDER).toBe('codex');
    expect(env.CODEX_API_KEY).toBe('sk-openai-test');
    expect(env.CODEX_BASE_URL).toBe('https://api.openai.com/v1');
    expect(args).not.toContain('-k');
  });

  it('uses modelOverride for context extractor cheap models', () => {
    expect(CONTEXT_EXTRACTOR_MODEL.claude).toBe('haiku');
    expect(CONTEXT_EXTRACTOR_MODEL.codex).toBe('gpt-4.1-mini');

    const { args } = buildAgentRunInvocation(codexConfig, ['-r', 'context_extractor'], {
      modelOverride: CONTEXT_EXTRACTOR_MODEL.codex,
    });
    const modelIdx = args.indexOf('-m');
    expect(args[modelIdx + 1]).toBe('gpt-4.1-mini');
  });
});
