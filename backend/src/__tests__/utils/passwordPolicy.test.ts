import { validatePassword } from '../../utils/passwordPolicy';

describe('validatePassword (password policy, CWE-521)', () => {
  it('rejects missing/empty password', () => {
    expect(validatePassword('').valid).toBe(false);
    expect(validatePassword(undefined as unknown as string).valid).toBe(false);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('Aa1!x').valid).toBe(false);
  });

  it('rejects passwords longer than 128 characters', () => {
    expect(validatePassword('Aa1!' + 'x'.repeat(128)).valid).toBe(false);
  });

  it('requires uppercase, lowercase, digit, and special char', () => {
    expect(validatePassword('alllower1!').valid).toBe(false); // no uppercase
    expect(validatePassword('ALLLOWER1!').valid).toBe(false); // no lowercase
    expect(validatePassword('Alllowerpass!').valid).toBe(false); // no digit
    expect(validatePassword('Alllower12').valid).toBe(false); // no special
  });

  it('accepts a compliant password', () => {
    expect(validatePassword('Strong3!Pass').valid).toBe(true);
    expect(validatePassword('TestPass123!').valid).toBe(true);
  });
});
