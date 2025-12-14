// Test setup file
// This runs before all tests

// Set test environment variables FIRST, before any imports
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

// Suppress console.log and console.error during tests to reduce noise
// Store original console methods
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// Suppress console output during tests
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

// Restore console output after tests (optional, for debugging)
afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
  
  // Close database connection to prevent Jest from hanging
  try {
    const db = require('../db/database').default;
    if (db && typeof db.close === 'function') {
      db.close();
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
});
