/**
 * SEC-003: JWT_SECRET must be required in production.
 *
 * Author: Sam Li
 */

describe('JWT_SECRET resolution', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('throws on import in production with no JWT_SECRET set', () => {
    process.env = { ...originalEnv };
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    expect(() => require('../../middleware/auth')).toThrow(/JWT_SECRET/);
  });

  it('does not throw in production when JWT_SECRET is provided', () => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-production-secret';
    jest.resetModules();
    expect(() => require('../../middleware/auth')).not.toThrow();
  });

  it('does not throw in dev/test even when JWT_SECRET is missing', () => {
    process.env = { ...originalEnv };
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';
    jest.resetModules();
    expect(() => require('../../middleware/auth')).not.toThrow();
  });
});
