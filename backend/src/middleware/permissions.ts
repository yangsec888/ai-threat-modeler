/**
 * Permission Middleware for Role-Based Access Control
 * 
 * Author: Sam Li
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { UserRole } from '../db/database';

/**
 * Middleware to check if user has Admin role
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Middleware to check if user can schedule jobs (Admin or Operator)
 */
export function requireJobScheduling(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'Admin' && req.userRole !== 'Operator') {
    return res.status(403).json({ error: 'Job scheduling requires Admin or Operator role' });
  }
  next();
}

/**
 * Middleware to check if user can view (any authenticated user)
 * This is mainly for consistency, but all authenticated users can view
 */
export function requireView(req: AuthRequest, res: Response, next: NextFunction) {
  // All authenticated users can view
  next();
}

/**
 * Helper function to check if user has a specific role
 */
export function hasRole(userRole: UserRole | undefined, requiredRole: UserRole): boolean {
  if (!userRole) return false;
  
  const roleHierarchy: Record<UserRole, number> = {
    'Auditor': 1,
    'Operator': 2,
    'Admin': 3,
  };
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Helper function to check if user can manage users (only Admin)
 */
export function canManageUsers(userRole: UserRole | undefined): boolean {
  return userRole === 'Admin';
}

/**
 * Helper function to check if user can schedule jobs
 */
export function canScheduleJobs(userRole: UserRole | undefined): boolean {
  return userRole === 'Admin' || userRole === 'Operator';
}

