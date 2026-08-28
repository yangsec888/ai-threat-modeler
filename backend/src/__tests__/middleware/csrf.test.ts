import { Request, Response } from 'express';
import { enforceSameOrigin } from '../../middleware/csrf';

function makeReq(method: string, headers: { origin?: string; referer?: string }): Partial<Request> {
  return { method, headers } as Partial<Request>;
}

describe('enforceSameOrigin (CSRF guard)', () => {
  let res: Partial<Response>;
  let json: jest.Mock;
  let status: jest.Mock;

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    res = { status } as unknown as Partial<Response>;
  });

  it('allows safe methods without any origin check', () => {
    const next = jest.fn();
    enforceSameOrigin(makeReq('GET', {}) as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('allows mutating requests with no Origin/Referer (non-browser clients)', () => {
    const next = jest.fn();
    enforceSameOrigin(makeReq('POST', {}) as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('allows a mutating request from an allowed origin', () => {
    const next = jest.fn();
    enforceSameOrigin(
      makeReq('DELETE', { origin: 'http://localhost:3000' }) as Request,
      res as Response,
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('blocks a mutating request from a disallowed origin', () => {
    const next = jest.fn();
    enforceSameOrigin(
      makeReq('POST', { origin: 'https://evil.example.com' }) as Request,
      res as Response,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Cross-origin request blocked' }),
    );
  });

  it('falls back to Referer origin when Origin is absent', () => {
    const next = jest.fn();
    enforceSameOrigin(
      makeReq('PATCH', { referer: 'https://evil.example.com/attacker' }) as Request,
      res as Response,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});
