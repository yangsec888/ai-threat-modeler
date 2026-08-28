/**
 * Single source of truth for the browser origins this API trusts.
 *
 * Shared by the CORS policy and the same-origin CSRF guard so they can never
 * drift apart. Configure with a comma-separated `ALLOWED_ORIGINS` env var when
 * the frontend is served from a non-local origin; defaults cover the local
 * Next.js dev server and the docker-compose frontend mapping.
 *
 * Author: Sam Li
 */

function resolveAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw && raw.trim().length > 0) {
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
  }
  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

export const allowedOrigins: string[] = resolveAllowedOrigins();

export const allowedOriginSet: Set<string> = new Set(allowedOrigins);

/** True when the given origin is in the allowlist. */
export function isOriginAllowed(origin: string): boolean {
  return allowedOriginSet.has(origin);
}
