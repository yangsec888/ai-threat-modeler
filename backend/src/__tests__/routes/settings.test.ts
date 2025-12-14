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
      anthropic_api_key: null,
      anthropic_base_url: 'https://api.anthropic.com',
      claude_code_max_output_tokens: null,
      updated_at: '2024-01-01T00:00:00Z',
    });
  });

  describe('GET /api/settings', () => {
    it('should return settings for Admin user', async () => {
      // Mock settings with encrypted API key
      (SettingsModel.get as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        anthropic_api_key: 'encrypted-key-value', // This will be shown as ***ENCRYPTED***
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: 50000,
        updated_at: '2024-01-01T00:00:00Z',
      });

      const response = await request(app)
        .get('/api/settings');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.settings).toBeDefined();
      expect(response.body.settings.encryption_key).toBeDefined();
      // API key should be masked if it exists
      expect(response.body.settings.anthropic_api_key).toBe('***ENCRYPTED***');
      // Claude Code max output tokens should be returned
      expect(response.body.settings.claude_code_max_output_tokens).toBe(50000);
    });

    it('should return null for API key if not configured', async () => {
      // Mock settings without API key
      (SettingsModel.get as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: null,
        updated_at: '2024-01-01T00:00:00Z',
      });

      const response = await request(app)
        .get('/api/settings');

      expect(response.status).toBe(200);
      expect(response.body.settings.anthropic_api_key).toBeNull();
      expect(response.body.settings.claude_code_max_output_tokens).toBeNull();
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
    it('should update encryption key', async () => {
      const newEncryptionKey = 'new-encryption-key-12345678901234567890';
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: newEncryptionKey,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: null,
        updated_at: '2024-01-02T00:00:00Z',
      });

      const response = await request(app)
        .put('/api/settings')
        .send({
          encryption_key: newEncryptionKey,
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(SettingsModel.update).toHaveBeenCalledWith({
        encryption_key: newEncryptionKey,
        anthropic_api_key: undefined,
        anthropic_base_url: undefined,
      });
    });

    it('should update API key', async () => {
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: null,
        updated_at: '2024-01-02T00:00:00Z',
      });

      const response = await request(app)
        .put('/api/settings')
        .send({
          anthropic_api_key: 'sk-test-api-key-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(SettingsModel.update).toHaveBeenCalledWith({
        encryption_key: undefined,
        anthropic_api_key: 'sk-test-api-key-123',
        anthropic_base_url: undefined,
      });
    });

    it('should update base URL', async () => {
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        anthropic_api_key: null,
        anthropic_base_url: 'https://custom-api.anthropic.com',
        claude_code_max_output_tokens: null,
        updated_at: '2024-01-02T00:00:00Z',
      });

      const response = await request(app)
        .put('/api/settings')
        .send({
          anthropic_base_url: 'https://custom-api.anthropic.com',
        });

      expect(response.status).toBe(200);
      expect(SettingsModel.update).toHaveBeenCalledWith({
        encryption_key: undefined,
        anthropic_api_key: undefined,
        anthropic_base_url: 'https://custom-api.anthropic.com',
      });
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

    it('should reject encryption key shorter than 32 characters', async () => {
      const response = await request(app)
        .put('/api/settings')
        .send({
          encryption_key: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('32 characters');
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

  describe('PUT /api/settings - claude_code_max_output_tokens', () => {
    it('should update claude_code_max_output_tokens', async () => {
      (SettingsModel.update as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: 50000,
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
      expect(SettingsModel.update).toHaveBeenCalledWith({
        encryption_key: undefined,
        anthropic_api_key: undefined,
        anthropic_base_url: undefined,
        claude_code_max_output_tokens: 50000,
      });
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
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: null,
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
      expect(SettingsModel.update).toHaveBeenCalledWith({
        encryption_key: undefined,
        anthropic_api_key: undefined,
        anthropic_base_url: undefined,
        claude_code_max_output_tokens: null,
      });
    });

    it('should return claude_code_max_output_tokens in GET response', async () => {
      (SettingsModel.get as jest.Mock).mockReturnValue({
        encryption_key: 'test-encryption-key-12345678901234567890',
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: 75000,
        updated_at: '2024-01-01T00:00:00Z',
      });

      const response = await request(app)
        .get('/api/settings');

      expect(response.status).toBe(200);
      expect(response.body.settings.claude_code_max_output_tokens).toBe(75000);
    });
  });
});

