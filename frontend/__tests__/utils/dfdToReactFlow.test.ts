/**
 * @jest-environment node
 */
import type { DataFlowDiagram, ThreatModel } from '@/types/threatModel'
import { assignParentIds, dfdToReactFlow } from '@/utils/dfdToReactFlow'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('../../e2e/fixtures/dfd-report.json') as {
  job: { dataFlowDiagram: DataFlowDiagram; threatModel: ThreatModel }
}

describe('assignParentIds', () => {
  it('assigns first trust boundary only when node appears in multiple', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const nodes = [
      { id: 'a', name: 'A', type: 'process' as const },
    ]
    const tbs = [
      { id: 'tb1', name: 'One', nodes: ['a'] },
      { id: 'tb2', name: 'Two', nodes: ['a'] },
    ]
    const m = assignParentIds(nodes, tbs)
    expect(m.get('a')).toBe('tb1')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('dfdToReactFlow', () => {
  const dfd = fixture.job.dataFlowDiagram
  const tm = fixture.job.threatModel

  it('maps node types to React Flow custom types', () => {
    const { nodes } = dfdToReactFlow(dfd, tm)
    expect(nodes.find((n) => n.id === 'ee-1')?.type).toBe('externalEntity')
    expect(nodes.find((n) => n.id === 'proc-1')?.type).toBe('process')
    expect(nodes.find((n) => n.id === 'ds-1')?.type).toBe('dataStore')
    expect(nodes.find((n) => n.id === 'tb-public')?.type).toBe('trustBoundary')
  })

  it('sets parentId for trust-boundary members', () => {
    const { nodes } = dfdToReactFlow(dfd, tm)
    expect(nodes.find((n) => n.id === 'ee-1')?.parentId).toBe('tb-public')
    expect(nodes.find((n) => n.id === 'proc-1')?.parentId).toBe('tb-app')
  })

  it('matches threats by id and by case-insensitive name', () => {
    const { nodes } = dfdToReactFlow(dfd, tm)
    const proc1 = nodes.find((n) => n.id === 'proc-1')
    expect(proc1?.data.threatStats?.count).toBeGreaterThanOrEqual(1)
    const browser = nodes.find((n) => n.id === 'ee-1')
    expect(browser?.data.threatStats?.maxSeverity).toBe('CRITICAL')
  })

  it('handles null threat model', () => {
    const { nodes, edges } = dfdToReactFlow(dfd, null)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => !n.data.threatStats)).toBe(true)
    expect(edges.every((e) => typeof e.style?.stroke === 'string')).toBe(true)
  })

  it('maps data_classification to edge stroke colors', () => {
    const { edges } = dfdToReactFlow(dfd, tm)
    const pii = edges.find((e) => e.id === 'f2')
    expect(pii?.style?.stroke).toMatch(/#/)
  })
})
