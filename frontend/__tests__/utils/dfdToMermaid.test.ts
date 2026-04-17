/**
 * @jest-environment node
 */
import type { DFDDataFlow, DFDNode, DFDTrustBoundary } from '@/types/threatModel'
import { dfdToMermaid } from '@/utils/dfdToMermaid'

describe('dfdToMermaid', () => {
  const nodes: DFDNode[] = [
    { id: 'ee', name: 'Client', type: 'external_entity' },
    { id: 'p', name: 'Proc', type: 'process' },
    { id: 'ds', name: 'Store', type: 'data_store' },
  ]
  const flows: DFDDataFlow[] = [
    {
      id: 'f1',
      source: 'ee',
      destination: 'p',
      description: 'Say "hi"',
      protocol: 'HTTPS',
    },
  ]
  const tb: DFDTrustBoundary[] = [{ id: 'tb1', name: 'Zone A', nodes: ['ee'] }]

  it('renders subgraph for trust boundary and top-level nodes', () => {
    const m = dfdToMermaid(nodes, flows, tb, 'LR')
    expect(m).toContain('subgraph tb1')
    expect(m).toContain('p("Proc")')
    expect(m).toContain('ee -->|"Say #quot;hi#quot; (HTTPS)"| p')
  })

  it('supports TB direction', () => {
    const m = dfdToMermaid(nodes, flows, [], 'TB')
    expect(m.split('\n')[0]).toBe('flowchart TB')
  })
})
