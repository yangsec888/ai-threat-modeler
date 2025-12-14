/**
 * Authentication Middleware for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

