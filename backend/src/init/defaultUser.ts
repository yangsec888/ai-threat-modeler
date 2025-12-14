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
      logger.info('✅ Default admin user already exists');
      return;
    }

    // Create default admin user with password_changed = false
    const admin = await UserModel.create('admin', 'admin@localhost', 'admin', false);
    logger.info('✅ Default admin user created successfully');
    logger.info('   Username: admin');
    logger.info('   Password: admin');
    logger.warn('   ⚠️  Please change the default password after first login!');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Failed to create default admin user', { error: message });
  }
}

