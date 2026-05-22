/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { JobReport } from '@/components/JobReport'
import type { ThreatModelingJob } from '@/types/threatModelingJob'

jest.mock('@/components/dfd/DfdTabContent', () => ({
  DfdTabContent: ({
    onOpenThreatsForComponent,
  }: {
    onOpenThreatsForComponent?: (id: string) => void
  }) => (
    <div data-testid="dfd-tab-stub">
      <button type="button" data-testid="open-threats-proc-1" onClick={() => onOpenThreatsForComponent?.('proc-1')}>
        Open threats
      </button>
    </div>
  ),
}))

const mockSave = jest.fn()
jest.mock('jspdf', () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 300, getHeight: () => 200 } },
    setFontSize: jest.fn(),
    text: jest.fn(),
    splitTextToSize: jest.fn(() => ['line']),
    save: mockSave,
    lastAutoTable: { finalY: 50 },
  })),
}))

jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: jest.fn(),
}))

const baseJob: ThreatModelingJob = {
  id: 'job-1',
  repoPath: '[UPLOADED] test.zip',
  query: null,
  status: 'completed',
  errorMessage: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:01:00.000Z',
  completedAt: '2026-01-01T00:01:00.000Z',
  metadata: {
    project_name: 'Test App',
    scan_date: '2026-01-01',
    methodology: 'STRIDE',
    total_threats_identified: 2,
    total_risks_identified: 1,
  },
  dataFlowDiagram: {
    description: 'DFD',
    nodes: [{ id: 'proc-1', name: 'API', type: 'process', description: '' }],
    data_flows: [],
    trust_boundaries: [],
  },
  threatModel: {
    executive_summary: 'Summary',
    threats: [
      {
        id: 'T-1',
        title: 'Threat A',
        stride_category: 'Tampering',
        severity: 'HIGH',
        affected_components: ['proc-1'],
        description: 'd',
        impact: 'i',
        likelihood: 'MEDIUM',
        mitigation: 'm',
      },
      {
        id: 'T-2',
        title: 'Threat B',
        stride_category: 'Spoofing',
        severity: 'LOW',
        affected_components: ['other'],
        description: 'd',
        impact: 'i',
        likelihood: 'LOW',
        mitigation: 'm',
      },
    ],
  },
  riskRegistry: {
    summary: 'Risks',
    risks: [
      {
        id: 'R-1',
        title: 'Risk A',
        category: 'Data',
        severity: 'HIGH',
        description: 'desc',
        remediation_plan: 'fix',
      },
    ],
  },
}

describe('<JobReport />', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSave.mockClear()
    URL.createObjectURL = jest.fn(() => 'blob:mock')
    URL.revokeObjectURL = jest.fn()
  })

  it('renders three tab triggers with counts from job.metadata', () => {
    render(
      <JobReport job={baseJob} onToastSuccess={jest.fn()} onToastError={jest.fn()} />,
    )
    expect(screen.getByRole('tab', { name: /Data Flow Diagram/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Threat Model \(2\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Risk Registry \(1\)/i })).toBeInTheDocument()
  })

  it('switches active tab on click', async () => {
    const user = userEvent.setup()
    render(
      <JobReport job={baseJob} onToastSuccess={jest.fn()} onToastError={jest.fn()} />,
    )

    await user.click(screen.getByRole('tab', { name: /Threat Model/i }))
    expect(screen.getByText('Threat A')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Risk Registry/i }))
    expect(screen.getByText('Risk A')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Data Flow Diagram/i }))
    expect(screen.getByTestId('dfd-tab-stub')).toBeInTheDocument()
  })

  it('shows Data Flow Diagram not available when dataFlowDiagram is null', async () => {
    const user = userEvent.setup()
    const job = { ...baseJob, dataFlowDiagram: null }
    render(<JobReport job={job} onToastSuccess={jest.fn()} onToastError={jest.fn()} />)
    await user.click(screen.getByRole('tab', { name: /Data Flow Diagram/i }))
    expect(screen.getByText('Data Flow Diagram not available.')).toBeInTheDocument()
  })

  it('shows Threat Model not available when threatModel is null', async () => {
    const user = userEvent.setup()
    const job = { ...baseJob, threatModel: null }
    render(<JobReport job={job} onToastSuccess={jest.fn()} onToastError={jest.fn()} />)
    await user.click(screen.getByRole('tab', { name: /Threat Model/i }))
    expect(screen.getByText('Threat Model not available.')).toBeInTheDocument()
  })

  it('shows Risk Registry not available when riskRegistry is null', async () => {
    const user = userEvent.setup()
    const job = { ...baseJob, riskRegistry: null }
    render(<JobReport job={job} onToastSuccess={jest.fn()} onToastError={jest.fn()} />)
    await user.click(screen.getByRole('tab', { name: /Risk Registry/i }))
    expect(screen.getByText('Risk Registry not available.')).toBeInTheDocument()
  })

  it('filters threats by component and shows Clear filter', async () => {
    const user = userEvent.setup()
    render(
      <JobReport job={baseJob} onToastSuccess={jest.fn()} onToastError={jest.fn()} />,
    )

    fireEvent.click(screen.getByTestId('open-threats-proc-1'))
    await user.click(screen.getByRole('tab', { name: /Threat Model/i }))

    expect(screen.getByText(/Showing threats for component/)).toBeInTheDocument()
    expect(screen.getByText('Threat A')).toBeInTheDocument()
    expect(screen.queryByText('Threat B')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Clear filter/i }))
    expect(screen.queryByText(/Showing threats for component/)).not.toBeInTheDocument()
    expect(screen.getByText('Threat B')).toBeInTheDocument()
  })

  it('disables Excel export when riskRegistry.risks is empty', async () => {
    const user = userEvent.setup()
    const job = { ...baseJob, riskRegistry: { summary: '', risks: [] } }
    render(<JobReport job={job} onToastSuccess={jest.fn()} onToastError={jest.fn()} />)
    await user.click(screen.getByRole('tab', { name: /Risk Registry/i }))
    expect(screen.getByRole('button', { name: /Export to Excel/i })).toBeDisabled()
  })

  it('Excel export success invokes onToastSuccess', async () => {
    const user = userEvent.setup()
    const onToastSuccess = jest.fn()
    render(
      <JobReport job={baseJob} onToastSuccess={onToastSuccess} onToastError={jest.fn()} />,
    )

    await user.click(screen.getByRole('tab', { name: /Risk Registry/i }))
    await user.click(screen.getByRole('button', { name: /Export to Excel/i }))

    expect(onToastSuccess).toHaveBeenCalledWith('Risk Registry exported to Excel successfully!')
  })

  it('PDF export on threat_model tab invokes save without requiring dfd canvas', async () => {
    const user = userEvent.setup()
    const onToastSuccess = jest.fn()
    render(
      <JobReport job={baseJob} onToastSuccess={onToastSuccess} onToastError={jest.fn()} />,
    )

    await user.click(screen.getByRole('tab', { name: /Threat Model/i }))
    await user.click(screen.getByRole('button', { name: /Export PDF/i }))

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalled()
      expect(onToastSuccess).toHaveBeenCalledWith('PDF exported successfully!')
    })
  })
})
