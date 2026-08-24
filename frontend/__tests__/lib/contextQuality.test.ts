/**
 * Tests for contextQuality helper (context-quality signal for GIGO warning).
 */

import {
  summarizeContextQuality,
  isContextTooThin,
} from '@/lib/contextQuality'

const LONG = 'x'.repeat(100)

describe('summarizeContextQuality', () => {
  it('returns none for undefined/null', () => {
    expect(summarizeContextQuality(undefined)).toBe('none')
    expect(summarizeContextQuality(null)).toBe('none')
  })

  it('returns none when no fields are meaningfully populated', () => {
    expect(summarizeContextQuality({})).toBe('none')
    expect(
      summarizeContextQuality({ projectSummary: '', deploymentContext: '  ' }),
    ).toBe('none')
    // A very short value is not meaningful.
    expect(summarizeContextQuality({ projectSummary: 'short' })).toBe('none')
  })

  it('returns thin when only one field is populated', () => {
    expect(summarizeContextQuality({ projectSummary: LONG })).toBe('thin')
  })

  it('returns ok when two fields are populated', () => {
    expect(
      summarizeContextQuality({ projectSummary: LONG, securityContext: LONG }),
    ).toBe('ok')
  })

  it('returns rich when deployment + 3 populated fields', () => {
    expect(
      summarizeContextQuality({
        projectSummary: LONG,
        securityContext: LONG,
        deploymentContext: LONG,
        additionalContext: LONG,
      }),
    ).toBe('rich')
  })

  it('returns ok for 3 populated fields without deployment context', () => {
    expect(
      summarizeContextQuality({
        projectSummary: LONG,
        securityContext: LONG,
        additionalContext: LONG,
      }),
    ).toBe('ok')
  })
})

describe('isContextTooThin', () => {
  it('flags none and thin as too thin', () => {
    expect(isContextTooThin('none')).toBe(true)
    expect(isContextTooThin('thin')).toBe(true)
  })

  it('does not flag ok or rich', () => {
    expect(isContextTooThin('ok')).toBe(false)
    expect(isContextTooThin('rich')).toBe(false)
  })
})
