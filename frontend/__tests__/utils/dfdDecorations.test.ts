/**
 * @jest-environment node
 */
import type { DFDNode, Threat } from '@/types/threatModel'
import {
  borderClassForMaxSeverity,
  componentMatchesNode,
  getThreatStatsPerNode,
  strokeForDataClassification,
} from '@/utils/dfdDecorations'

describe('componentMatchesNode', () => {
  const node: DFDNode = { id: 'n1', name: 'Web Browser', type: 'external_entity' }

  it('matches exact id', () => {
    expect(componentMatchesNode('n1', node)).toBe(true)
  })

  it('matches case-insensitive name', () => {
    expect(componentMatchesNode('web browser', node)).toBe(true)
  })

  it('returns false when no match', () => {
    expect(componentMatchesNode('other', node)).toBe(false)
  })
})

describe('getThreatStatsPerNode', () => {
  const nodes: DFDNode[] = [
    { id: 'a', name: 'Alpha', type: 'process' },
    { id: 'b', name: 'Beta', type: 'process' },
  ]

  it('aggregates threats with id and name matching', () => {
    const threats: Threat[] = [
      {
        id: 'T1',
        title: 't',
        stride_category: 'Tampering',
        severity: 'HIGH',
        affected_components: ['a', 'Beta'],
        description: 'd',
        impact: 'i',
        likelihood: 'LOW',
        mitigation: 'm',
      },
    ]
    const stats = getThreatStatsPerNode(nodes, threats)
    expect(stats.a.count).toBe(1)
    expect(stats.b.count).toBe(1)
  })

  it('returns zeros when threats undefined', () => {
    const stats = getThreatStatsPerNode(nodes, undefined)
    expect(stats.a.count).toBe(0)
  })
})

describe('strokeForDataClassification', () => {
  it.each([
    ['PII', '#b91c1c'],
    ['confidential', '#7c3aed'],
    ['internal', '#ca8a04'],
    ['public', '#15803d'],
    ['other', '#64748b'],
  ])('%s -> %s', (c, hex) => {
    expect(strokeForDataClassification(c)).toBe(hex)
  })
})

describe('borderClassForMaxSeverity', () => {
  it('returns tailwind-ish classes per severity', () => {
    expect(borderClassForMaxSeverity('CRITICAL')).toContain('red')
    expect(borderClassForMaxSeverity(null)).toContain('slate')
  })
})
