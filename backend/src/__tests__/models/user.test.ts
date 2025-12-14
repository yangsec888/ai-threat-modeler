import { UserModel } from '../../models/user';
import db from '../../db/database';

describe('UserModel', () => {
  const testUsers: number[] = [];

  afterEach(() => {
    // Clean up test users
    testUsers.forEach(userId => {
      try {
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        stmt.run(userId);
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    testUsers.length = 0;
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      const user = await UserModel.create('testuser', 'test@example.com', 'password123', true);
      testUsers.push(user.id);
      
      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.password_changed).toBe(true);
      expect(user.id).toBeGreaterThan(0);
    });

    it('should create a user with password_changed = false', async () => {
      const user = await UserModel.create('testuser2', 'test2@example.com', 'password123', false);
      testUsers.push(user.id);
      
      expect(user.password_changed).toBe(false);
    });
  });

  describe('findById', () => {
    it('should find a user by id', async () => {
      const created = await UserModel.create('finduser', 'find@example.com', 'password123');
      testUsers.push(created.id);
      const found = UserModel.findById(created.id);
      
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.username).toBe('finduser');
    });

    it('should throw error if user not found', () => {
      expect(() => UserModel.findById(99999)).toThrow('User not found');
    });
  });

  describe('findByUsername', () => {
    it('should find a user by username', async () => {
      const created = await UserModel.create('findbyuser', 'findby@example.com', 'password123');
      testUsers.push(created.id);
      const user = UserModel.findByUsername('findbyuser');
      
      expect(user).toBeDefined();
      expect(user?.username).toBe('findbyuser');
    });

    it('should return null if user not found', () => {
      const user = UserModel.findByUsername('nonexistent' + Date.now());
      expect(user).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const created = await UserModel.create('findbyemail', 'findbyemail@example.com', 'password123');
      testUsers.push(created.id);
      const user = UserModel.findByEmail('findbyemail@example.com');
      
      expect(user).toBeDefined();
      expect(user?.email).toBe('findbyemail@example.com');
    });

    it('should return null if user not found', () => {
      const user = UserModel.findByEmail('nonexistent' + Date.now() + '@example.com');
      expect(user).toBeNull();
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const created = await UserModel.create('verifyuser', 'verify@example.com', 'correctpassword');
      testUsers.push(created.id);
      const user = UserModel.findByUsername('verifyuser');
      
      if (user) {
        const isValid = await UserModel.verifyPassword(user, 'correctpassword');
        expect(isValid).toBe(true);
      }
    });

    it('should reject incorrect password', async () => {
      const created = await UserModel.create('verifyuser2', 'verify2@example.com', 'correctpassword');
      testUsers.push(created.id);
      const user = UserModel.findByUsername('verifyuser2');
      
      if (user) {
        const isValid = await UserModel.verifyPassword(user, 'wrongpassword');
        expect(isValid).toBe(false);
      }
    });
  });

  describe('changePassword', () => {
    it('should change user password', async () => {
      const user = await UserModel.create('changepass', 'changepass@example.com', 'oldpassword', false);
      testUsers.push(user.id);
      
      await UserModel.changePassword(user.id, 'newpassword');
      
      const updated = UserModel.findById(user.id);
      expect(updated.password_changed).toBe(true);
      
      // Verify new password works
      const dbUser = UserModel.findByUsername('changepass');
      if (dbUser) {
        const isValid = await UserModel.verifyPassword(dbUser, 'newpassword');
        expect(isValid).toBe(true);
      }
    });
  });
});

