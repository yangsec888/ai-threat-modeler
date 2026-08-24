/**
 * Default Admin User Initialization for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { UserModel } from '../models/user';
import logger from '../utils/logger';

export async function initializeDefaultAdmin() {
  try {
    // Check if admin user already exists
    const existingAdmin = UserModel.findByUsername('admin');
    
    if (existingAdmin) {
      // Self-heal: a fresh-instance bug created the default "admin" user with the
      // role 'Auditor' (UserModel.create defaults the role param to 'Auditor' and
      // the seeder never passed one). Re-promote so the admin account can actually
      // manage settings/users. Bug fix: defaultUser.ts now passes 'Admin' explicitly,
      // but installs created before this fix still need their existing row repaired.
      if (existingAdmin.role !== 'Admin') {
        await UserModel.update(existingAdmin.id, { role: 'Admin' });
        logger.warn(`🔧 Repaired default admin user role (was ${existingAdmin.role}) -> Admin`);
      } else {
        logger.info('✅ Default admin user already exists');
      }
      return;
    }

    // Create default admin user with password_changed = false and role Admin.
    // IMPORTANT: UserModel.create's signature is
    //   create(username, email, password, passwordChanged = true, role = 'Auditor')
    // so the Admin role MUST be passed explicitly -- otherwise the "admin" account
    // is created as an Auditor and cannot modify settings.
    const admin = await UserModel.create('admin', 'admin@localhost', 'admin', false, 'Admin');
    logger.info('✅ Default admin user created successfully');
    logger.info('   Username: admin');
    logger.info('   Password: admin');
    logger.warn('   ⚠️  Please change the default password after first login!');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to create default admin user', { error: message });
  }
}

