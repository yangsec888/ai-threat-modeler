/**
 * Settings Routes for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { SettingsModel } from '../models/settings';
import logger from '../utils/logger';

const router = Router();

// GET /api/settings - Get current settings
// Only Admin can view settings
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    
    // Only Admin can view settings
    if (userRole !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    // Get settings without decrypted API key for security
    const settings = SettingsModel.get(false);
    
    res.json({
      status: 'success',
      settings: {
        encryption_key: settings.encryption_key,
        anthropic_api_key: settings.anthropic_api_key ? '***ENCRYPTED***' : null,
        anthropic_base_url: settings.anthropic_base_url,
        claude_code_max_output_tokens: settings.claude_code_max_output_tokens,
        updated_at: settings.updated_at,
      }
    });
  } catch (error: unknown) {
    logger.error('Get settings error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to get settings', message });
  }
});

// PUT /api/settings - Update settings
// Only Admin can update settings
router.put('/', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    
    // Only Admin can update settings
    if (userRole !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const { encryption_key, anthropic_api_key, anthropic_base_url, claude_code_max_output_tokens } = req.body;
    
    logger.info('📝 Settings update request received:');
    logger.info(`   encryption_key: ${encryption_key !== undefined ? (encryption_key ? `[${encryption_key.length} chars]` : 'empty') : 'undefined'}`);
    logger.info(`   anthropic_api_key: ${anthropic_api_key !== undefined ? (anthropic_api_key ? `[${anthropic_api_key.length} chars]` : 'empty') : 'undefined'}`);
    logger.info(`   anthropic_base_url: ${anthropic_base_url !== undefined ? anthropic_base_url : 'undefined'}`);
    logger.info(`   claude_code_max_output_tokens: ${claude_code_max_output_tokens !== undefined ? claude_code_max_output_tokens : 'undefined'}`);
    
    // Validate that at least one field is provided
    if (encryption_key === undefined && anthropic_api_key === undefined && anthropic_base_url === undefined && claude_code_max_output_tokens === undefined) {
      return res.status(400).json({ error: 'At least one setting must be provided' });
    }
    
    // Validate encryption key if provided
    if (encryption_key !== undefined) {
      if (typeof encryption_key !== 'string' || encryption_key.length < 32) {
        return res.status(400).json({ error: 'Encryption key must be at least 32 characters' });
      }
    }
    
    // Validate API key if provided
    if (anthropic_api_key !== undefined) {
      if (typeof anthropic_api_key !== 'string' || anthropic_api_key.trim().length === 0) {
        return res.status(400).json({ error: 'Anthropic API key must be a non-empty string' });
      }
    }
    
    // Validate base URL if provided
    if (anthropic_base_url !== undefined) {
      if (typeof anthropic_base_url !== 'string' || anthropic_base_url.trim().length === 0) {
        return res.status(400).json({ error: 'Anthropic base URL must be a non-empty string' });
      }
    }
    
    // Validate Claude Code max output tokens if provided
    if (claude_code_max_output_tokens !== undefined) {
      if (claude_code_max_output_tokens !== null) {
        if (typeof claude_code_max_output_tokens !== 'number' || claude_code_max_output_tokens < 1 || claude_code_max_output_tokens > 1000000) {
          return res.status(400).json({ error: 'Claude Code max output tokens must be a number between 1 and 1000000, or null' });
        }
      }
    }
    
    // Update settings
    const updatedSettings = SettingsModel.update({
      encryption_key,
      anthropic_api_key,
      anthropic_base_url,
      claude_code_max_output_tokens,
    });
    
    res.json({
      status: 'success',
      message: 'Settings updated successfully',
      settings: {
        encryption_key: updatedSettings.encryption_key,
        anthropic_api_key: updatedSettings.anthropic_api_key ? '***ENCRYPTED***' : null,
        anthropic_base_url: updatedSettings.anthropic_base_url,
        claude_code_max_output_tokens: updatedSettings.claude_code_max_output_tokens,
        updated_at: updatedSettings.updated_at,
      }
    });
  } catch (error: unknown) {
    logger.error('Update settings error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to update settings', message });
  }
});

// POST /api/settings/regenerate-encryption-key - Regenerate encryption key automatically
// Only Admin can regenerate encryption key
router.post('/regenerate-encryption-key', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    
    // Only Admin can regenerate encryption key
    if (userRole !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    // Regenerate encryption key
    const newEncryptionKey = SettingsModel.regenerateEncryptionKey();
    
    res.json({
      status: 'success',
      message: 'Encryption key regenerated successfully',
      encryption_key: newEncryptionKey,
      warning: 'Please save this encryption key securely. If you lose it, you will not be able to decrypt the API key.'
    });
  } catch (error: unknown) {
    logger.error('Regenerate encryption key error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to regenerate encryption key', message });
  }
});

// POST /api/settings/validate-api-key - Validate Anthropic API key
// Only Admin can validate API key
router.post('/validate-api-key', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    
    // Only Admin can validate API key
    if (userRole !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const { api_key, base_url } = req.body;
    
    if (!api_key || typeof api_key !== 'string' || api_key.trim().length === 0) {
      return res.status(400).json({ 
        valid: false,
        error: 'API key is required' 
      });
    }
    
    const baseUrl = base_url || 'https://api.anthropic.com';
    
    // Make a test API call to validate the key
    // Use the models endpoint which is simpler and doesn't consume tokens
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'x-api-key': api_key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      });
      
      if (response.ok) {
        // API key is valid
        return res.json({
          valid: true,
          message: 'API key is valid and working correctly'
        });
      } else if (response.status === 401) {
        // Unauthorized - invalid API key
        return res.json({
          valid: false,
          error: 'Invalid API key. Please check your API key and try again.'
        });
      } else if (response.status === 403) {
        // Forbidden - API key doesn't have permission
        return res.json({
          valid: false,
          error: 'API key does not have permission to access this resource.'
        });
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        return res.json({
          valid: false,
          error: `API validation failed: ${response.status} ${response.statusText}. ${errorText}`
        });
      }
    } catch (fetchError) {
      logger.error('API validation fetch error:', fetchError);
      if (fetchError instanceof Error) {
        // Check if it's a network error
        if (fetchError.message.includes('fetch') || fetchError.message.includes('network')) {
          return res.json({
            valid: false,
            error: `Network error: Unable to connect to ${baseUrl}. Please check the base URL and your network connection.`
          });
        }
        return res.json({
          valid: false,
          error: `Validation error: ${fetchError.message}`
        });
      }
      return res.json({
        valid: false,
        error: 'Unknown error occurred while validating API key'
      });
    }
  } catch (error: unknown) {
    logger.error('Validate API key error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ 
      valid: false,
      error: 'Failed to validate API key', 
      message 
    });
  }
});

export { router as settingsRoutes };

