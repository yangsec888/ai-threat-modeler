/**
 * User Management Routes for AI Threat Modeler Dashboard
 * Only accessible to Admin users
 * 
 * Author: Sam Li
 */

import express, { Response } from 'express';
import { UserModel } from '../models/user';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/permissions';
import { UserRole } from '../db/database';
import logger from '../utils/logger';

const router = express.Router();

// All routes require authentication and Admin role
router.use(authenticateToken);
router.use(requireAdmin);

// GET /api/users - Get all users
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const users = UserModel.findAll();
    res.json({
      status: 'success',
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        password_changed: user.password_changed,
        created_at: user.created_at,
        updated_at: user.updated_at,
      })),
    });
  } catch (error: unknown) {
    logger.error('Get users error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to get users', message });
  }
});

// GET /api/users/:id - Get a specific user
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = UserModel.findById(userId);
    res.json({
      status: 'success',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        password_changed: user.password_changed,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  } catch (error: unknown) {
    logger.error('Get user error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    
    if (message.includes('not found')) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.status(500).json({ error: 'Failed to get user', message });
  }
});

// POST /api/users - Create a new user
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, role } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Validate role
    const validRoles: UserRole[] = ['Admin', 'Operator', 'Auditor'];
    const userRole: UserRole = validRoles.includes(role) ? role : 'Auditor';

    // Check if user already exists
    if (UserModel.findByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    if (UserModel.findByEmail(email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Create user
    const user = await UserModel.create(username, email, password, true, userRole);

    res.status(201).json({
      status: 'success',
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        password_changed: user.password_changed,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  } catch (error: unknown) {
    logger.error('Create user error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to create user', message });
  }
});

// PUT /api/users/:id - Update a user
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { username, email, role, password } = req.body;

    // Validate role if provided
    let userRole: UserRole | undefined;
    if (role !== undefined) {
      const validRoles: UserRole[] = ['Admin', 'Operator', 'Auditor'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be Admin, Operator, or Auditor' });
      }
      userRole = role;
    }

    // Check if username/email conflicts with existing users
    if (username) {
      const existingUser = UserModel.findByUsername(username);
      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }

    if (email) {
      const existingUser = UserModel.findByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    // Build update object
    const updates: { username?: string; email?: string; role?: UserRole; password?: string } = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (userRole) updates.role = userRole;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }
      updates.password = password;
    }

    // Update user
    const user = await UserModel.update(userId, updates);

    res.json({
      status: 'success',
      message: 'User updated successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        password_changed: user.password_changed,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  } catch (error: unknown) {
    logger.error('Update user error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    
    if (message.includes('not found')) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.status(500).json({ error: 'Failed to update user', message });
  }
});

// DELETE /api/users/:id - Delete a user
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Prevent deleting yourself
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const user = UserModel.findById(userId);
    
    // Delete user
    UserModel.delete(userId);

    res.json({
      status: 'success',
      message: 'User deleted successfully',
    });
  } catch (error: unknown) {
    logger.error('Delete user error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    
    if (message.includes('not found')) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.status(500).json({ error: 'Failed to delete user', message });
  }
});

export const userRoutes = router;

