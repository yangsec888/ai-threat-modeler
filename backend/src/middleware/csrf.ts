/**
 * Same-origin enforcement middleware (CSRF defense-in-depth).
 *
 * The frontend authenticates with a bearer token stored in localStorage and
 * sent via the `Authorization` header, never via an ambient cookie. Classic
 * CSRF therefore cannot occur: a third-party origin cannot read localStorage
 * nor set a custom Authorization header on a cross-origin request.
 *
 * This guard adds a second layer so the API still rejects cross-origin
 * state-changing requests even if authentication is ever moved into a cookie
 * or another ambient credential. It validates the Origin (falling back to
 * Referer) of mutating methods against an explicit allowlist.
 *
 * Author: Sam Li
 */

import { Request, Response, NextFunction } from 'express';
import { isOriginAllowed } from '../config/allowedOrigins';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function extractOrigin(req: Request): string | null {
  const origin = req.headers.origin;
  if (origin) return origin;

  // Fall back to Referer for clients that omit Origin (older browsers, some
  // non-browser agents). Only the scheme + host + port portion is compared.
  const referer = req.headers.referer;
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin;
    } catch {
      return null;
    }
  }
  return null;
}

export function enforceSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const origin = extractOrigin(req);

  // Allow requests with no Origin/Referer header (curl, server-to-server,
  // unit tests). These can't be cross-site browser CSRF by construction.
  if (!origin) {
    return next();
  }

  if (isOriginAllowed(origin)) {
    return next();
  }

  res.status(403).json({
    error: 'Cross-origin request blocked',
    message: 'Originating origin is not allowed to mutate resources.',
  });
}
