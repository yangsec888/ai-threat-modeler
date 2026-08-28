/**
 * Backend password policy (CWE-521).
 *
 * Mirrors the frontend policy in frontend/lib/security.ts so the API cannot be
 * used to set a weaker password than the UI allows. Enforced on registration,
 * password change, and admin user create/update.
 *
 * Author: Sam Li
 */

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

const SPECIAL_CHARACTERS = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

export interface PasswordPolicyResult {
  valid: boolean;
  error?: string;
}

export function validatePassword(password: string): PasswordPolicyResult {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_LENGTH} characters long` };
  }

  if (password.length > MAX_LENGTH) {
    return { valid: false, error: `Password is too long (maximum ${MAX_LENGTH} characters)` };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  if (!SPECIAL_CHARACTERS.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }

  return { valid: true };
}
