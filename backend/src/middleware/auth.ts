/**
 * Authentication Middleware for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user';

/**
 * SEC-003: JWT_SECRET must be supplied via environment variable in production.
 * In dev/test we fall back to a fixed string so local workflows and the test
 * suite (which sets process.env.JWT_SECRET in __tests__/setup.ts) keep working.
 *
 * Generate a production secret with: openssl rand -hex 32
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET environment variable is required in production. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  return 'dev-only-secret-do-not-use-in-production';
}

const JWT_SECRET = resolveJwtSecret();

import { UserRole } from '../db/database';

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
  userRole?: UserRole;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    
    // Verify that the user still exists in the database
    // This handles cases where the user was deleted or the database was reset
    try {
      const user = UserModel.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({ 
          error: 'User not found. Your session may have expired. Please login again.',
          code: 'USER_NOT_FOUND'
        });
      }
      
      // Verify username matches (in case user was recreated with same ID but different username)
      if (user.username !== decoded.username) {
        return res.status(401).json({ 
          error: 'Session invalid. Please login again.',
          code: 'USER_MISMATCH'
        });
      }
      
      req.userId = decoded.userId;
      req.username = decoded.username;
      req.userRole = user.role;
      next();
    } catch (userError) {
      // User not found in database
      return res.status(401).json({ 
        error: 'User not found. Your session may have expired. Please login again.',
        code: 'USER_NOT_FOUND'
      });
    }
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
}

