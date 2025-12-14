/**
 * Tests for default user initialization
 * 
 * Author: Sam Li
 */

import { initializeDefaultAdmin } from '../../init/defaultUser';
import { UserModel } from '../../models/user';
import db from '../../db/database';

describe('initializeDefaultAdmin', () => {
  beforeEach(() => {
    // Clear database before each test
    const deleteStmt = db.prepare('DELETE FROM users WHERE username = ?');
    deleteStmt.run('admin');
  });

  afterAll(() => {
    // Clean up
    const deleteStmt = db.prepare('DELETE FROM users WHERE username = ?');
    deleteStmt.run('admin');
  });

  it('should create default admin user if it does not exist', async () => {
    await initializeDefaultAdmin();

    const admin = UserModel.findByUsername('admin');
    expect(admin).toBeDefined();
    expect(admin?.username).toBe('admin');
    expect(admin?.email).toBe('admin@localhost');
    expect(admin?.password_changed).toBe(0); // false
  });

  it('should not create admin user if it already exists', async () => {
    // Create admin user first
    await UserModel.create('admin', 'admin@localhost', 'admin', false);

    // Try to initialize again
    await initializeDefaultAdmin();

    // Verify only one admin user exists
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?');
    const result = stmt.get('admin') as { count: number };
    expect(result.count).toBe(1);
  });

  it('should handle errors gracefully when create fails', async () => {
    // Ensure admin doesn't exist first
    const deleteStmt = db.prepare('DELETE FROM users WHERE username = ?');
    deleteStmt.run('admin');

    // Mock UserModel.findByUsername to return null (admin doesn't exist)
    // Then mock UserModel.create to throw an error
    const originalFindByUsername = UserModel.findByUsername;
    const originalCreate = UserModel.create;
    
    UserModel.findByUsername = jest.fn().mockReturnValue(null);
    UserModel.create = jest.fn().mockRejectedValue(new Error('Database error'));

    // Should not throw
    await expect(initializeDefaultAdmin()).resolves.not.toThrow();

    // Restore original methods
    UserModel.findByUsername = originalFindByUsername;
    UserModel.create = originalCreate;
  });
});

