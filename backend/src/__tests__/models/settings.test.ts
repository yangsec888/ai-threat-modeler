/**
 * Tests for Settings Model
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

// Mock database before importing SettingsModel
const mockSettings = {
  id: 1,
  encryption_key: 'test-encryption-key-12345678901234567890',
  anthropic_api_key: null,
  anthropic_base_url: 'https://api.anthropic.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

jest.mock('../../db/database', () => {
  return {
    __esModule: true,
    default: {
      prepare: jest.fn((query: string) => {
        if (query.includes('SELECT * FROM settings')) {
          return {
            get: jest.fn(() => mockSettings),
          };
        }
        if (query.includes('UPDATE settings')) {
          return {
            run: jest.fn(() => ({ changes: 1 })),
          };
        }
        return {
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn(() => []),
        };
      }),
      exec: jest.fn(),
      pragma: jest.fn(),
    },
  };
});

import { SettingsModel } from '../../models/settings';
import { encrypt, decrypt } from '../../utils/encryption';
import db from '../../db/database';

describe('SettingsModel', () => {
  let mockGetStmt: any;
  let mockUpdateStmt: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks for database prepare
    mockGetStmt = {
      get: jest.fn(() => mockSettings),
    };
    mockUpdateStmt = {
      run: jest.fn(() => ({ changes: 1 })),
    };
    
    (db.prepare as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('SELECT * FROM settings')) {
        return mockGetStmt;
      }
      if (query.includes('UPDATE settings')) {
        return mockUpdateStmt;
      }
      return {
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(() => []),
      };
    });
  });

  describe('get', () => {
    it('should return settings without decrypted API key by default', () => {
      const settings = SettingsModel.get();
      
      expect(settings).toBeDefined();
      expect(settings.encryption_key).toBeDefined();
      expect(settings.anthropic_base_url).toBeDefined();
      expect(settings.anthropic_api_key).toBeNull();
    });

    it('should return decrypted API key when includeDecryptedApiKey is true', () => {
      // Mock settings with encrypted API key
      const encryptedApiKey = encrypt('test-api-key', 'test-encryption-key-12345678901234567890');
      const settingsWithKey = {
        ...mockSettings,
        anthropic_api_key: encryptedApiKey,
      };
      
      mockGetStmt.get.mockReturnValue(settingsWithKey);

      const settings = SettingsModel.get(true);
      
      expect(settings.anthropic_api_key).toBe('test-api-key');
    });

    it('should throw error if settings not found', () => {
      mockGetStmt.get.mockReturnValue(undefined);

      expect(() => SettingsModel.get()).toThrow('Settings not found');
    });
  });

  describe('updateAnthropicApiKey', () => {
    it('should encrypt and save API key', () => {
      const apiKey = 'test-api-key-123';
      SettingsModel.updateAnthropicApiKey(apiKey);

      expect(mockUpdateStmt.run).toHaveBeenCalled();
    });
  });

  describe('updateAnthropicBaseUrl', () => {
    it('should update base URL', () => {
      const baseUrl = 'https://custom-api.anthropic.com';
      SettingsModel.updateAnthropicBaseUrl(baseUrl);

      expect(mockUpdateStmt.run).toHaveBeenCalled();
    });
  });

  describe('regenerateEncryptionKey', () => {
    it('should generate a new 64-character hex encryption key', () => {
      // Mock settings without API key
      mockGetStmt.get.mockReturnValue({
        ...mockSettings,
        anthropic_api_key: null,
      });

      const newKey = SettingsModel.regenerateEncryptionKey();
      
      expect(newKey).toBeDefined();
      expect(newKey.length).toBe(64); // 32 bytes = 64 hex characters
      expect(/^[0-9a-f]{64}$/i.test(newKey)).toBe(true);
    });

    it('should re-encrypt API key if it exists', () => {
      // Mock settings with encrypted API key
      const encryptedApiKey = encrypt('test-api-key', 'old-encryption-key-12345678901234567890');
      const settingsWithKey = {
        id: 1,
        encryption_key: 'old-encryption-key-12345678901234567890',
        anthropic_api_key: encryptedApiKey,
        anthropic_base_url: 'https://api.anthropic.com',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // First call (get without decryption) - returns encrypted key
      mockGetStmt.get.mockReturnValueOnce(settingsWithKey);
      // Second call (get with decryption) - returns decrypted key
      mockGetStmt.get.mockReturnValueOnce({
        ...settingsWithKey,
        anthropic_api_key: 'test-api-key', // Decrypted
      });

      const newKey = SettingsModel.regenerateEncryptionKey();
      
      expect(newKey).toBeDefined();
      expect(newKey.length).toBe(64);
      expect(mockUpdateStmt.run).toHaveBeenCalled();
    });
  });

  describe('getAnthropicConfig', () => {
    it('should return API key and base URL', () => {
      // Mock settings with encrypted API key that can be decrypted
      const encryptionKey = 'test-encryption-key-12345678901234567890';
      const encryptedApiKey = encrypt('test-api-key', encryptionKey);
      const settingsWithKey = {
        id: 1,
        encryption_key: encryptionKey,
        anthropic_api_key: encryptedApiKey,
        anthropic_base_url: 'https://api.anthropic.com',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock the database to return encrypted settings
      // When get(true) is called, it will decrypt using the encryption key
      mockGetStmt.get.mockReturnValue(settingsWithKey);

      // Mock the direct DB query for verification in getAnthropicConfig
      const verifyStmt = {
        get: jest.fn(() => ({ anthropic_api_key: encryptedApiKey })),
      };
      
      // Override prepare to return verifyStmt for the verification query
      (db.prepare as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('SELECT anthropic_api_key FROM settings')) {
          return verifyStmt;
        }
        // Return mockGetStmt for SELECT * FROM settings
        if (query.includes('SELECT * FROM settings')) {
          return mockGetStmt;
        }
        return {
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn(() => []),
        };
      });

      const config = SettingsModel.getAnthropicConfig();
      
      expect(config.apiKey).toBe('test-api-key');
      expect(config.baseUrl).toBe('https://api.anthropic.com');
    });

    it('should throw error if API key not configured', () => {
      // First call (get with decryption) - returns null
      mockGetStmt.get.mockReturnValueOnce({
        ...mockSettings,
        anthropic_api_key: null,
      });
      // Second call (direct DB query) - also returns null
      const verifyStmt = {
        get: jest.fn(() => ({ anthropic_api_key: null })),
      };
      (db.prepare as jest.Mock).mockImplementationOnce((query: string) => {
        if (query.includes('SELECT anthropic_api_key')) {
          return verifyStmt;
        }
        return mockGetStmt;
      });

      expect(() => SettingsModel.getAnthropicConfig()).toThrow('Anthropic API key not configured');
    });
  });
});

