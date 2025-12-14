// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock

// Mock window.fetch
global.fetch = jest.fn()

// Suppress console.error during tests to reduce noise
// Store original console methods
const originalError = console.error
const originalLog = console.log
const originalWarn = console.warn

// Suppress console output during tests
beforeAll(() => {
  console.error = jest.fn()
  console.log = jest.fn()
  console.warn = jest.fn()
})

// Restore console output after tests (optional, for debugging)
afterAll(() => {
  console.error = originalError
  console.log = originalLog
  console.warn = originalWarn
})

