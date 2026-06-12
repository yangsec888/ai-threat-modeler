/**
 * Tests for Settings Routes
 * 
 * Author: Sam Li
 */

// Mock better-sqlite3 before any imports
jest.mock('better-sqlite3', () => {
  const mockDb = {
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(() => []),
    })),
    exec: jest.fn(),
    pragma: jest.fn(),
  };
  return jest.fn(() => mockDb);
});

import request from 'supertest';
import express from 'express';
import { settingsRoutes } from '../../routes/settings';
import { SettingsModel } from '../../models/settings';

// Mock SettingsModel
jest.mock('../../models/settings', () => ({
  SettingsModel: {
    get: jest.fn(),
    update: jest.fn(),
    regenerateEncryptionKey: jest.fn(),
  },
}));

// Mock authenticateToken middleware
jest.mock('../../middleware/auth', () => ({
  authenticateToken: jest.fn((req: any, res: any, next: any) => {
    req.userId = 1;
    req.username = 'testuser';
    req.userRole = 'Admin'; // Default to Admin for tests
    next();
  }),
  AuthRequest: {},
}));

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);

describe('Settings Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for get
    (SettingsModel.get as jest.Mock).mockReturnValue({
      encryption_key: 'test-encryption-key-12345678901234567890',
      encryption_key_configured: true,
      anthropic_api_key: null,
      anthropic_base_url: 'https://api.anthropic.com',
      claude_code_max_output_tokens: null,
      github_max_archive_size_mb: 50,
      updated_at: '2024-01-01T00:00:00Z',
    });
  });

  describe('GET /api/settings', () => {
    it('should return settings for Admin user without exposing encryption key', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        encryption_key_configured: true,
        anthropic_api_key: 'encrypted-key-value',
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: 50000,
        github_max_archive_size_mb: 50,
        updated_at: '2024-01-01T00:00:00Z',
      });

      const response = await request(app)
        .get('/api/settings');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.settings).toBeDefined();
      // SEC-009: encryption_key MUST NOT appear in API responses
      expect(response.body.settings.encryption_key).toBeUndefined();
      expect(response.body.settings.encryption_key_configured).toBe(true);
      expect(response.body.settings.anthropic_api_key).toBe('***ENCRYPTED***');
      expect(response.body.settings.claude_code_max_output_tokens).toBe(50000);
      expect(response.body.settings.github_max_archive_size_mb).toBe(50);
    });

    it('should return null for API key if not configured', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: null,
        github_max_archive_size_mb: 50,
        updated_at: '2024-01-01T00:00:00Z',
      });

      const response = await request(app)
        .get('/api/settings');

      expect(response.status).toBe(200);
      expect(response.body.settings.anthropic_api_key).toBeNull();
      expect(response.body.settings.claude_code_max_output_tokens).toBeNull();
      expect(response.body.settings.encryption_key).toBeUndefined();
    });

    it('should return 403 for non-Admin user', async () => {
      // Mock non-Admin user
      const { authenticateToken } = require('../../middleware/auth');
      authenticateToken.mockImplementationOnce((req: any, res: any, next: any) => {
        req.userId = 1;
        req.userRole = 'Operator';
        next();
      });

      const response = await request(app)
        .get('/api/settings');

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Admin role required');
    });
  });

  describe('PUT /api/settings', () => {
    it('SEC-009: should reject any encryption_key in PUT body', async () => {
      const response = await request(app)
        .put('/api/settings')
        .send({
          encryption_key: 'a'.repeat(64),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/encryption_key cannot be set/i);
      expect(SettingsModel.update).not.toHaveBeenCalled();
    });

    it('should update API key', async () => {
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: null,
        github_max_archive_size_mb: 50,
        updated_at: '2024-01-02T00:00:00Z',
      });

      const response = await request(app)
        .put('/api/settings')
        .send({
          anthropic_api_key: 'sk-test-api-key-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.settings.encryption_key).toBeUndefined();
      expect(SettingsModel.update).toHaveBeenCalledWith(expect.objectContaining({
        anthropic_api_key: 'sk-test-api-key-123',
      }));
    });

    it('should update base URL', async () => {
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://custom-api.anthropic.com',
        claude_code_max_output_tokens: null,
        github_max_archive_size_mb: 50,
        updated_at: '2024-01-02T00:00:00Z',
      });

      const response = await request(app)
        .put('/api/settings')
        .send({
          anthropic_base_url: 'https://custom-api.anthropic.com',
        });

      expect(response.status).toBe(200);
      expect(SettingsModel.update).toHaveBeenCalledWith(expect.objectContaining({
        anthropic_base_url: 'https://custom-api.anthropic.com',
      }));
    });

    it('should reject empty API key', async () => {
      const response = await request(app)
        .put('/api/settings')
        .send({
          anthropic_api_key: '',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('non-empty string');
    });

    it('should accept github_max_archive_size_mb in valid range', async () => {
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: null,
        github_max_archive_size_mb: 100,
        updated_at: '2024-01-02T00:00:00Z',
      });
      const response = await request(app)
        .put('/api/settings')
        .send({ github_max_archive_size_mb: 100 });
      expect(response.status).toBe(200);
      expect(response.body.settings.github_max_archive_size_mb).toBe(100);
    });

    it('should reject github_max_archive_size_mb out of range', async () => {
      const response = await request(app)
        .put('/api/settings')
        .send({ github_max_archive_size_mb: 999999 });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/github_max_archive_size_mb/);
    });

    it('should return 403 for non-Admin user', async () => {
      // Mock non-Admin user
      const { authenticateToken } = require('../../middleware/auth');
      authenticateToken.mockImplementationOnce((req: any, res: any, next: any) => {
        req.userId = 1;
        req.userRole = 'Operator';
        next();
      });

      const response = await request(app)
        .put('/api/settings')
        .send({
          anthropic_base_url: 'https://api.anthropic.com',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Admin role required');
    });
  });

  describe('POST /api/settings/regenerate-encryption-key', () => {
    it('should regenerate encryption key for Admin user', async () => {
      const newKey = 'a'.repeat(64); // 64 hex characters
      (SettingsModel.regenerateEncryptionKey as jest.Mock).mockReturnValue(newKey);

      const response = await request(app)
        .post('/api/settings/regenerate-encryption-key');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.encryption_key).toBe(newKey);
      expect(response.body.warning).toBeDefined();
      expect(SettingsModel.regenerateEncryptionKey).toHaveBeenCalled();
    });

    it('should return 403 for non-Admin user', async () => {
      // Mock non-Admin user
      const { authenticateToken } = require('../../middleware/auth');
      authenticateToken.mockImplementationOnce((req: any, res: any, next: any) => {
        req.userId = 1;
        req.userRole = 'Operator';
        next();
      });

      const response = await request(app)
        .post('/api/settings/regenerate-encryption-key');

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Admin role required');
    });
  });

  describe('POST /api/settings/validate-api-key', () => {
    // Mock fetch globally
    const originalFetch = global.fetch;
    
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should validate valid API key', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const response = await request(app)
        .post('/api/settings/validate-api-key')
        .send({
          api_key: 'sk-test-api-key-123',
          base_url: 'https://api.anthropic.com',
        });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.message).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-api-key': 'sk-test-api-key-123',
          }),
        })
      );
    });

    it('should reject invalid API key', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const response = await request(app)
        .post('/api/settings/validate-api-key')
        .send({
          api_key: 'invalid-key',
        });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('Invalid API key');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/settings/validate-api-key')
        .send({
          api_key: 'sk-test-api-key-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return 400 if API key is missing', async () => {
      const response = await request(app)
        .post('/api/settings/validate-api-key')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should return 403 for non-Admin user', async () => {
      // Mock non-Admin user
      const { authenticateToken } = require('../../middleware/auth');
      authenticateToken.mockImplementationOnce((req: any, res: any, next: any) => {
        req.userId = 1;
        req.userRole = 'Operator';
        next();
      });

      const response = await request(app)
        .post('/api/settings/validate-api-key')
        .send({
          api_key: 'sk-test-api-key-123',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Admin role required');
    });
  });

  describe('GET /api/settings/models', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    const baseSettings = {
      encryption_key: 'test-encryption-key-12345678901234567890',
      encryption_key_configured: true,
      anthropic_api_key: null as string | null,
      anthropic_base_url: 'https://api.anthropic.com',
      openai_api_key: null as string | null,
      openai_base_url: 'https://api.openai.com/v1',
      llm_provider: 'claude',
      claude_model: null,
      openai_model: 'gpt-4.1',
      claude_code_max_output_tokens: null,
      github_max_archive_size_mb: 50,
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('lists Anthropic models (id + display_name) using the stored key', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        ...baseSettings,
        llm_provider: 'claude',
        anthropic_api_key: 'sk-ant-123',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          data: [
            { id: 'claude-opus-4-20250514', display_name: 'Claude Opus 4' },
            { id: 'claude-haiku', display_name: undefined },
          ],
        }),
      });

      const response = await request(app).get('/api/settings/models?provider=claude');

      expect(response.status).toBe(200);
      expect(response.body.provider).toBe('claude');
      expect(response.body.models).toEqual([
        { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
        { id: 'claude-haiku', label: 'claude-haiku' },
      ]);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models?limit=1000',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-api-key': 'sk-ant-123' }),
        }),
      );
    });

    it('lists OpenAI models filtered to chat-capable ids and sorted', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        ...baseSettings,
        llm_provider: 'codex',
        openai_api_key: 'sk-oai-123',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          data: [
            { id: 'whisper-1' },
            { id: 'gpt-4.1-mini' },
            { id: 'text-embedding-3-large' },
            { id: 'gpt-4.1' },
            { id: 'o3' },
          ],
        }),
      });

      const response = await request(app).get('/api/settings/models?provider=codex');

      expect(response.status).toBe(200);
      expect(response.body.provider).toBe('codex');
      expect(response.body.models.map((m: { id: string }) => m.id)).toEqual([
        'gpt-4.1',
        'gpt-4.1-mini',
        'o3',
      ]);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer sk-oai-123' }),
        }),
      );
    });

    it('defaults to the active provider when none is requested', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        ...baseSettings,
        llm_provider: 'codex',
        openai_api_key: 'sk-oai-123',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: [{ id: 'gpt-4.1' }] }),
      });

      const response = await request(app).get('/api/settings/models');

      expect(response.status).toBe(200);
      expect(response.body.provider).toBe('codex');
    });

    it('returns 400 when the requested provider key is not configured', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        ...baseSettings,
        llm_provider: 'codex',
        openai_api_key: null,
      });

      const response = await request(app).get('/api/settings/models?provider=codex');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/OpenAI API key not configured/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns 502 when the provider models API fails', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        ...baseSettings,
        llm_provider: 'claude',
        anthropic_api_key: 'sk-ant-123',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'upstream boom',
      });

      const response = await request(app).get('/api/settings/models?provider=claude');

      expect(response.status).toBe(502);
      expect(response.body.error).toMatch(/Failed to load models/i);
    });

    it('returns 403 for non-Admin user', async () => {
      const { authenticateToken } = require('../../middleware/auth');
      authenticateToken.mockImplementationOnce((req: any, res: any, next: any) => {
        req.userId = 1;
        req.userRole = 'Operator';
        next();
      });

      const response = await request(app).get('/api/settings/models?provider=claude');

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Admin role required');
    });
  });

  describe('PUT /api/settings - claude_code_max_output_tokens', () => {
    it('should update claude_code_max_output_tokens', async () => {
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: 50000,
        github_max_archive_size_mb: 50,
        updated_at: '2024-01-02T00:00:00Z',
      });

      const response = await request(app)
        .put('/api/settings')
        .send({
          claude_code_max_output_tokens: 50000,
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.settings.claude_code_max_output_tokens).toBe(50000);
      expect(SettingsModel.update).toHaveBeenCalledWith(expect.objectContaining({
        claude_code_max_output_tokens: 50000,
      }));
    });

    it('should reject claude_code_max_output_tokens less than 1', async () => {
      const response = await request(app)
        .put('/api/settings')
        .send({
          claude_code_max_output_tokens: 0,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('between 1 and 1000000');
    });

    it('should reject claude_code_max_output_tokens greater than 1000000', async () => {
      const response = await request(app)
        .put('/api/settings')
        .send({
          claude_code_max_output_tokens: 1000001,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('between 1 and 1000000');
    });

    it('should accept null for claude_code_max_output_tokens', async () => {
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: null,
        github_max_archive_size_mb: 50,
        updated_at: '2024-01-02T00:00:00Z',
      });

      const response = await request(app)
        .put('/api/settings')
        .send({
          claude_code_max_output_tokens: null,
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.settings.claude_code_max_output_tokens).toBeNull();
      expect(SettingsModel.update).toHaveBeenCalledWith(expect.objectContaining({
        claude_code_max_output_tokens: null,
      }));
    });

    it('should return claude_code_max_output_tokens in GET response', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: 75000,
        github_max_archive_size_mb: 50,
        updated_at: '2024-01-01T00:00:00Z',
      });

      const response = await request(app)
        .get('/api/settings');

      expect(response.status).toBe(200);
      expect(response.body.settings.claude_code_max_output_tokens).toBe(75000);
    });
  });
});

