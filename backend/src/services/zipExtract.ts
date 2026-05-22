/**
 * ZIP extraction helper for threat modeling uploads.
 */

import * as fs from 'fs';
import * as path from 'path';
import yauzl from 'yauzl';
import logger from '../utils/logger';

export function extractZip(zipPath: string, extractTo: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err: Error | null, zipfile: yauzl.ZipFile | undefined) => {
      if (err) {
        return reject(err);
      }

      if (!zipfile) {
        return reject(new Error('Failed to open ZIP file'));
      }

      if (!fs.existsSync(extractTo)) {
        fs.mkdirSync(extractTo, { recursive: true });
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        const fullPath = path.join(extractTo, entry.fileName);
        const normalizedPath = path.normalize(fullPath);
        if (!normalizedPath.startsWith(path.normalize(extractTo))) {
          zipfile.readEntry();
          return;
        }

        const parentDir = path.dirname(normalizedPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        zipfile.openReadStream(entry, (streamErr: Error | null, readStream: NodeJS.ReadableStream | null) => {
          if (streamErr) {
            return reject(streamErr);
          }

          if (!readStream) {
            zipfile.readEntry();
            return;
          }

          const writeStream = fs.createWriteStream(normalizedPath);
          readStream.pipe(writeStream);

          writeStream.on('close', () => {
            zipfile.readEntry();
          });

          writeStream.on('error', (writeErr: Error) => {
            reject(writeErr);
          });
        });
      });

      zipfile.on('end', () => {
        logger.info(`✅ Successfully extracted ZIP to: ${extractTo}`);
        resolve();
      });

      zipfile.on('error', (zipErr: Error) => {
        reject(zipErr);
      });
    });
  });
}
