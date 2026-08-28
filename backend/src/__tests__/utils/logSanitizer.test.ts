import { sanitizeForLog } from '../../utils/logSanitizer';

describe('sanitizeForLog', () => {
  it('returns empty/undefined input unchanged', () => {
    expect(sanitizeForLog('')).toBe('');
    expect(sanitizeForLog('hello')).toBe('hello');
  });

  it('redacts secret-looking values', () => {
    const out = sanitizeForLog('my api_key=sk-123456 and client_secret: "abc123" here');
    expect(out).not.toContain('sk-123456');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('api_key');
    expect(out).not.toContain('client_secret');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts an inline Authorization bearer header', () => {
    const out = sanitizeForLog('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def and then done');
    expect(out).not.toContain('eyJhbGci');
    expect(out).not.toContain('Authorization');
    expect(out).toContain('[REDACTED] and then done');
  });

  it('redacts a bare Bearer token without an Authorization prefix', () => {
    const out = sanitizeForLog('send me the bearer zxcv1234-9876 quickly');
    expect(out).not.toContain('zxcv1234');
    expect(out).toMatch(/the \[REDACTED\] quickly/);
  });

  it('truncates long payloads with a marker', () => {
    const big = 'x'.repeat(5000);
    const out = sanitizeForLog(big, 100);
    expect(out.length).toBeLessThan(200);
    expect(out).toContain('[truncated 4900 chars]');
  });

  it('leaves ordinary text mostly intact', () => {
    const out = sanitizeForLog('no secrets here, just a normal message');
    expect(out).toBe('no secrets here, just a normal message');
  });
});
