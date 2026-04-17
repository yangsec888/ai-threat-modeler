import { render, screen } from '@testing-library/react'
import type { Edge, Node } from '@xyflow/react'
import { DfdContextPanel } from '@/components/dfd/DfdContextPanel'
import type { DataFlowDiagram, Threat } from '@/types/threatModel'
import type { DfdNodeData } from '@/utils/dfdToReactFlow'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('../../../e2e/fixtures/dfd-report.json') as {
  job: { dataFlowDiagram: DataFlowDiagram; threatModel: { threats: Threat[] } }
}

const dfd = fixture.job.dataFlowDiagram
const threats = fixture.job.threatModel.threats

describe('DfdContextPanel', () => {
  it('shows empty state when nothing selected', () => {
    render(
      <DfdContextPanel dfd={dfd} threats={threats} selectedNode={null} selectedEdge={null} />
    )
    expect(screen.getByText(/Select a node or edge/)).toBeInTheDocument()
  })

  it('shows node details and related threats', () => {
    const selectedNode = {
      id: 'proc-1',
      type: 'process',
      position: { x: 0, y: 0 },
      data: { label: 'API Server', nodeType: 'process' as const },
    } as Node<DfdNodeData>

    render(
      <DfdContextPanel
        dfd={dfd}
        threats={threats}
        selectedNode={selectedNode}
        selectedEdge={null}
      />
    )
    expect(screen.getByText('API Server')).toBeInTheDocument()
    expect(screen.getByText(/Related threats/)).toBeInTheDocument()
    expect(screen.getByText(/T-001/)).toBeInTheDocument()
  })

  it('shows edge protocol and classification', () => {
    const selectedEdge = {
      id: 'f2',
      source: 'proc-1',
      target: 'ds-1',
      data: { description: 'SQL queries', protocol: 'TCP', classification: 'PII' },
    } as Edge

    render(
      <DfdContextPanel dfd={dfd} threats={threats} selectedNode={null} selectedEdge={selectedEdge} />
    )
    expect(screen.getByText('Data flow')).toBeInTheDocument()
    expect(screen.getByText('TCP')).toBeInTheDocument()
    expect(screen.getByText('PII')).toBeInTheDocument()
  })
})
