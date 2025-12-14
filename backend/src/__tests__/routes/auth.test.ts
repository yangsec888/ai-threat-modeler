import request from 'supertest';
import express from 'express';
import { authRoutes } from '../../routes/auth';
import { UserModel } from '../../models/user';
import db from '../../db/database';

// Set JWT_SECRET for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  let testUserId: number;
  let authToken: string;

  beforeAll(async () => {
    // Create a test user
    const user = await UserModel.create('testauth', 'testauth@example.com', 'testpass123');
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test user
    try {
      const stmt = db.prepare('DELETE FROM users WHERE id = ?');
      stmt.run(testUserId);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe('newuser');
      expect(response.body.token).toBeDefined();

      // Clean up
      const user = UserModel.findByUsername('newuser');
      if (user) {
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        stmt.run(user.id);
      }
    });

    it('should reject registration with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'incomplete',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    it('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'shortpass',
          email: 'shortpass@example.com',
          password: '12345',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('6 characters');
    });

    it('should reject duplicate username', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testauth',
          email: 'duplicate@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('Username already exists');
    });

    it('should reject duplicate email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'differentuser',
          email: 'testauth@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('Email already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials (username)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testauth',
          password: 'testpass123',
        });

      // Log response for debugging if test fails
      if (response.status !== 200) {
        console.error('Login failed:', response.status, response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe('testauth');
      expect(response.body.token).toBeDefined();
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
      authToken = response.body.token;
    });

    it('should login with correct credentials (email)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testauth@example.com',
          password: 'testpass123',
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
    });

    it('should reject login with incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testauth',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject login with non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testauth',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should get current user with valid token', async () => {
      // Ensure authToken is set from login test
      if (!authToken) {
        // If login test failed, get a fresh token
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'testauth',
            password: 'testpass123',
          });
        if (loginResponse.status === 200 && loginResponse.body.token) {
          authToken = loginResponse.body.token;
        } else {
          throw new Error('Failed to get auth token for test');
        }
      }

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      // Log response for debugging if test fails
      if (response.status !== 200) {
        console.error('GET /me failed:', response.status, response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe('testauth');
    }, 10000); // Increase timeout

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Access token required');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Invalid or expired token');
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should change password with correct current password', async () => {
      // Ensure authToken is set from login test
      if (!authToken) {
        // If login test failed, get a fresh token
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'testauth',
            password: 'testpass123',
          });
        if (loginResponse.status === 200 && loginResponse.body.token) {
          authToken = loginResponse.body.token;
        } else {
          throw new Error('Failed to get auth token for test');
        }
      }

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'testpass123',
          newPassword: 'newpassword123',
        });

      // Log response for debugging if test fails
      if (response.status !== 200) {
        console.error('Change password failed:', response.status, response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
      expect(response.body.user.password_changed).toBe(true);

      // Verify new password works
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testauth',
          password: 'newpassword123',
        });

      expect(loginResponse.status).toBe(200);

      // Reset password for other tests
      await UserModel.changePassword(testUserId, 'testpass123');
      
      // Small delay to ensure database write completes
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should reject password change with incorrect current password', async () => {
      // Ensure authToken is set from login test
      if (!authToken) {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'testauth',
            password: 'testpass123',
          });
        if (loginResponse.status === 200 && loginResponse.body.token) {
          authToken = loginResponse.body.token;
        }
      }

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('incorrect');
    }, 10000); // Increase timeout to 10 seconds

    it('should reject password change with short new password', async () => {
      // Ensure authToken is set from login test
      if (!authToken) {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'testauth',
            password: 'testpass123',
          });
        if (loginResponse.status === 200 && loginResponse.body.token) {
          authToken = loginResponse.body.token;
        }
      }

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'testpass123',
          newPassword: '12345',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('6 characters');
    });

    it('should reject password change without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'testpass123',
          newPassword: 'newpassword123',
        });

      expect(response.status).toBe(401);
    });
  });
});

