/**
 * Settings Model and Data Access Layer for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import db, { Settings } from '../db/database';
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
  anthropic_base_url: string;
  claude_code_max_output_tokens: number | null;
  github_max_archive_size_mb: number | null;
  updated_at: string;
}

export class SettingsModel {
  /**
   * Get current settings
   * @param includeDecryptedApiKey - If true, decrypts and returns the API key
   */
  static get(includeDecryptedApiKey: boolean = false): SettingsWithoutSensitive {
    const stmt = db.prepare('SELECT * FROM settings WHERE id = 1');
    const settings = stmt.get() as Settings | undefined;
    
    if (!settings) {
      throw new Error('Settings not found');
    }
    
    let decryptedApiKey: string | null = null;
    if (includeDecryptedApiKey && settings.anthropic_api_key) {
      try {
        decryptedApiKey = decrypt(settings.anthropic_api_key, settings.encryption_key);
      } catch (error) {
        logger.error('Failed to decrypt API key:', error);
        throw new Error('Failed to decrypt API key. Encryption key may have changed.');
      }
    }
    
    return {
      encryption_key: settings.encryption_key,
      encryption_key_configured: !!settings.encryption_key && settings.encryption_key.length >= 32,
      anthropic_api_key: decryptedApiKey,
      anthropic_base_url: settings.anthropic_base_url,
      claude_code_max_output_tokens: settings.claude_code_max_output_tokens,
      github_max_archive_size_mb: settings.github_max_archive_size_mb ?? 50,
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

  /**
   * Update encryption key
   * WARNING: This will re-encrypt the API key with the new encryption key
   */
  static updateEncryptionKey(newEncryptionKey: string): void {
    if (!newEncryptionKey || newEncryptionKey.length < 32) {
      throw new Error('Encryption key must be at least 32 characters');
    }

    // Get current settings
    const currentSettings = this.get(true);
    
    // Re-encrypt API key with new encryption key if it exists
    let encryptedApiKey: string | null = null;
    if (currentSettings.anthropic_api_key) {
      encryptedApiKey = encrypt(currentSettings.anthropic_api_key, newEncryptionKey);
    }
    
    // Update settings
    const stmt = db.prepare(`
      UPDATE settings 
      SET encryption_key = ?, 
          anthropic_api_key = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(newEncryptionKey, encryptedApiKey);
  }

  /**
   * Regenerate encryption key automatically
   * Generates a new random 64-character hex key and re-encrypts the API key if it exists
   * @returns The new encryption key (hex string, 64 characters)
   */
  static regenerateEncryptionKey(): string {
    const crypto = require('crypto');
    const newEncryptionKey = crypto.randomBytes(32).toString('hex'); // 32 bytes = 64 hex characters
    
    logger.info('🔄 Regenerating encryption key...');
    
    // Get current settings to check if API key exists
    const currentSettings = this.get(false);
    
    let encryptedApiKey: string | null = null;
    if (currentSettings.anthropic_api_key) {
      // Try to decrypt with old key and re-encrypt with new key
      try {
        const settingsWithKey = this.get(true);
        if (settingsWithKey.anthropic_api_key) {
          encryptedApiKey = encrypt(settingsWithKey.anthropic_api_key, newEncryptionKey);
          logger.info('✅ Re-encrypted API key with new encryption key');
        }
      } catch (error) {
        logger.error('Failed to re-encrypt API key', { error });
        throw new Error('Failed to re-encrypt API key. The existing API key may be corrupted or the encryption key may have changed.');
      }
    } else {
      logger.info('ℹ️  No API key to re-encrypt');
    }
    
    // Update settings with new encryption key
    const stmt = db.prepare(`
      UPDATE settings 
      SET encryption_key = ?, 
          anthropic_api_key = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    
    stmt.run(newEncryptionKey, encryptedApiKey);
    logger.info('✅ Encryption key regenerated successfully');
    
    return newEncryptionKey;
  }

  /**
   * Update Anthropic API key (encrypts before storing)
   */
  static updateAnthropicApiKey(apiKey: string): void {
    const currentSettings = this.get(false);
    
    // Encrypt the API key
    const encryptedApiKey = encrypt(apiKey, currentSettings.encryption_key);
    
    // Update settings
    const stmt = db.prepare(`
      UPDATE settings 
      SET anthropic_api_key = ?,
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
    claude_code_max_output_tokens?: number | null;
    github_max_archive_size_mb?: number;
  }): SettingsWithoutSensitive {
    const currentSettings = this.get(false);
    const oldEncryptionKey = currentSettings.encryption_key;
    
    // Handle encryption key update (requires re-encryption of API key)
    if (updates.encryption_key) {
      if (updates.encryption_key.length < 32) {
        throw new Error('Encryption key must be at least 32 characters');
      }
      
      // Get current API key if it exists (decrypt using OLD key)
      let currentApiKey: string | null = null;
      if (currentSettings.anthropic_api_key) {
        try {
          // Decrypt using the old encryption key
          currentApiKey = decrypt(currentSettings.anthropic_api_key, oldEncryptionKey);
        } catch (error) {
          logger.warn('Could not decrypt existing API key for re-encryption:', error);
          throw new Error('Failed to decrypt existing API key. Cannot update encryption key.');
        }
      }
      
      // Update encryption key first
      const updateKeyStmt = db.prepare(`
        UPDATE settings 
        SET encryption_key = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      updateKeyStmt.run(updates.encryption_key);
      
      // Re-encrypt API key with new key if it exists
      if (currentApiKey) {
        const encryptedApiKey = encrypt(currentApiKey, updates.encryption_key);
        const updateApiKeyStmt = db.prepare(`
          UPDATE settings 
          SET anthropic_api_key = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 1
        `);
        updateApiKeyStmt.run(encryptedApiKey);
      }
    }
    
    // Handle API key update (use current encryption key, which may have been updated above)
    if (updates.anthropic_api_key !== undefined) {
      logger.info(`🔐 Processing API key update (length: ${updates.anthropic_api_key.length})`);
      
      // Validate that API key is not empty
      if (updates.anthropic_api_key.trim().length === 0) {
        logger.error('❌ API key is empty after trim');
        throw new Error('Anthropic API key cannot be empty');
      }
      
      const currentSettingsForEncryption = this.get(false);
      logger.info(`🔑 Encrypting API key using encryption key (length: ${currentSettingsForEncryption.encryption_key.length})`);
      
      const encryptedApiKey = encrypt(updates.anthropic_api_key, currentSettingsForEncryption.encryption_key);
      logger.info(`🔐 Encrypted API key length: ${encryptedApiKey.length}`);
      
      const stmt = db.prepare(`
        UPDATE settings 
        SET anthropic_api_key = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      const result = stmt.run(encryptedApiKey);
      logger.info(`✅ Updated Anthropic API key in database (rows changed: ${result.changes})`);
      
      // Verify it was saved
      const verifyStmt = db.prepare('SELECT anthropic_api_key FROM settings WHERE id = 1');
      const verify = verifyStmt.get() as { anthropic_api_key: string | null } | undefined;
      if (verify && verify.anthropic_api_key) {
        logger.info(`✅ Verified API key saved (encrypted length: ${verify.anthropic_api_key.length})`);
      } else {
        logger.error('❌ ERROR: API key was not saved to database!');
        throw new Error('Failed to save API key to database');
      }
    }
    
    // Handle base URL update
    if (updates.anthropic_base_url !== undefined) {
      this.updateAnthropicBaseUrl(updates.anthropic_base_url);
    }
    
    // Handle Claude Code max output tokens update
    if (updates.claude_code_max_output_tokens !== undefined) {
      this.updateClaudeCodeMaxOutputTokens(updates.claude_code_max_output_tokens);
    }
    
    // Handle GitHub max archive size update
    if (updates.github_max_archive_size_mb !== undefined) {
      const stmt = db.prepare(`
        UPDATE settings
        SET github_max_archive_size_mb = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      stmt.run(updates.github_max_archive_size_mb);
    }
    
    // Return updated settings (with decrypted API key if it was updated)
    return this.get(updates.anthropic_api_key !== undefined);
  }

  /**
   * Get decrypted API key and base URL for use in background jobs
   */
  static getAnthropicConfig(): { apiKey: string; baseUrl: string } {
    try {
      const settings = this.get(true);
      
      if (!settings.anthropic_api_key || settings.anthropic_api_key.trim().length === 0) {
        // Check database directly to see if it's NULL or empty
        const stmt = db.prepare('SELECT anthropic_api_key FROM settings WHERE id = 1');
        const dbSettings = stmt.get() as { anthropic_api_key: string | null } | undefined;
        
        if (!dbSettings || !dbSettings.anthropic_api_key) {
          logger.error('Anthropic API key is NULL or empty in database');
          throw new Error('Anthropic API key not configured in database. Please configure it in the admin settings panel.');
        }
        
        logger.error('❌ Anthropic API key decrypted but is empty');
        throw new Error('Anthropic API key is configured but empty. Please update it in the admin settings panel.');
      }
      
      logger.info('✅ Successfully retrieved Anthropic API configuration from database');
      return {
        apiKey: settings.anthropic_api_key,
        baseUrl: settings.anthropic_base_url,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to decrypt')) {
        logger.error('❌ Failed to decrypt API key:', error.message);
        throw new Error('Failed to decrypt API key. The encryption key may have changed. Please update the API key in the admin settings panel.');
      }
      throw error;
    }
  }
}

