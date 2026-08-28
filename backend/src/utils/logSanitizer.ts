/**
 * Log sanitization for verbose agent output.
 *
 * Agent stdout/stderr and chat responses can contain source code excerpts,
 * prompts, and secrets (API keys/tokens) from the analyzed repository. Logging
 * these verbatim (CWE-532) risks leaking sensitive data. This helper truncates
 * long payloads and redacts common secret-shaped values before they reach the
 * log stream.
 *
 * Author: Sam Li
 */

const DEFAULT_MAX_LENGTH = 2000;

// Redact a broad set of "secret-shaped" assignments. Case-insensitive.
// Each pattern MUST have exactly one capture group: the value to redact.
const SECRET_KEY_PATTERNS = [
  // "Authorization: Bearer <token>" and "Bearer: <token>" header forms.
  /\b(?:authorization|bearer)\b\s*:\s*["']?bearer\s+([^\s"'&;,]+)/gi,
  // "Bearer <token>" form (e.g. in logs of API calls).
  /\bbearer\s+([a-zA-Z0-9._~+/=-]+)/gi,
  // key=value / key: value assignments.
  /\b(?:api[_-]?key|apikey|secret|token|password|passwd|private[_-]?key|access[_-]?key|client[_-]?secret)\b[=:]\s*["']?([^\s"'&;,]+)/gi,
];

/**
 * Sanitize a chunk of text for safe logging:
 * - Redact values bound to secret-looking keys.
 * - Truncate very long payloads (with a marker) so a chat/agent turn can't
 *   blow up the log and so sensitive bulk content isn't persisted.
 */
export function sanitizeForLog(input: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  if (!input) return input;

  let out = input;
  for (const pattern of SECRET_KEY_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }

  if (out.length > maxLength) {
    return `${out.slice(0, maxLength)}\n... [truncated ${out.length - maxLength} chars]`;
  }
  return out;
}
