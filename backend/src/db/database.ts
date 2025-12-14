/**
 * Database Configuration and Schema Management for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

// Use separate test database when running tests to prevent data loss
const isTest = process.env.NODE_ENV === 'test';
const dbFileName = isTest ? 'users.test.db' : 'users.db';
const dbPath = path.join(__dirname, '../../data', dbFileName);
const dbDir = path.dirname(dbPath);

// Safety check: Warn if trying to use production database in test mode
if (isTest && dbFileName === 'users.db') {
  logger.error('⚠️  WARNING: Tests should use users.test.db, not users.db!');
  throw new Error('Test environment detected but using production database. This is a safety check.');
}

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// For test database, ensure it's writable by deleting and recreating if it exists
// This prevents "readonly database" errors in tests
if (isTest && fs.existsSync(dbPath)) {
  try {
    // Close any existing connection first
    // Note: better-sqlite3 doesn't expose close easily, so we'll delete the file
    // The database will be recreated on next access
    fs.unlinkSync(dbPath);
    // Also clean up WAL/SHM files
    const walFile = dbPath + '-wal';
    const shmFile = dbPath + '-shm';
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  } catch (error) {
    // If we can't delete, that's okay - the database might be in use
    // It will be recreated or reused
  }
}

const db = new Database(dbPath);

// Log which database is being used (only in non-test or verbose mode)
if (!isTest) {
  logger.info(`📊 Using database: ${dbPath}`);
}

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create users table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_changed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

// Create threat_modeling_jobs table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS threat_modeling_jobs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    repo_path TEXT NOT NULL,
    query TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    report_path TEXT,
    data_flow_diagram_path TEXT,
    threat_model_path TEXT,
    risk_registry_path TEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_threat_modeling_jobs_user_id ON threat_modeling_jobs(user_id);
  CREATE INDEX IF NOT EXISTS idx_threat_modeling_jobs_status ON threat_modeling_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_threat_modeling_jobs_created_at ON threat_modeling_jobs(created_at);
`);

// Migrate existing table: add new report path columns if they don't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(threat_modeling_jobs)").all() as Array<{ name: string }>;
  const columnNames = tableInfo.map(col => col.name);
  
  if (!columnNames.includes('data_flow_diagram_path')) {
    db.exec(`ALTER TABLE threat_modeling_jobs ADD COLUMN data_flow_diagram_path TEXT`);
    logger.info('✅ Added data_flow_diagram_path column to threat_modeling_jobs table');
  }
  if (!columnNames.includes('threat_model_path')) {
    db.exec(`ALTER TABLE threat_modeling_jobs ADD COLUMN threat_model_path TEXT`);
    logger.info('✅ Added threat_model_path column to threat_modeling_jobs table');
  }
  if (!columnNames.includes('risk_registry_path')) {
    db.exec(`ALTER TABLE threat_modeling_jobs ADD COLUMN risk_registry_path TEXT`);
    logger.info('✅ Added risk_registry_path column to threat_modeling_jobs table');
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.warn('Migration warning', { error: message });
}

// Migrate threat_modeling_jobs: add execution_duration and api_cost columns if they don't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(threat_modeling_jobs)").all() as Array<{ name: string }>;
  const columnNames = tableInfo.map(col => col.name);
  
  if (!columnNames.includes('execution_duration')) {
    db.exec(`ALTER TABLE threat_modeling_jobs ADD COLUMN execution_duration INTEGER`);
    logger.info('✅ Added execution_duration column to threat_modeling_jobs table');
  }
  if (!columnNames.includes('api_cost')) {
    db.exec(`ALTER TABLE threat_modeling_jobs ADD COLUMN api_cost TEXT`);
    logger.info('✅ Added api_cost column to threat_modeling_jobs table');
  }
  if (!columnNames.includes('repo_name')) {
    db.exec(`ALTER TABLE threat_modeling_jobs ADD COLUMN repo_name TEXT`);
    logger.info('✅ Added repo_name column to threat_modeling_jobs table');
  }
  if (!columnNames.includes('git_branch')) {
    db.exec(`ALTER TABLE threat_modeling_jobs ADD COLUMN git_branch TEXT`);
    logger.info('✅ Added git_branch column to threat_modeling_jobs table');
  }
  if (!columnNames.includes('git_commit')) {
    db.exec(`ALTER TABLE threat_modeling_jobs ADD COLUMN git_commit TEXT`);
    logger.info('✅ Added git_commit column to threat_modeling_jobs table');
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.warn('Migration warning', { error: message });
}

// Migrate existing users: add password_changed column if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasPasswordChanged = tableInfo.some(col => col.name === 'password_changed');
  
  if (!hasPasswordChanged) {
    db.exec(`ALTER TABLE users ADD COLUMN password_changed INTEGER DEFAULT 0`);
    logger.info('✅ Added password_changed column to users table');
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.warn('Migration warning', { error: message });
}

// Migrate existing users: add role column if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasRole = tableInfo.some(col => col.name === 'role');
  
  if (!hasRole) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'Auditor'`);
    // Set first user (if exists) as Admin
    const firstUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as { id: number } | undefined;
    if (firstUser) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run('Admin', firstUser.id);
      logger.info(`✅ Set first user (ID: ${firstUser.id}) as Admin`);
    }
    logger.info('✅ Added role column to users table');
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.warn('Migration warning', { error: message });
}

// Create settings table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    encryption_key TEXT NOT NULL,
    anthropic_api_key TEXT,
    anthropic_base_url TEXT DEFAULT 'https://api.anthropic.com',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate settings: add claude_code_max_output_tokens column if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>;
  const columnNames = tableInfo.map(col => col.name);
  
  if (!columnNames.includes('claude_code_max_output_tokens')) {
    db.exec(`ALTER TABLE settings ADD COLUMN claude_code_max_output_tokens INTEGER DEFAULT 32000`);
    logger.info('✅ Added claude_code_max_output_tokens column to settings table');
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.warn('Settings migration warning', { error: message });
}

// Initialize settings with default encryption key if not exists
try {
  const existingSettings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!existingSettings) {
    // Generate a default encryption key (32 bytes = 64 hex characters)
    const crypto = require('crypto');
    const defaultEncryptionKey = crypto.randomBytes(32).toString('hex');
    db.prepare(`
      INSERT INTO settings (id, encryption_key, anthropic_base_url, claude_code_max_output_tokens)
      VALUES (1, ?, ?, 32000)
    `).run(defaultEncryptionKey, 'https://api.anthropic.com');
    logger.info('✅ Initialized settings table with default encryption key');
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.warn('Settings initialization warning', { error: message });
}

export type UserRole = 'Admin' | 'Operator' | 'Auditor';

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  password_changed: number; // 0 = false, 1 = true
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface UserWithoutPassword {
  id: number;
  username: string;
  email: string;
  password_changed: boolean;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface ThreatModelingJob {
  id: string;
  user_id: number;
  repo_path: string;
  query: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  report_path: string | null;
  data_flow_diagram_path: string | null;
  threat_model_path: string | null;
  risk_registry_path: string | null;
  error_message: string | null;
  repo_name: string | null;
  git_branch: string | null;
  git_commit: string | null;
  execution_duration: number | null; // Duration in seconds
  api_cost: string | null; // Cost as string (e.g., "$0.3216")
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Settings {
  id: number;
  encryption_key: string;
  anthropic_api_key: string | null;
  anthropic_base_url: string;
  claude_code_max_output_tokens: number | null;
  created_at: string;
  updated_at: string;
}

export default db;

