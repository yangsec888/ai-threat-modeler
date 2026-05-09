/**
 * Encryption utilities for sensitive data
 * 
 * Uses AES-256-GCM for authenticated encryption
 * 
 * Author: Sam Li
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64; // 64 bytes for key derivation
const TAG_LENGTH = 16; // 16 bytes for GCM authentication tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * PBKDF2 iteration count: OWASP 2023 recommendation for PBKDF2-HMAC-SHA256.
 * Earlier installs used 100,000; the boot-time migration in
 * `init/encryptionKdfMigration` re-encrypts those rows with the new count.
 */
export const PBKDF2_ITERATIONS = 310_000;
export const LEGACY_PBKDF2_ITERATIONS = 100_000;

function deriveKey(encryptionKey: string, salt: Buffer, iterations: number = PBKDF2_ITERATIONS): Buffer {
  return crypto.pbkdf2Sync(encryptionKey, salt, iterations, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a string using AES-256-GCM
 * 
 * @param text - The plaintext to encrypt
 * @param encryptionKey - The encryption key (hex string)
 * @returns Encrypted data as hex string (format: salt:iv:tag:ciphertext)
 */
export function encrypt(text: string, encryptionKey: string): string {
  if (!text) {
    return '';
  }

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from encryption key and salt
  const key = deriveKey(encryptionKey, salt);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get authentication tag
  const tag = cipher.getAuthTag();
  
  // Return format: salt:iv:tag:ciphertext (all hex encoded)
  return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string using AES-256-GCM
 * 
 * @param encryptedData - The encrypted data as hex string (format: salt:iv:tag:ciphertext)
 * @param encryptionKey - The encryption key (hex string)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails
 */
export function decrypt(encryptedData: string, encryptionKey: string, iterations: number = PBKDF2_ITERATIONS): string {
  if (!encryptedData) {
    return '';
  }

  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltHex, ivHex, tagHex, ciphertext] = parts;
    
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const key = deriveKey(encryptionKey, salt, iterations);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt data that may have been encrypted with the legacy 100k PBKDF2
 * iteration count. Tries the current iteration count first, then falls back
 * to the legacy count. Used by the boot-time KDF migration.
 */
export function decryptWithFallback(encryptedData: string, encryptionKey: string): string {
  try {
    return decrypt(encryptedData, encryptionKey, PBKDF2_ITERATIONS);
  } catch {
    return decrypt(encryptedData, encryptionKey, LEGACY_PBKDF2_ITERATIONS);
  }
}

