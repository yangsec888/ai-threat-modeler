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

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Origins allowed to make state-changing requests.
 *
 * Configure with a comma-separated `ALLOWED_ORIGINS` env var when the frontend
 * is not served from a local Next.js dev server or the docker-compose mapping.
 * Defaults cover the two standard local/proxy shapes the app ships with.
 */
function resolveAllowedOrigins(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw && raw.trim().length > 0) {
    return new Set(
      raw
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
    );
  }
  return new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
}

const ALLOWED_ORIGINS = resolveAllowedOrigins();

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

  if (ALLOWED_ORIGINS.has(origin)) {
    return next();
  }

  res.status(403).json({
    error: 'Cross-origin request blocked',
    message: 'Originating origin is not allowed to mutate resources.',
  });
}
