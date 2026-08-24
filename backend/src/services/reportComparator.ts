/**
 * Baseline threat-model comparison ("did we do a good job?").
 *
 * Pure, side-effect-free matching engine so it is trivially unit-testable.
 *
 * Two tolerant match tiers:
 * - `exact`: normalized title + STRIDE category set + sorted affected-component
 *   set all match.
 * - `fuzzy`: no exact match, but the normalized title matches an unmatched
 *   baseline finding (degraded / partial-component overlap).
 *
 * Output shape:
 * - `matched`: pairs of {generated, baseline} findings plus the match tier and
 *   a confidence weight (lower when the findings are ungrounded).
 * - `missed`: baseline findings with no match in the generated model.
 * - `extra`: generated findings with no match in the baseline.
 * - `recall` = matched / baseline count (what we found vs. the reference).
 * - `precision` = matched / generated count (how much of what we produced was
 *   actually in the reference).
 */

export interface CompareFinding {
  id?: string
  title: string
  category?: string
  components?: string[]
  sourceLocations?: unknown[]
}

export type MatchTier = 'exact' | 'fuzzy'

export interface MatchedPair {
  generated: CompareFinding
  baseline: CompareFinding
  tier: MatchTier
  /** 0..1 weight; lower when the findings are ungrounded (no source locations). */
  confidence: number
}

export interface ComparisonResult {
  matched: MatchedPair[]
  missed: CompareFinding[]
  extra: CompareFinding[]
  recall: number
  precision: number
}

/** Normalize a label to a canonical comparison key (lowercase alphanumeric tokens). */
export function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** The set of STRIDE categories a finding belongs to, normalized + sorted. */
export function normalizeCategories(finding: CompareFinding): string[] {
  const raw = [finding.category]
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
    .map(normalizeLabel)
  return Array.from(new Set(raw)).sort()
}

/** Sorted, normalized set of affected components. */
export function normalizeComponents(finding: CompareFinding): string[] {
  const raw = (finding.components ?? [])
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
    .map(normalizeLabel)
  return Array.from(new Set(raw)).sort()
}

/** True when the finding has at least one source location (is "grounded"). */
export function isGrounded(finding: CompareFinding): boolean {
  return Array.isArray(finding.sourceLocations) && finding.sourceLocations.length > 0
}

/** Exact-match key: title + category set + component set. */
function exactKey(finding: CompareFinding): string {
  return [
    normalizeLabel(finding.title),
    normalizeCategories(finding).join('|'),
    normalizeComponents(finding).join('|'),
  ].join('::')
}

/** Match confidence for a pair. Exact is strongest; ungrounded findings score lower. */
function matchConfidence(tier: MatchTier, generated: CompareFinding, baseline: CompareFinding): number {
  let confidence = tier === 'exact' ? 1 : 0.6
  if (!isGrounded(generated) || !isGrounded(baseline)) {
    confidence = Math.max(0.25, confidence - 0.35)
  }
  return confidence
}

export function compareThreatSets(
  generated: CompareFinding[],
  baseline: CompareFinding[],
): ComparisonResult {
  const matched: MatchedPair[] = []
  const extra: CompareFinding[] = []

  // Index baseline findings by their exact key so we can consume them greedily.
  const baselineByExact = new Map<string, number[]>()
  baseline.forEach((b, idx) => {
    const key = exactKey(b)
    const list = baselineByExact.get(key) ?? []
    list.push(idx)
    baselineByExact.set(key, list)
  })

  const baselineUsed = new Set<number>()

  // Pass 1: exact matches.
  const fuzzyCandidates: Array<{ gen: CompareFinding; genComponents: string[] }> = []
  for (const gen of generated) {
    const key = exactKey(gen)
    const indices = baselineByExact.get(key)
    const baselineIdx = indices?.find((i) => !baselineUsed.has(i))
    if (baselineIdx !== undefined) {
      baselineUsed.add(baselineIdx)
      matched.push({
        generated: gen,
        baseline: baseline[baselineIdx],
        tier: 'exact',
        confidence: matchConfidence('exact', gen, baseline[baselineIdx]),
      })
    } else {
      fuzzyCandidates.push({ gen, genComponents: normalizeComponents(gen) })
    }
  }

  // Pass 2: fuzzy — match remaining generated findings to remaining baseline by
  // normalized title. Prefer baseline findings with overlapping components.
  const baselineByTitle = new Map<string, number[]>()
  baseline.forEach((b, idx) => {
    if (baselineUsed.has(idx)) return
    const title = normalizeLabel(b.title)
    if (!title) return
    const list = baselineByTitle.get(title) ?? []
    list.push(idx)
    baselineByTitle.set(title, list)
  })

  for (const { gen, genComponents } of fuzzyCandidates) {
    const title = normalizeLabel(gen.title)
    if (!title) continue
    const candidates = (baselineByTitle.get(title) ?? []).filter((i) => !baselineUsed.has(i))
    if (candidates.length === 0) {
      extra.push(gen)
      continue
    }
    candidates.sort((a, b) => {
      const overlapA = countOverlap(genComponents, normalizeComponents(baseline[a]))
      const overlapB = countOverlap(genComponents, normalizeComponents(baseline[b]))
      return overlapB - overlapA
    })
    const baselineIdx = candidates[0]
    baselineUsed.add(baselineIdx)
    matched.push({
      generated: gen,
      baseline: baseline[baselineIdx],
      tier: 'fuzzy',
      confidence: matchConfidence('fuzzy', gen, baseline[baselineIdx]),
    })
  }

  // Unmatched generated findings that couldn't even fuzzy-match are "extra".
  const matchedGeneratedKeys = new Set(matched.map((m) => exactKey(m.generated)))
  for (const gen of generated) {
    if (!matchedGeneratedKeys.has(exactKey(gen))) {
      const alreadyPushed = extra.some((e) => exactKey(e) === exactKey(gen))
      if (!alreadyPushed) extra.push(gen)
    }
  }

  // Baseline findings never matched are "missed".
  const missed: CompareFinding[] = []
  baseline.forEach((b, idx) => {
    if (!baselineUsed.has(idx)) missed.push(b)
  })

  const recall = baseline.length === 0 ? 0 : matched.length / baseline.length
  const precision = generated.length === 0 ? 0 : matched.length / generated.length

  return { matched, missed, extra, recall, precision }
}

function countOverlap(a: string[], b: string[]): number {
  const set = new Set(b)
  return a.filter((x) => set.has(x)).length
}

