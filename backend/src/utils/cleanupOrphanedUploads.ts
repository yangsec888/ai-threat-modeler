/**
 * Cleanup orphaned uploaded files and extracted directories
 * 
 * Author: Sam Li
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

/**
 * Clean up orphaned uploaded files and extracted directories
 * that were left behind due to server crashes or incomplete jobs
 */
export function cleanupOrphanedUploads(): void {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  
  if (!fs.existsSync(uploadsDir)) {
    logger.info('📁 Uploads directory does not exist, skipping cleanup');
    return;
  }

  logger.info('🧹 Starting cleanup of orphaned uploaded files...');
  
  const subdirs = ['threat-modeling'];
  let totalFilesRemoved = 0;
  let totalDirsRemoved = 0;
  let totalBytesFreed = 0;

  for (const subdir of subdirs) {
    const subdirPath = path.join(uploadsDir, subdir);
    
    if (!fs.existsSync(subdirPath)) {
      logger.info(`📁 ${subdir} directory does not exist, skipping`);
      continue;
    }

    try {
      const entries = fs.readdirSync(subdirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(subdirPath, entry.name);
        
        try {
          if (entry.isDirectory()) {
            // Remove extracted directories (they start with 'extracted-')
            if (entry.name.startsWith('extracted-')) {
              const stats = getDirectorySize(fullPath);
              fs.rmSync(fullPath, { recursive: true, force: true });
              totalDirsRemoved++;
              totalBytesFreed += stats.size;
              logger.info(`   ✅ Removed extracted directory: ${entry.name} (${formatBytes(stats.size)})`);
            }
          } else if (entry.isFile()) {
            // Remove uploaded ZIP files (they have hash filenames without extensions)
            // These are multer's uploaded files with random hash names
            if (!entry.name.includes('.') || entry.name.match(/^[a-f0-9]{32}$/)) {
              const stats = fs.statSync(fullPath);
              fs.unlinkSync(fullPath);
              totalFilesRemoved++;
              totalBytesFreed += stats.size;
              logger.info(`   ✅ Removed uploaded file: ${entry.name} (${formatBytes(stats.size)})`);
            }
          }
        } catch (error) {
          logger.error(`   ⚠️  Failed to remove ${entry.name}:`, error);
        }
      }
    } catch (error) {
      logger.error(`⚠️  Error reading ${subdir} directory:`, error);
    }
  }

  // Also clean up the root uploads directory (old files before subdirectories were added)
  try {
    const rootEntries = fs.readdirSync(uploadsDir, { withFileTypes: true });
    for (const entry of rootEntries) {
      // Skip subdirectories
      if (subdirs.includes(entry.name)) {
        continue;
      }
      
      const fullPath = path.join(uploadsDir, entry.name);
      
      try {
        if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          fs.unlinkSync(fullPath);
          totalFilesRemoved++;
          totalBytesFreed += stats.size;
          logger.info(`   ✅ Removed root uploaded file: ${entry.name} (${formatBytes(stats.size)})`);
        }
      } catch (error) {
        logger.error(`   ⚠️  Failed to remove ${entry.name}:`, error);
      }
    }
  } catch (error) {
    logger.error(`⚠️  Error reading uploads directory:`, error);
  }

  logger.info(`\n✨ Cleanup complete:`);
  logger.info(`   - Files removed: ${totalFilesRemoved}`);
  logger.info(`   - Directories removed: ${totalDirsRemoved}`);
  logger.info(`   - Space freed: ${formatBytes(totalBytesFreed)}`);
}

/**
 * Get the total size of a directory recursively
 */
function getDirectorySize(dirPath: string): { size: number; files: number } {
  let totalSize = 0;
  let totalFiles = 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      try {
        if (entry.isDirectory()) {
          const subDirStats = getDirectorySize(fullPath);
          totalSize += subDirStats.size;
          totalFiles += subDirStats.files;
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          totalSize += stats.size;
          totalFiles++;
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }

  return { size: totalSize, files: totalFiles };
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

