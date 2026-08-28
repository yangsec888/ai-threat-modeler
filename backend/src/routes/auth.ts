/**
 * Authentication Routes for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { UserModel } from '../models/user';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

const router = express.Router();

// SEC (CWE-307): throttle credential-guessing endpoints. Login/register get a
// stricter window than change-password (which already requires a valid token).
// Limits are configurable so the test suite can raise them (brute-force tests
// exercise login far more than a real client would).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH_MAX) || 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

router.use(authLimiter);

// Register new user
router.post('/register', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    if (UserModel.findByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    if (UserModel.findByEmail(email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Create user
    const user = await UserModel.create(username, email, password);
    const token = generateToken(user.id, user.username);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error: unknown) {
    logger.error('Registration error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to create user', message });
  }
});

// Login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user by username or email
    const user = UserModel.findByUsername(username) || UserModel.findByEmail(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await UserModel.verifyPassword(user, password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user.id, user.username);

    // Get user info with password_changed status
    const userInfo = UserModel.findById(user.id);

    res.json({
      message: 'Login successful',
      user: {
        id: userInfo.id,
        username: userInfo.username,
        email: userInfo.email,
        role: userInfo.role,
        password_changed: userInfo.password_changed,
      },
      token,
    });
  } catch (error: unknown) {
    logger.error('Login error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Login failed', message });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // User existence is already validated by authenticateToken middleware
    const user = UserModel.findById(req.userId!);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        password_changed: user.password_changed,
      },
    });
  } catch (error: unknown) {
    logger.error('Get user error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to get user information', message });
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get user with password hash
    const user = UserModel.findByUsername(req.username!);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await UserModel.verifyPassword(user, currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    await UserModel.changePassword(req.userId!, newPassword);

    // Get updated user info
    const updatedUser = UserModel.findById(req.userId!);

    res.json({
      message: 'Password changed successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        password_changed: updatedUser.password_changed,
      },
    });
  } catch (error: unknown) {
    logger.error('Change password error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to change password', message });
  }
});

export const authRoutes = router;

