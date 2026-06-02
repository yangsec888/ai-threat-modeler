/**
 * Settings Routes for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { SettingsModel } from '../models/settings';
import type { LlmProvider } from '../db/database';
import logger from '../utils/logger';

const router = Router();

function toPublicSettings(settings: ReturnType<typeof SettingsModel.get>) {
  return {
    encryption_key_configured: settings.encryption_key_configured,
    anthropic_api_key: settings.anthropic_api_key ? '***ENCRYPTED***' : null,
    anthropic_base_url: settings.anthropic_base_url,
    openai_api_key: settings.openai_api_key ? '***ENCRYPTED***' : null,
    openai_base_url: settings.openai_base_url,
    llm_provider: settings.llm_provider,
    claude_model: settings.claude_model,
    openai_model: settings.openai_model,
    claude_code_max_output_tokens: settings.claude_code_max_output_tokens,
    github_max_archive_size_mb: settings.github_max_archive_size_mb,
    updated_at: settings.updated_at,
  };
}

function isValidLlmProvider(value: unknown): value is LlmProvider {
  return value === 'claude' || value === 'codex';
}

async function validateAnthropicApiKey(apiKey: string, baseUrl: string): Promise<{ valid: boolean; message?: string; error?: string }> {
  const response = await fetch(`${baseUrl}/v1/models`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
  });

  if (response.ok) {
    return { valid: true, message: 'API key is valid and working correctly' };
  }
  if (response.status === 401) {
    return { valid: false, error: 'Invalid API key. Please check your API key and try again.' };
  }
  if (response.status === 403) {
    return { valid: false, error: 'API key does not have permission to access this resource.' };
  }
  const errorText = await response.text().catch(() => 'Unknown error');
  return {
    valid: false,
    error: `API validation failed: ${response.status} ${response.statusText}. ${errorText}`,
  };
}

async function validateOpenAiApiKey(apiKey: string, baseUrl: string): Promise<{ valid: boolean; message?: string; error?: string }> {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const response = await fetch(`${normalizedBase}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
  });

  if (response.ok) {
    return { valid: true, message: 'OpenAI API key is valid and working correctly' };
  }
  if (response.status === 401) {
    return { valid: false, error: 'Invalid OpenAI API key. Please check your API key and try again.' };
  }
  if (response.status === 403) {
    return { valid: false, error: 'OpenAI API key does not have permission to access this resource.' };
  }
  const errorText = await response.text().catch(() => 'Unknown error');
  return {
    valid: false,
    error: `OpenAI API validation failed: ${response.status} ${response.statusText}. ${errorText}`,
  };
}

// GET /api/settings - Get current settings
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    
    if (userRole !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const settings = SettingsModel.get(false);
    
    res.json({
      status: 'success',
      settings: toPublicSettings(settings),
    });
  } catch (error: unknown) {
    logger.error('Get settings error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to get settings', message });
  }
});

// PUT /api/settings - Update settings
router.put('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    
    if (userRole !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const {
      encryption_key,
      anthropic_api_key,
      anthropic_base_url,
      openai_api_key,
      openai_base_url,
      llm_provider,
      claude_model,
      openai_model,
      claude_code_max_output_tokens,
      github_max_archive_size_mb,
    } = req.body;
    
    if (encryption_key !== undefined) {
      return res.status(400).json({
        error: 'encryption_key cannot be set via the settings API. Use POST /api/settings/regenerate-encryption-key to rotate.',
      });
    }
    
    const hasUpdate =
      anthropic_api_key !== undefined ||
      anthropic_base_url !== undefined ||
      openai_api_key !== undefined ||
      openai_base_url !== undefined ||
      llm_provider !== undefined ||
      claude_model !== undefined ||
      openai_model !== undefined ||
      claude_code_max_output_tokens !== undefined ||
      github_max_archive_size_mb !== undefined;

    if (!hasUpdate) {
      return res.status(400).json({ error: 'At least one setting must be provided' });
    }
    
    if (anthropic_api_key !== undefined) {
      if (typeof anthropic_api_key !== 'string' || anthropic_api_key.trim().length === 0) {
        return res.status(400).json({ error: 'Anthropic API key must be a non-empty string' });
      }
    }

    if (openai_api_key !== undefined) {
      if (typeof openai_api_key !== 'string' || openai_api_key.trim().length === 0) {
        return res.status(400).json({ error: 'OpenAI API key must be a non-empty string' });
      }
    }
    
    if (anthropic_base_url !== undefined) {
      if (typeof anthropic_base_url !== 'string' || anthropic_base_url.trim().length === 0) {
        return res.status(400).json({ error: 'Anthropic base URL must be a non-empty string' });
      }
    }

    if (openai_base_url !== undefined) {
      if (typeof openai_base_url !== 'string' || openai_base_url.trim().length === 0) {
        return res.status(400).json({ error: 'OpenAI base URL must be a non-empty string' });
      }
    }

    if (llm_provider !== undefined && !isValidLlmProvider(llm_provider)) {
      return res.status(400).json({ error: 'llm_provider must be "claude" or "codex"' });
    }

    if (claude_model !== undefined && claude_model !== null && typeof claude_model !== 'string') {
      return res.status(400).json({ error: 'claude_model must be a string or null' });
    }

    if (openai_model !== undefined) {
      if (typeof openai_model !== 'string' || openai_model.trim().length === 0) {
        return res.status(400).json({ error: 'openai_model must be a non-empty string' });
      }
    }
    
    if (claude_code_max_output_tokens !== undefined) {
      if (claude_code_max_output_tokens !== null) {
        if (typeof claude_code_max_output_tokens !== 'number' || claude_code_max_output_tokens < 1 || claude_code_max_output_tokens > 1000000) {
          return res.status(400).json({ error: 'Claude Code max output tokens must be a number between 1 and 1000000, or null' });
        }
      }
    }
    
    if (github_max_archive_size_mb !== undefined) {
      if (typeof github_max_archive_size_mb !== 'number' || github_max_archive_size_mb < 1 || github_max_archive_size_mb > 5000) {
        return res.status(400).json({ error: 'github_max_archive_size_mb must be a number between 1 and 5000' });
      }
    }
    
    const updatedSettings = SettingsModel.update({
      anthropic_api_key,
      anthropic_base_url,
      openai_api_key,
      openai_base_url,
      llm_provider,
      claude_model,
      openai_model,
      claude_code_max_output_tokens,
      github_max_archive_size_mb,
    });
    
    res.json({
      status: 'success',
      message: 'Settings updated successfully',
      settings: toPublicSettings(updatedSettings),
    });
  } catch (error: unknown) {
    logger.error('Update settings error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to update settings', message });
  }
});

router.post('/regenerate-encryption-key', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    
    if (userRole !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const newEncryptionKey = SettingsModel.regenerateEncryptionKey();
    
    res.json({
      status: 'success',
      message: 'Encryption key regenerated successfully',
      encryption_key: newEncryptionKey,
      warning: 'Please save this encryption key securely. If you lose it, you will not be able to decrypt the API key.',
    });
  } catch (error: unknown) {
    logger.error('Regenerate encryption key error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to regenerate encryption key', message });
  }
});

router.post('/validate-api-key', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    
    if (userRole !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const { api_key, base_url, provider } = req.body;
    const resolvedProvider: LlmProvider = provider === 'codex' ? 'codex' : 'claude';
    
    if (!api_key || typeof api_key !== 'string' || api_key.trim().length === 0) {
      return res.status(400).json({ 
        valid: false,
        error: 'API key is required',
      });
    }
    
    try {
      const result =
        resolvedProvider === 'codex'
          ? await validateOpenAiApiKey(api_key, base_url || 'https://api.openai.com/v1')
          : await validateAnthropicApiKey(api_key, base_url || 'https://api.anthropic.com');
      return res.json(result);
    } catch (fetchError) {
      logger.error('API validation fetch error:', fetchError);
      if (fetchError instanceof Error) {
        if (fetchError.message.includes('fetch') || fetchError.message.includes('network')) {
          return res.json({
            valid: false,
            error: `Network error: Unable to connect to the API. Please check the base URL and your network connection.`,
          });
        }
        return res.json({
          valid: false,
          error: `Validation error: ${fetchError.message}`,
        });
      }
      return res.json({
        valid: false,
        error: 'Unknown error occurred while validating API key',
      });
    }
  } catch (error: unknown) {
    logger.error('Validate API key error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ 
      valid: false,
      error: 'Failed to validate API key', 
      message,
    });
  }
});

export { router as settingsRoutes };
