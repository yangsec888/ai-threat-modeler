/**
 * Context-quality signal for the human-in-the-loop threat-model review loop.
 *
 * The threat-model run is only as good as the context it is fed (GIGO). This
 * helper summarises how "rich" the provided context fields are so the UI can
 * warn the user before they run a scan on thin input.
 */

import type { ContextFields } from '@/types/contextFields'

export type ContextQuality = 'none' | 'thin' | 'ok' | 'rich'

/**
 * A field is considered meaningfully populated (non-trivial) only once it
 * holds a real value, not a stub or a few words. Trust-boundary/architecture
 * notes tend to need a sentence or two to be useful.
 */
const MIN_MEANINGFUL_LENGTH = 20

function isPopulated(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length >= MIN_MEANINGFUL_LENGTH
}

/**
 * Classify the quality of the provided context:
 * - `none`: no meaningfully-populated fields at all.
 * - `thin`: only 1 meaningfully-populated field (weak signal).
 * - `ok`: 2 meaningfully-populated fields.
 * - `rich`: deployment context present AND >= 3 meaningfully-populated fields.
 */
export function summarizeContextQuality(
  fields: ContextFields | null | undefined,
): ContextQuality {
  if (!fields) return 'none'
  const values = Object.values(fields)
  const populatedCount = values.filter((v) => isPopulated(v)).length
  const hasDeployment = isPopulated(fields.deploymentContext)

  if (populatedCount === 0) return 'none'
  if (hasDeployment && populatedCount >= 3) return 'rich'
  if (populatedCount < 2) return 'thin'
  return 'ok'
}

export function isContextTooThin(quality: ContextQuality): boolean {
  return quality === 'none' || quality === 'thin'
}
