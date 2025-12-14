/**
 * Manual cleanup script for orphaned uploaded files
 * Run with: npx ts-node scripts/cleanup-uploads.ts
 * 
 * Author: Sam Li
 */

import { cleanupOrphanedUploads } from '../src/utils/cleanupOrphanedUploads';

console.log('🧹 AI Threat Modeler - Upload Cleanup Utility\n');
console.log('This script will remove orphaned uploaded files and extracted directories.');
console.log('These files are leftovers from interrupted jobs or server crashes.\n');

try {
  cleanupOrphanedUploads();
  console.log('\n✅ Cleanup completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Cleanup failed:', error);
  process.exit(1);
}

