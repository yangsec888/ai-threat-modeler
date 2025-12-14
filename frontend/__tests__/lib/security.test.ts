/**
 * Tests for security utilities
 * 
 * Author: Sam Li
 */

import {
  sanitizeInput,
  validateUsername,
  validateEmail,
  validatePassword,
  validateRepoPath,
  validateQuery,
  sanitizeErrorMessage,
  truncateString,
} from '@/lib/security'

describe('Security Utilities', () => {
  describe('sanitizeInput', () => {
    it('should escape HTML special characters', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;')
      expect(sanitizeInput('Hello & World')).toBe('Hello &amp; World')
      expect(sanitizeInput("It's a test")).toBe('It&#x27;s a test')
    })

    it('should remove null bytes and control characters', () => {
      expect(sanitizeInput('Hello\x00World')).toBe('HelloWorld')
      expect(sanitizeInput('Test\x01\x02\x03')).toBe('Test')
    })

    it('should preserve newlines and tabs', () => {
      expect(sanitizeInput('Line1\nLine2\tTab')).toContain('\n')
      expect(sanitizeInput('Line1\nLine2\tTab')).toContain('\t')
    })

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('')
    })

    it('should handle non-string inputs', () => {
      expect(sanitizeInput(null as any)).toBe('')
      expect(sanitizeInput(undefined as any)).toBe('')
      expect(sanitizeInput(123 as any)).toBe('')
    })
  })

  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      expect(validateUsername('testuser')).toEqual({ valid: true })
      expect(validateUsername('test_user')).toEqual({ valid: true })
      expect(validateUsername('test-user')).toEqual({ valid: true })
      expect(validateUsername('test123')).toEqual({ valid: true })
      expect(validateUsername('abc')).toEqual({ valid: true })
      expect(validateUsername('a'.repeat(30))).toEqual({ valid: true })
    })

    it('should reject usernames that are too short', () => {
      const result = validateUsername('ab')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('3 and 30')
    })

    it('should reject usernames that are too long', () => {
      const result = validateUsername('a'.repeat(31))
      expect(result.valid).toBe(false)
      expect(result.error).toContain('3 and 30')
    })

    it('should reject usernames with invalid characters', () => {
      expect(validateUsername('test@user').valid).toBe(false)
      expect(validateUsername('test user').valid).toBe(false)
      expect(validateUsername('test.user').valid).toBe(false)
      expect(validateUsername('test#user').valid).toBe(false)
    })

    it('should reject empty or null usernames', () => {
      expect(validateUsername('').valid).toBe(false)
      expect(validateUsername(null as any).valid).toBe(false)
      expect(validateUsername(undefined as any).valid).toBe(false)
    })
  })

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('test@example.com')).toEqual({ valid: true })
      expect(validateEmail('user.name@example.co.uk')).toEqual({ valid: true })
      expect(validateEmail('test+tag@example.com')).toEqual({ valid: true })
    })

    it('should reject invalid email formats', () => {
      expect(validateEmail('invalid').valid).toBe(false)
      expect(validateEmail('invalid@').valid).toBe(false)
      expect(validateEmail('@example.com').valid).toBe(false)
      expect(validateEmail('test@').valid).toBe(false)
      expect(validateEmail('test @example.com').valid).toBe(false)
    })

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com'
      const result = validateEmail(longEmail)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('too long')
    })

    it('should reject empty or null emails', () => {
      expect(validateEmail('').valid).toBe(false)
      expect(validateEmail(null as any).valid).toBe(false)
      expect(validateEmail(undefined as any).valid).toBe(false)
    })
  })

  describe('validatePassword', () => {
    it('should accept valid passwords', () => {
      expect(validatePassword('Password123!')).toEqual({ valid: true })
      expect(validatePassword('Test@123')).toEqual({ valid: true })
      expect(validatePassword('MyP@ssw0rd')).toEqual({ valid: true })
    })

    it('should reject passwords that are too short', () => {
      const result = validatePassword('Pass1!')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('at least 8')
    })

    it('should reject passwords that are too long', () => {
      const longPassword = 'A'.repeat(129) + '1!'
      const result = validatePassword(longPassword)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('too long')
    })

    it('should reject passwords without uppercase letters', () => {
      const result = validatePassword('password123!')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('uppercase')
    })

    it('should reject passwords without lowercase letters', () => {
      const result = validatePassword('PASSWORD123!')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('lowercase')
    })

    it('should reject passwords without numbers', () => {
      const result = validatePassword('Password!')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('number')
    })

    it('should reject passwords without special characters', () => {
      const result = validatePassword('Password123')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('special character')
    })

    it('should reject empty or null passwords', () => {
      expect(validatePassword('').valid).toBe(false)
      expect(validatePassword(null as any).valid).toBe(false)
      expect(validatePassword(undefined as any).valid).toBe(false)
    })
  })

  describe('validateRepoPath', () => {
    it('should accept valid repository paths', () => {
      expect(validateRepoPath('my-repo')).toEqual({ valid: true })
      expect(validateRepoPath('path/to/repo')).toEqual({ valid: true })
      expect(validateRepoPath('repo_name')).toEqual({ valid: true })
    })

    it('should reject paths with path traversal', () => {
      expect(validateRepoPath('../etc/passwd').valid).toBe(false)
      expect(validateRepoPath('../../etc/passwd').valid).toBe(false)
      expect(validateRepoPath('path/../etc').valid).toBe(false)
    })

    it('should reject paths starting with slash', () => {
      expect(validateRepoPath('/etc/passwd').valid).toBe(false)
      expect(validateRepoPath('/root').valid).toBe(false)
    })

    it('should reject paths with double slashes', () => {
      expect(validateRepoPath('path//to//repo').valid).toBe(false)
    })

    it('should reject paths that are too long', () => {
      const longPath = 'a'.repeat(501)
      const result = validateRepoPath(longPath)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('too long')
    })

    it('should reject empty or null paths', () => {
      expect(validateRepoPath('').valid).toBe(false)
      expect(validateRepoPath(null as any).valid).toBe(false)
      expect(validateRepoPath(undefined as any).valid).toBe(false)
    })
  })

  describe('validateQuery', () => {
    it('should accept valid queries', () => {
      expect(validateQuery('Test query')).toEqual({ valid: true })
      expect(validateQuery('A'.repeat(5000))).toEqual({ valid: true })
    })

    it('should reject queries that are too long', () => {
      const longQuery = 'A'.repeat(5001)
      const result = validateQuery(longQuery)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('less than')
    })

    it('should accept custom max length', () => {
      expect(validateQuery('Test', 10)).toEqual({ valid: true })
      const longQuery = 'A'.repeat(11)
      expect(validateQuery(longQuery, 10).valid).toBe(false)
    })

    it('should reject empty or null queries', () => {
      expect(validateQuery('').valid).toBe(false)
      expect(validateQuery(null as any).valid).toBe(false)
      expect(validateQuery(undefined as any).valid).toBe(false)
    })
  })

  describe('sanitizeErrorMessage', () => {
    it('should sanitize connection errors', () => {
      const error = new Error('ECONNREFUSED')
      expect(sanitizeErrorMessage(error)).toBe('Unable to connect to server. Please check your connection.')
    })

    it('should sanitize unauthorized errors', () => {
      const error = new Error('401 Unauthorized')
      expect(sanitizeErrorMessage(error)).toBe('Authentication failed. Please log in again.')
    })

    it('should sanitize forbidden errors', () => {
      const error = new Error('403 Forbidden')
      expect(sanitizeErrorMessage(error)).toBe('You do not have permission to perform this action.')
    })

    it('should sanitize server errors', () => {
      const error = new Error('500 Internal Server Error')
      expect(sanitizeErrorMessage(error)).toBe('A server error occurred. Please try again later.')
    })

    it('should remove stack traces', () => {
      const error = new Error('Error at file.ts:123:45')
      const sanitized = sanitizeErrorMessage(error)
      expect(sanitized).not.toContain('at file.ts:123:45')
    })

    it('should remove file paths', () => {
      const error = new Error('Error file:///path/to/file')
      const sanitized = sanitizeErrorMessage(error)
      expect(sanitized).not.toContain('file://')
    })

    it('should use default message for unknown errors', () => {
      const error = new Error('Unknown error')
      expect(sanitizeErrorMessage(error)).toBe('Unknown error')
    })

    it('should handle non-Error objects', () => {
      expect(sanitizeErrorMessage(null)).toBe('An error occurred')
      expect(sanitizeErrorMessage(undefined)).toBe('An error occurred')
      expect(sanitizeErrorMessage('string error')).toBe('An error occurred')
    })

    it('should use custom default message', () => {
      expect(sanitizeErrorMessage(null, 'Custom error')).toBe('Custom error')
    })
  })

  describe('truncateString', () => {
    it('should truncate strings longer than max length', () => {
      const longString = 'A'.repeat(100)
      const truncated = truncateString(longString, 50)
      expect(truncated.length).toBe(53) // 50 + '...'
      expect(truncated.endsWith('...')).toBe(true)
    })

    it('should not truncate strings shorter than max length', () => {
      const shortString = 'Hello'
      expect(truncateString(shortString, 50)).toBe('Hello')
    })

    it('should handle exact length strings', () => {
      const exactString = 'A'.repeat(50)
      expect(truncateString(exactString, 50)).toBe(exactString)
    })

    it('should handle empty strings', () => {
      expect(truncateString('', 50)).toBe('')
    })

    it('should handle non-string inputs', () => {
      expect(truncateString(null as any, 50)).toBe('')
      expect(truncateString(undefined as any, 50)).toBe('')
      expect(truncateString(123 as any, 50)).toBe('')
    })
  })
})

