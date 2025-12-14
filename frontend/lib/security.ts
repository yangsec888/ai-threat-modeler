/**
 * Security utilities for input validation and sanitization
 * 
 * Author: Sam Li
 */

/**
 * Sanitize string input to prevent XSS attacks
 * Removes potentially dangerous characters and HTML tags
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove null bytes and control characters except newlines and tabs
  let sanitized = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // Escape HTML special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  return sanitized;
}

/**
 * Validate username - alphanumeric, underscore, hyphen, 3-30 characters
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }
  
  if (username.length < 3 || username.length > 30) {
    return { valid: false, error: 'Username must be between 3 and 30 characters' };
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }
  
  return { valid: true };
}

/**
 * Validate email address
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  if (email.length > 254) {
    return { valid: false, error: 'Email address is too long' };
  }
  
  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email address format' };
  }
  
  return { valid: true };
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  
  if (password.length > 128) {
    return { valid: false, error: 'Password is too long (maximum 128 characters)' };
  }
  
  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  
  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  
  // Check for at least one number
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  
  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  
  return { valid: true };
}

/**
 * Validate repository path - prevent path traversal
 */
export function validateRepoPath(repoPath: string): { valid: boolean; error?: string } {
  if (!repoPath || typeof repoPath !== 'string') {
    return { valid: false, error: 'Repository path is required' };
  }
  
  if (repoPath.length > 500) {
    return { valid: false, error: 'Repository path is too long' };
  }
  
  // Prevent path traversal attacks
  if (repoPath.includes('..') || repoPath.includes('//') || repoPath.startsWith('/')) {
    return { valid: false, error: 'Invalid repository path' };
  }
  
  return { valid: true };
}

/**
 * Validate query string - limit length and sanitize
 */
export function validateQuery(query: string, maxLength: number = 5000): { valid: boolean; error?: string } {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query is required' };
  }
  
  if (query.length > maxLength) {
    return { valid: false, error: `Query must be less than ${maxLength} characters` };
  }
  
  return { valid: true };
}

/**
 * Sanitize error message to prevent information leakage
 */
export function sanitizeErrorMessage(error: unknown, defaultMessage: string = 'An error occurred'): string {
  if (error instanceof Error) {
    const message = error.message;
    
    // Don't expose internal error details
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return 'Unable to connect to server. Please check your connection.';
    }
    
    if (message.includes('401') || message.includes('Unauthorized')) {
      return 'Authentication failed. Please log in again.';
    }
    
    if (message.includes('403') || message.includes('Forbidden')) {
      return 'You do not have permission to perform this action.';
    }
    
    if (message.includes('500') || message.includes('Internal Server Error')) {
      return 'A server error occurred. Please try again later.';
    }
    
    // Return sanitized message (remove stack traces, file paths, etc.)
    return message.replace(/at\s+.*?:\d+:\d+/g, '').replace(/file:\/\/.*/g, '').trim() || defaultMessage;
  }
  
  return defaultMessage;
}

/**
 * Truncate string to prevent DoS attacks from extremely long inputs
 */
export function truncateString(input: string, maxLength: number): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  if (input.length <= maxLength) {
    return input;
  }
  
  return input.substring(0, maxLength) + '...';
}

