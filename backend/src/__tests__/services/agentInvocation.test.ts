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
    reasoningEffort: null,
  };

  const codexConfig: AgentProviderConfig = {
    provider: 'codex',
    apiKey: 'sk-openai-test',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
    claudeCodeMaxOutputTokens: null,
    reasoningEffort: null,
  };

  const deepinfraConfig: AgentProviderConfig = {
    provider: 'deepinfra',
    apiKey: 'sk-deepinfra-test',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    model: 'moonshotai/Kimi-K3',
    claudeCodeMaxOutputTokens: null,
    reasoningEffort: 'medium',
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

  it('builds DeepInfra argv and env without Anthropic flags', () => {
    const { args, env } = buildAgentRunInvocation(deepinfraConfig, ['-r', 'threat_modeler']);
    expect(args).toEqual([
      '-r', 'threat_modeler',
      '--provider', 'deepinfra',
      '-m', 'moonshotai/Kimi-K3',
      '--reasoning-effort', 'medium',
    ]);
    expect(env.AGENT_PROVIDER).toBe('deepinfra');
    expect(env.DEEPINFRA_API_KEY).toBe('sk-deepinfra-test');
    expect(env.DEEPINFRA_BASE_URL).toBe('https://api.deepinfra.com/v1/openai');
    expect(args).not.toContain('-k');
    expect(args).not.toContain('-u');
  });

  it('omits --reasoning-effort when none is configured', () => {
    const { args } = buildAgentRunInvocation(
      { ...deepinfraConfig, reasoningEffort: null },
      ['-r', 'threat_modeler'],
    );
    expect(args).not.toContain('--reasoning-effort');
  });

  it('falls back to moonshotai/Kimi-K2.6 when the DeepInfra model is null', () => {
    const { args } = buildAgentRunInvocation(
      { ...deepinfraConfig, model: null },
      ['-r', 'threat_modeler'],
    );
    const modelIdx = args.indexOf('-m');
    expect(args[modelIdx + 1]).toBe('moonshotai/Kimi-K2.6');
  });

  it('uses modelOverride and reasoningEffortOverride for context extractor', () => {
    expect(CONTEXT_EXTRACTOR_MODEL.claude).toBe('haiku');
    expect(CONTEXT_EXTRACTOR_MODEL.codex).toBe('gpt-4.1-mini');
    expect(CONTEXT_EXTRACTOR_MODEL.deepinfra).toBe('deepseek-ai/DeepSeek-V4-Flash');

    const { args } = buildAgentRunInvocation(codexConfig, ['-r', 'context_extractor'], {
      modelOverride: CONTEXT_EXTRACTOR_MODEL.codex,
    });
    const modelIdx = args.indexOf('-m');
    expect(args[modelIdx + 1]).toBe('gpt-4.1-mini');
  });

  it('passes reasoningEffortOverride to the DeepInfra provider', () => {
    const { args } = buildAgentRunInvocation(deepinfraConfig, ['-r', 'context_extractor'], {
      modelOverride: CONTEXT_EXTRACTOR_MODEL.deepinfra,
      reasoningEffortOverride: 'none',
    });
    const modelIdx = args.indexOf('-m');
    expect(args[modelIdx + 1]).toBe('deepseek-ai/DeepSeek-V4-Flash');
    const effortIdx = args.indexOf('--reasoning-effort');
    expect(args[effortIdx + 1]).toBe('none');
  });
});
