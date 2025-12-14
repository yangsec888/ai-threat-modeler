/**
 * User Model and Data Access Layer for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import db, { User, UserWithoutPassword } from '../db/database';
import bcrypt from 'bcrypt';

import { UserRole } from '../db/database';

export class UserModel {
  static async create(username: string, email: string, password: string, passwordChanged: boolean = true, role: UserRole = 'Auditor'): Promise<UserWithoutPassword> {
    const passwordHash = await bcrypt.hash(password, 10);
    
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, password_changed, role)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(username, email, passwordHash, passwordChanged ? 1 : 0, role);
    
    return this.findById(result.lastInsertRowid as number);
  }

  static findById(id: number): UserWithoutPassword {
    const stmt = db.prepare('SELECT id, username, email, password_changed, role, created_at, updated_at FROM users WHERE id = ?');
    const user = stmt.get(id) as User | null;
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password_changed: user.password_changed === 1,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  static findAll(): UserWithoutPassword[] {
    const stmt = db.prepare('SELECT id, username, email, password_changed, role, created_at, updated_at FROM users ORDER BY created_at DESC');
    const users = stmt.all() as User[];
    
    return users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      password_changed: user.password_changed === 1,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
    }));
  }

  static async update(id: number, updates: { username?: string; email?: string; role?: UserRole; password?: string }): Promise<UserWithoutPassword> {
    const updateFields: string[] = [];
    const values: unknown[] = [];

    if (updates.username !== undefined) {
      updateFields.push('username = ?');
      values.push(updates.username);
    }
    if (updates.email !== undefined) {
      updateFields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.role !== undefined) {
      updateFields.push('role = ?');
      values.push(updates.role);
    }
    if (updates.password !== undefined) {
      const passwordHash = await bcrypt.hash(updates.password, 10);
      updateFields.push('password_hash = ?');
      updateFields.push('password_changed = 1');
      values.push(passwordHash);
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...values);
    
    return this.findById(id);
  }

  static delete(id: number): void {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(id);
  }

  static async changePassword(userId: number, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const stmt = db.prepare(`
      UPDATE users 
      SET password_hash = ?, password_changed = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(passwordHash, userId);
  }

  static findByUsername(username: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(username) as User | undefined;
    return user || null;
  }

  static findByEmail(email: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email) as User | undefined;
    return user || null;
  }

  static async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }
}

