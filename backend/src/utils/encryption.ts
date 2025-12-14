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
 * Derive a 32-byte key from the encryption key using PBKDF2
 */
function deriveKey(encryptionKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(encryptionKey, salt, 100000, KEY_LENGTH, 'sha256');
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
export function decrypt(encryptedData: string, encryptionKey: string): string {
  if (!encryptedData) {
    return '';
  }

  try {
    // Parse the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltHex, ivHex, tagHex, ciphertext] = parts;
    
    // Convert hex strings to buffers
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    // Derive key from encryption key and salt
    const key = deriveKey(encryptionKey, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

