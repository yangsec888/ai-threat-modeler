import { generateToken, authenticateToken, AuthRequest } from '../../middleware/auth';
import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../../models/user';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

describe('Auth Middleware', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(1, 'testuser');
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      // Verify token can be decoded
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
      expect(decoded.userId).toBe(1);
      expect(decoded.username).toBe('testuser');
    });

    it('should include userId and username in token', () => {
      const token = generateToken(42, 'admin');
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
      
      expect(decoded.userId).toBe(42);
      expect(decoded.username).toBe('admin');
    });
  });

  describe('authenticateToken', () => {
    let mockRequest: Partial<AuthRequest>;
    let mockResponse: Partial<Response>;
    let mockNext: jest.Mock;
    let testUserId: number;

    beforeEach(async () => {
      // Create a test user for authentication tests
      const testUser = await UserModel.create('testuser', 'test@example.com', 'password123', true);
      testUserId = testUser.id;

      mockRequest = {
        headers: {},
      };
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
    });

    afterEach(() => {
      // Clean up test user
      try {
        const db = require('../../db/database').default;
        const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
        deleteStmt.run(testUserId);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should authenticate valid token', () => {
      const token = generateToken(testUserId, 'testuser');
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticateToken(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.userId).toBe(testUserId);
      expect(mockRequest.username).toBe('testuser');
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject request without token', () => {
      authenticateToken(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      authenticateToken(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with malformed authorization header', () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat',
      };

      authenticateToken(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle token without Bearer prefix', () => {
      const token = generateToken(1, 'testuser');
      mockRequest.headers = {
        authorization: token,
      };

      authenticateToken(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

