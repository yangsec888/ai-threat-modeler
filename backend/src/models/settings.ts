/**
 * Settings Model and Data Access Layer for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import db, { LlmProvider, Settings } from '../db/database';
import { encrypt, decrypt } from '../utils/encryption';
import logger from '../utils/logger';

/**
 * Public-facing settings shape. SEC-009/SEC-015: never expose the encryption
 * key or its length over any API; expose only a configured boolean. The
 * `encryption_key` field is preserved for the existing internal callers
 * (regenerateEncryptionKey, update) but is stripped before being returned to
 * an HTTP handler in routes/settings.ts.
 */
export interface SettingsWithoutSensitive {
  encryption_key: string; // Internal use only; never include in API responses
  encryption_key_configured: boolean; // Safe for API responses
  anthropic_api_key: string | null; // Decrypted API key (only when needed)
  anthropic_api_key_configured: boolean; // Whether a key is stored (no decryption needed)
  anthropic_base_url: string;
  openai_api_key: string | null; // Decrypted API key (only when needed)
  openai_api_key_configured: boolean; // Whether a key is stored (no decryption needed)
  openai_base_url: string;
  deepinfra_api_key: string | null; // Decrypted API key (only when needed)
  deepinfra_api_key_configured: boolean; // Whether a key is stored (no decryption needed)
  deepinfra_base_url: string;
  llm_provider: LlmProvider;
  claude_model: string | null;
  openai_model: string;
  deepinfra_model: string;
  deepinfra_reasoning_effort: DeepInfraReasoningEffort;
  claude_code_max_output_tokens: number | null;
  github_max_archive_size_mb: number | null;
  threat_modeler_max_turns: number | null;
  threat_adversary_enabled: boolean;
  updated_at: string;
}

/** DeepInfra reasoning-effort levels (appsec-agent 4.0.0). */
export type DeepInfraReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export const DEEPINFRA_REASONING_EFFORTS: readonly DeepInfraReasoningEffort[] = [
  'none',
  'low',
  'medium',
  'high',
] as const;

export function isDeepInfraReasoningEffort(value: unknown): value is DeepInfraReasoningEffort {
  return (
    typeof value === 'string' &&
    (DEEPINFRA_REASONING_EFFORTS as readonly string[]).includes(value)
  );
}

export interface AgentProviderConfig {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  /** Resolved model for the active provider; null for Claude means CLI default (opus). */
  model: string | null;
  claudeCodeMaxOutputTokens: number | null;
  /** DeepInfra reasoning effort; null for non-DeepInfra providers. */
  reasoningEffort: DeepInfraReasoningEffort | null;
}

function normalizeLlmProvider(raw: string | null | undefined): LlmProvider {
  const id = (raw ?? 'claude').toLowerCase().trim();
  // Legacy Moonshot instances are coerced to DeepInfra (appsec-agent 4.0.0
  // dropped the direct Moonshot provider). The DB data migration also does
  // this, but coerce defensively here so a stale row never throws.
  if (id === 'moonshot') {
    return 'deepinfra';
  }
  if (id === 'claude' || id === 'codex' || id === 'deepinfra') {
    return id;
  }
  throw new Error(`Invalid llm_provider "${raw}". Valid values: claude, codex, deepinfra`);
}

function normalizeReasoningEffort(raw: string | null | undefined): DeepInfraReasoningEffort {
  const value = (raw ?? 'medium').toLowerCase().trim();
  return isDeepInfraReasoningEffort(value) ? value : 'medium';
}

function decryptStoredApiKey(
  encrypted: string | null,
  encryptionKey: string,
  label: string,
): string | null {
  if (!encrypted) {
    return null;
  }
  try {
    return decrypt(encrypted, encryptionKey);
  } catch (error) {
    logger.error(`Failed to decrypt ${label}:`, error);
    throw new Error(`Failed to decrypt ${label}. Encryption key may have changed.`);
  }
}

export class SettingsModel {
  /**
   * Get current settings
   * @param includeDecryptedApiKey - If true, decrypts and returns API keys
   */
  static get(includeDecryptedApiKey: boolean = false): SettingsWithoutSensitive {
    const stmt = db.prepare('SELECT * FROM settings WHERE id = 1');
    const settings = stmt.get() as Settings | undefined;
    
    if (!settings) {
      throw new Error('Settings not found');
    }

    let decryptedAnthropicKey: string | null = null;
    let decryptedOpenAiKey: string | null = null;
    let decryptedDeepInfraKey: string | null = null;
    if (includeDecryptedApiKey) {
      decryptedAnthropicKey = decryptStoredApiKey(
        settings.anthropic_api_key,
        settings.encryption_key,
        'Anthropic API key',
      );
      decryptedOpenAiKey = decryptStoredApiKey(
        settings.openai_api_key,
        settings.encryption_key,
        'OpenAI API key',
      );
      decryptedDeepInfraKey = decryptStoredApiKey(
        settings.deepinfra_api_key,
        settings.encryption_key,
        'DeepInfra API key',
      );
    }
    
    return {
      encryption_key: settings.encryption_key,
      encryption_key_configured: !!settings.encryption_key && settings.encryption_key.length >= 32,
      anthropic_api_key: decryptedAnthropicKey,
      anthropic_api_key_configured: !!settings.anthropic_api_key,
      anthropic_base_url: settings.anthropic_base_url,
      openai_api_key: decryptedOpenAiKey,
      openai_api_key_configured: !!settings.openai_api_key,
      openai_base_url: settings.openai_base_url ?? 'https://api.openai.com/v1',
      deepinfra_api_key: decryptedDeepInfraKey,
      deepinfra_api_key_configured: !!settings.deepinfra_api_key,
      deepinfra_base_url: settings.deepinfra_base_url ?? 'https://api.deepinfra.com/v1/openai',
      llm_provider: normalizeLlmProvider(settings.llm_provider),
      claude_model: settings.claude_model,
      openai_model: settings.openai_model ?? 'gpt-4.1',
      deepinfra_model: settings.deepinfra_model ?? 'moonshotai/Kimi-K2.6',
      deepinfra_reasoning_effort: normalizeReasoningEffort(settings.deepinfra_reasoning_effort),
      claude_code_max_output_tokens: settings.claude_code_max_output_tokens,
      github_max_archive_size_mb: settings.github_max_archive_size_mb ?? 50,
      threat_modeler_max_turns: settings.threat_modeler_max_turns ?? 100,
      threat_adversary_enabled: (settings.threat_adversary_enabled ?? 1) !== 0,
      updated_at: settings.updated_at,
    };
  }

  /**
   * Internal accessor for the encryption key. Never expose via API.
   * SEC-009: Used by models that need to encrypt/decrypt (Anthropic key,
   * GitHub PAT). Routes must NOT call this directly.
   */
  static getEncryptionKey(): string {
    const stmt = db.prepare('SELECT encryption_key FROM settings WHERE id = 1');
    const row = stmt.get() as { encryption_key: string } | undefined;
    if (!row || !row.encryption_key) {
      throw new Error('Encryption key not found in settings');
    }
    return row.encryption_key;
  }

  /**
   * GitHub archive size cap in MB used by the import pipeline. Defaults to 50.
   */
  static getGitHubMaxArchiveSizeMb(): number {
    const stmt = db.prepare('SELECT github_max_archive_size_mb FROM settings WHERE id = 1');
    const row = stmt.get() as { github_max_archive_size_mb: number | null } | undefined;
    return row?.github_max_archive_size_mb ?? 50;
  }

  static getThreatModelerMaxTurns(): number {
    const stmt = db.prepare('SELECT threat_modeler_max_turns FROM settings WHERE id = 1');
    const row = stmt.get() as { threat_modeler_max_turns: number | null } | undefined;
    return row?.threat_modeler_max_turns ?? 100;
  }

  static getThreatAdversaryEnabled(): boolean {
    const stmt = db.prepare('SELECT threat_adversary_enabled FROM settings WHERE id = 1');
    const row = stmt.get() as { threat_adversary_enabled: number | null } | undefined;
    return (row?.threat_adversary_enabled ?? 1) !== 0;
  }

  private static reEncryptApiKeys(
    newEncryptionKey: string,
    anthropicPlain: string | null,
    openaiPlain: string | null,
    deepinfraPlain: string | null,
  ): { anthropic: string | null; openai: string | null; deepinfra: string | null } {
    return {
      anthropic: anthropicPlain ? encrypt(anthropicPlain, newEncryptionKey) : null,
      openai: openaiPlain ? encrypt(openaiPlain, newEncryptionKey) : null,
      deepinfra: deepinfraPlain ? encrypt(deepinfraPlain, newEncryptionKey) : null,
    };
  }

  /**
   * Update encryption key
   * WARNING: This will re-encrypt API keys with the new encryption key
   */
  static updateEncryptionKey(newEncryptionKey: string): void {
    if (!newEncryptionKey || newEncryptionKey.length < 32) {
      throw new Error('Encryption key must be at least 32 characters');
    }

    const currentSettings = this.get(true);
    const encrypted = this.reEncryptApiKeys(
      newEncryptionKey,
      currentSettings.anthropic_api_key,
      currentSettings.openai_api_key,
      currentSettings.deepinfra_api_key,
    );
    
    const stmt = db.prepare(`
      UPDATE settings 
      SET encryption_key = ?, 
          anthropic_api_key = ?,
          openai_api_key = ?,
          deepinfra_api_key = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(newEncryptionKey, encrypted.anthropic, encrypted.openai, encrypted.deepinfra);
  }

  /**
   * Regenerate encryption key automatically
   * Generates a new random 64-character hex key and re-encrypts API keys if they exist
   * @returns The new encryption key (hex string, 64 characters)
   */
  static regenerateEncryptionKey(): string {
    const crypto = require('crypto');
    const newEncryptionKey = crypto.randomBytes(32).toString('hex');
    
    logger.info('🔄 Regenerating encryption key...');
    
    let anthropicPlain: string | null = null;
    let openaiPlain: string | null = null;
    let deepinfraPlain: string | null = null;
    try {
      const withKeys = this.get(true);
      anthropicPlain = withKeys.anthropic_api_key;
      openaiPlain = withKeys.openai_api_key;
      deepinfraPlain = withKeys.deepinfra_api_key;
      if (anthropicPlain || openaiPlain || deepinfraPlain) {
        logger.info('✅ Re-encrypted API keys with new encryption key');
      } else {
        logger.info('ℹ️  No API keys to re-encrypt');
      }
    } catch (error) {
      logger.error('Failed to re-encrypt API keys', { error });
      throw new Error('Failed to re-encrypt API keys. An existing key may be corrupted or the encryption key may have changed.');
    }

    const encrypted = this.reEncryptApiKeys(newEncryptionKey, anthropicPlain, openaiPlain, deepinfraPlain);
    
    const stmt = db.prepare(`
      UPDATE settings 
      SET encryption_key = ?, 
          anthropic_api_key = ?,
          openai_api_key = ?,
          deepinfra_api_key = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(newEncryptionKey, encrypted.anthropic, encrypted.openai, encrypted.deepinfra);
    logger.info('✅ Encryption key regenerated successfully');
    
    return newEncryptionKey;
  }

  /**
   * Update Anthropic API key (encrypts before storing)
   */
  static updateAnthropicApiKey(apiKey: string): void {
    const currentSettings = this.get(false);
    const encryptedApiKey = encrypt(apiKey, currentSettings.encryption_key);
    
    const stmt = db.prepare(`
      UPDATE settings 
      SET anthropic_api_key = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(encryptedApiKey);
  }

  /**
   * Update OpenAI API key (encrypts before storing)
   */
  static updateOpenAiApiKey(apiKey: string): void {
    const currentSettings = this.get(false);
    const encryptedApiKey = encrypt(apiKey, currentSettings.encryption_key);
    
    const stmt = db.prepare(`
      UPDATE settings 
      SET openai_api_key = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(encryptedApiKey);
  }

  /**
   * Update DeepInfra API key (encrypts before storing)
   */
  static updateDeepInfraApiKey(apiKey: string): void {
    const currentSettings = this.get(false);
    const encryptedApiKey = encrypt(apiKey, currentSettings.encryption_key);
    
    const stmt = db.prepare(`
      UPDATE settings 
      SET deepinfra_api_key = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(encryptedApiKey);
  }

  /**
   * Update Anthropic base URL
   */
  static updateAnthropicBaseUrl(baseUrl: string): void {
    const stmt = db.prepare(`
      UPDATE settings 
      SET anthropic_base_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(baseUrl);
  }

  /**
   * Update OpenAI base URL
   */
  static updateOpenAiBaseUrl(baseUrl: string): void {
    const stmt = db.prepare(`
      UPDATE settings 
      SET openai_base_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(baseUrl);
  }

  /**
   * Update DeepInfra base URL
   */
  static updateDeepInfraBaseUrl(baseUrl: string): void {
    const stmt = db.prepare(`
      UPDATE settings 
      SET deepinfra_base_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(baseUrl);
  }

  /**
   * Update Claude Code max output tokens
   */
  static updateClaudeCodeMaxOutputTokens(maxTokens: number | null): void {
    if (maxTokens !== null && (maxTokens < 1 || maxTokens > 1000000)) {
      throw new Error('Claude Code max output tokens must be between 1 and 1000000');
    }
    
    const stmt = db.prepare(`
      UPDATE settings 
      SET claude_code_max_output_tokens = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(maxTokens);
  }

  /**
   * Update multiple settings at once
   */
  static update(updates: {
    encryption_key?: string;
    anthropic_api_key?: string;
    anthropic_base_url?: string;
    openai_api_key?: string;
    openai_base_url?: string;
    deepinfra_api_key?: string;
    deepinfra_base_url?: string;
    llm_provider?: LlmProvider;
    claude_model?: string | null;
    openai_model?: string;
    deepinfra_model?: string;
    deepinfra_reasoning_effort?: DeepInfraReasoningEffort;
    claude_code_max_output_tokens?: number | null;
    github_max_archive_size_mb?: number;
    threat_modeler_max_turns?: number;
    threat_adversary_enabled?: boolean;
  }): SettingsWithoutSensitive {
    const currentSettings = this.get(false);
    const oldEncryptionKey = currentSettings.encryption_key;
    
    if (updates.encryption_key) {
      if (updates.encryption_key.length < 32) {
        throw new Error('Encryption key must be at least 32 characters');
      }

      const stmtRow = db.prepare('SELECT anthropic_api_key, openai_api_key, deepinfra_api_key FROM settings WHERE id = 1');
      const row = stmtRow.get() as {
        anthropic_api_key: string | null;
        openai_api_key: string | null;
        deepinfra_api_key: string | null;
      } | undefined;

      let anthropicPlain: string | null = null;
      let openaiPlain: string | null = null;
      let deepinfraPlain: string | null = null;
      if (row?.anthropic_api_key) {
        try {
          anthropicPlain = decrypt(row.anthropic_api_key, oldEncryptionKey);
        } catch (error) {
          logger.warn('Could not decrypt existing Anthropic API key for re-encryption:', error);
          throw new Error('Failed to decrypt existing Anthropic API key. Cannot update encryption key.');
        }
      }
      if (row?.openai_api_key) {
        try {
          openaiPlain = decrypt(row.openai_api_key, oldEncryptionKey);
        } catch (error) {
          logger.warn('Could not decrypt existing OpenAI API key for re-encryption:', error);
          throw new Error('Failed to decrypt existing OpenAI API key. Cannot update encryption key.');
        }
      }
      if (row?.deepinfra_api_key) {
        try {
          deepinfraPlain = decrypt(row.deepinfra_api_key, oldEncryptionKey);
        } catch (error) {
          logger.warn('Could not decrypt existing DeepInfra API key for re-encryption:', error);
          throw new Error('Failed to decrypt existing DeepInfra API key. Cannot update encryption key.');
        }
      }

      const updateKeyStmt = db.prepare(`
        UPDATE settings 
        SET encryption_key = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      updateKeyStmt.run(updates.encryption_key);

      const encrypted = this.reEncryptApiKeys(updates.encryption_key, anthropicPlain, openaiPlain, deepinfraPlain);
      if (anthropicPlain) {
        db.prepare(`UPDATE settings SET anthropic_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
          .run(encrypted.anthropic);
      }
      if (openaiPlain) {
        db.prepare(`UPDATE settings SET openai_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
          .run(encrypted.openai);
      }
      if (deepinfraPlain) {
        db.prepare(`UPDATE settings SET deepinfra_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
          .run(encrypted.deepinfra);
      }
    }
    
    if (updates.anthropic_api_key !== undefined) {
      if (updates.anthropic_api_key.trim().length === 0) {
        throw new Error('Anthropic API key cannot be empty');
      }
      this.updateAnthropicApiKey(updates.anthropic_api_key);
    }

    if (updates.openai_api_key !== undefined) {
      if (updates.openai_api_key.trim().length === 0) {
        throw new Error('OpenAI API key cannot be empty');
      }
      this.updateOpenAiApiKey(updates.openai_api_key);
    }

    if (updates.deepinfra_api_key !== undefined) {
      if (updates.deepinfra_api_key.trim().length === 0) {
        throw new Error('DeepInfra API key cannot be empty');
      }
      this.updateDeepInfraApiKey(updates.deepinfra_api_key);
    }
    
    if (updates.anthropic_base_url !== undefined) {
      this.updateAnthropicBaseUrl(updates.anthropic_base_url);
    }

    if (updates.openai_base_url !== undefined) {
      this.updateOpenAiBaseUrl(updates.openai_base_url);
    }

    if (updates.deepinfra_base_url !== undefined) {
      this.updateDeepInfraBaseUrl(updates.deepinfra_base_url);
    }

    if (updates.llm_provider !== undefined) {
      normalizeLlmProvider(updates.llm_provider);
      db.prepare(`
        UPDATE settings SET llm_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
      `).run(updates.llm_provider);
    }

    if (updates.claude_model !== undefined) {
      const value = updates.claude_model?.trim() || null;
      db.prepare(`
        UPDATE settings SET claude_model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
      `).run(value);
    }

    if (updates.openai_model !== undefined) {
      const value = updates.openai_model.trim();
      if (!value) {
        throw new Error('OpenAI model cannot be empty');
      }
      db.prepare(`
        UPDATE settings SET openai_model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
      `).run(value);
    }

    if (updates.deepinfra_model !== undefined) {
      const value = updates.deepinfra_model.trim();
      if (!value) {
        throw new Error('DeepInfra model cannot be empty');
      }
      db.prepare(`
        UPDATE settings SET deepinfra_model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
      `).run(value);
    }

    if (updates.deepinfra_reasoning_effort !== undefined) {
      if (!isDeepInfraReasoningEffort(updates.deepinfra_reasoning_effort)) {
        throw new Error('deepinfra_reasoning_effort must be one of: none, low, medium, high');
      }
      db.prepare(`
        UPDATE settings SET deepinfra_reasoning_effort = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
      `).run(updates.deepinfra_reasoning_effort);
    }
    
    if (updates.claude_code_max_output_tokens !== undefined) {
      this.updateClaudeCodeMaxOutputTokens(updates.claude_code_max_output_tokens);
    }
    
    if (updates.github_max_archive_size_mb !== undefined) {
      db.prepare(`
        UPDATE settings
        SET github_max_archive_size_mb = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(updates.github_max_archive_size_mb);
    }

    if (updates.threat_modeler_max_turns !== undefined) {
      if (
        typeof updates.threat_modeler_max_turns !== 'number' ||
        updates.threat_modeler_max_turns < 1 ||
        updates.threat_modeler_max_turns > 500
      ) {
        throw new Error('threat_modeler_max_turns must be between 1 and 500');
      }
      db.prepare(`
        UPDATE settings
        SET threat_modeler_max_turns = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(updates.threat_modeler_max_turns);
    }

    if (updates.threat_adversary_enabled !== undefined) {
      db.prepare(`
        UPDATE settings
        SET threat_adversary_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(updates.threat_adversary_enabled ? 1 : 0);
    }
    
    return this.get(
      updates.anthropic_api_key !== undefined ||
        updates.openai_api_key !== undefined ||
        updates.deepinfra_api_key !== undefined,
    );
  }

  /**
   * Get decrypted API key and base URL for use in background jobs (Anthropic only).
   * @deprecated Prefer getAgentProviderConfig for agent spawns.
   */
  static getAnthropicConfig(): { apiKey: string; baseUrl: string } {
    try {
      const settings = this.get(true);
      
      if (!settings.anthropic_api_key || settings.anthropic_api_key.trim().length === 0) {
        const stmt = db.prepare('SELECT anthropic_api_key FROM settings WHERE id = 1');
        const dbSettings = stmt.get() as { anthropic_api_key: string | null } | undefined;
        
        if (!dbSettings || !dbSettings.anthropic_api_key) {
          logger.error('Anthropic API key is NULL or empty in database');
          throw new Error('Anthropic API key not configured in database. Please configure it in the admin settings panel.');
        }
        
        throw new Error('Anthropic API key is configured but empty. Please update it in the admin settings panel.');
      }
      
      return {
        apiKey: settings.anthropic_api_key,
        baseUrl: settings.anthropic_base_url,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to decrypt')) {
        throw new Error('Failed to decrypt API key. The encryption key may have changed. Please update the API key in the admin settings panel.');
      }
      throw error;
    }
  }

  /**
   * Resolved provider + credentials for agent-run spawns.
   */
  static getAgentProviderConfig(): AgentProviderConfig {
    const settings = this.get(true);
    const provider = settings.llm_provider;

    if (provider === 'codex') {
      if (!settings.openai_api_key || settings.openai_api_key.trim().length === 0) {
        throw new Error('OpenAI API key not configured. Please configure it in the admin settings panel.');
      }
      return {
        provider: 'codex',
        apiKey: settings.openai_api_key,
        baseUrl: settings.openai_base_url,
        model: settings.openai_model,
        claudeCodeMaxOutputTokens: settings.claude_code_max_output_tokens,
        reasoningEffort: null,
      };
    }

    if (provider === 'deepinfra') {
      if (!settings.deepinfra_api_key || settings.deepinfra_api_key.trim().length === 0) {
        throw new Error('DeepInfra API key not configured. Please configure it in the admin settings panel.');
      }
      return {
        provider: 'deepinfra',
        apiKey: settings.deepinfra_api_key,
        baseUrl: settings.deepinfra_base_url,
        model: settings.deepinfra_model,
        claudeCodeMaxOutputTokens: settings.claude_code_max_output_tokens,
        reasoningEffort: settings.deepinfra_reasoning_effort,
      };
    }

    if (!settings.anthropic_api_key || settings.anthropic_api_key.trim().length === 0) {
      throw new Error('Anthropic API key not configured. Please configure it in the admin settings panel.');
    }

    return {
      provider: 'claude',
      apiKey: settings.anthropic_api_key,
      baseUrl: settings.anthropic_base_url,
      model: settings.claude_model,
      claudeCodeMaxOutputTokens: settings.claude_code_max_output_tokens,
      reasoningEffort: null,
    };
  }
}
