/**
 * Tests for the baseline threat-model comparison engine.
 */

import {
  compareThreatSets,
  normalizeLabel,
  type CompareFinding,
} from '../../services/reportComparator';

function finding(overrides: Partial<CompareFinding> = {}): CompareFinding {
  return {
    title: 'SQL Injection',
    category: 'Tampering',
    components: ['api-server'],
    sourceLocations: [{ file: 'a.ts' }],
    ...overrides,
  };
}

describe('normalizeLabel', () => {
  it('lowercases and collapses non-alphanumeric tokens', () => {
    expect(normalizeLabel('SQL Injection!')).toBe('sql injection');
    expect(normalizeLabel('  Auth   Bypass  ')).toBe('auth bypass');
  });
});

describe('compareThreatSets', () => {
  it('matches identical findings exactly (recall = precision = 1)', () => {
    const generated = [finding({ id: 'G1' }), finding({ id: 'G2', title: 'XSS' })];
    const baseline = [finding({ id: 'B1' }), finding({ id: 'B2', title: 'XSS' })];

    const result = compareThreatSets(generated, baseline);

    expect(result.matched).toHaveLength(2);
    expect(result.matched.every((m) => m.tier === 'exact')).toBe(true);
    expect(result.missed).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
  });

  it('matches findings that differ only by case/whitespace exactly', () => {
    const generated = [finding({ title: 'SQL Injection' })];
    const baseline = [finding({ title: '  sql  injection ' })];

    const result = compareThreatSets(generated, baseline);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].tier).toBe('exact');
    expect(result.recall).toBe(1);
  });

  it('falls back to fuzzy matching when components differ but title matches', () => {
    const generated = [finding({ components: ['api-server'] })];
    const baseline = [finding({ components: ['backend'] })];

    const result = compareThreatSets(generated, baseline);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].tier).toBe('fuzzy');
    expect(result.recall).toBe(1);
  });

  it('reports missed (baseline-only) and extra (generated-only) findings', () => {
    const generated = [
      finding({ id: 'G1', title: 'SQL Injection' }),
      finding({ id: 'G2', title: 'XSS' }),
    ];
    const baseline = [
      finding({ id: 'B1', title: 'SQL Injection' }),
      finding({ id: 'B2', title: 'SSRF' }),
    ];

    const result = compareThreatSets(generated, baseline);

    expect(result.matched).toHaveLength(1); // SQL Injection
    expect(result.missed.map((m) => m.title)).toEqual(['SSRF']);
    expect(result.extra.map((m) => m.title)).toEqual(['XSS']);
    expect(result.recall).toBe(0.5);
    expect(result.precision).toBe(0.5);
  });

  it('handles an empty baseline (everything extra, recall 0)', () => {
    const generated = [finding({ title: 'A' }), finding({ title: 'B' })];

    const result = compareThreatSets(generated, []);

    expect(result.missed).toHaveLength(0);
    expect(result.extra).toHaveLength(2);
    expect(result.recall).toBe(0);
    expect(result.precision).toBe(0);
  });

  it('handles an empty generated set (everything missed, precision 0)', () => {
    const baseline = [finding({ title: 'A' })];

    const result = compareThreatSets([], baseline);

    expect(result.missed).toHaveLength(1);
    expect(result.extra).toHaveLength(0);
    expect(result.recall).toBe(0);
    expect(result.precision).toBe(0);
  });

  it('scores ungrounded (no source location) matches with lower confidence', () => {
    const generated = [finding({ sourceLocations: [] })];
    const baseline = [finding({ sourceLocations: [] })];

    const result = compareThreatSets(generated, baseline);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].tier).toBe('exact');
    // Both ungrounded → confidence reduced below a grounded exact match (1.0).
    expect(result.matched[0].confidence).toBeLessThan(1);
  });
});
