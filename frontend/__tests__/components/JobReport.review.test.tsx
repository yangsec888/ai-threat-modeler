/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { JobReport } from '@/components/JobReport'
import type { ThreatModelingJob } from '@/types/threatModelingJob'

jest.mock('@/components/dfd/DfdTabContent', () => ({
  DfdTabContent: () => <div data-testid="dfd-tab-stub" />,
}))

const mockUpdateThreatReview = jest.fn()
jest.mock('@/lib/api', () => ({
  api: {
    updateThreatReview: (...args: unknown[]) => mockUpdateThreatReview(...args),
  },
}))

jest.mock('jspdf', () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 300, getHeight: () => 200 } },
    setFontSize: jest.fn(),
    text: jest.fn(),
    splitTextToSize: jest.fn(() => ['line']),
    save: jest.fn(),
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
    total_threats_identified: 1,
    total_risks_identified: 1,
  },
  dataFlowDiagram: {
    description: 'DFD',
    nodes: [],
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
        related_threats: ['T-1'],
      },
    ],
  },
}

describe('<JobReport /> review status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateThreatReview.mockResolvedValue({ status: 'success', review: {} })
  })

  it('renders an Unreviewed badge and a review select per threat by default', async () => {
    render(<JobReport job={baseJob} onToastSuccess={jest.fn()} onToastError={jest.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: /Threat Model/i }))

    expect(screen.getByTestId('review-select-T-1')).toHaveValue('unreviewed')
    expect(screen.getAllByText('Unreviewed').length).toBeGreaterThan(0)
  })

  it('persists a selected review status and shows the badge optimistically', async () => {
    const onToastSuccess = jest.fn()
    const onToastError = jest.fn()
    render(
      <JobReport job={baseJob} onToastSuccess={onToastSuccess} onToastError={onToastError} />,
    )
    await userEvent.click(screen.getByRole('tab', { name: /Threat Model/i }))

    await userEvent.selectOptions(screen.getByTestId('review-select-T-1'), 'accepted')

    expect(mockUpdateThreatReview).toHaveBeenCalledWith('job-1', {
      findingId: 'T-1',
      status: 'accepted',
    })
    await waitFor(() => expect(onToastSuccess).toHaveBeenCalledWith('Review status saved'))
    // Badge reflects the new status (badge span + select option both show "Accepted").
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0)
    expect(onToastError).not.toHaveBeenCalled()
  })

  it('reverts the optimistic update and shows an error when the PATCH fails', async () => {
    mockUpdateThreatReview.mockRejectedValue(new Error('boom'))
    const onToastError = jest.fn()
    render(<JobReport job={baseJob} onToastSuccess={jest.fn()} onToastError={onToastError} />)
    await userEvent.click(screen.getByRole('tab', { name: /Threat Model/i }))

    await userEvent.selectOptions(screen.getByTestId('review-select-T-1'), 'accepted')

    await waitFor(() =>
      expect(onToastError).toHaveBeenCalledWith('Failed to save review: boom'),
    )
    // Select reverted to unreviewed.
    await waitFor(() => expect(screen.getByTestId('review-select-T-1')).toHaveValue('unreviewed'))
  })

  it('derives a review badge for a risk from its linked threat', async () => {
    const jobWithRiskStatus: ThreatModelingJob = {
      ...baseJob,
      threatModel: {
        ...baseJob.threatModel!,
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
            review_status: 'accepted',
          },
        ],
      },
    }
    const onToastSuccess = jest.fn()
    render(
      <JobReport
        job={jobWithRiskStatus}
        onToastSuccess={onToastSuccess}
        onToastError={jest.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('tab', { name: /Risk Registry/i }))

    expect(screen.getByText('Accepted')).toBeInTheDocument()
  })

  it('shows an ungrounded badge for a threat with no source locations', async () => {
    render(<JobReport job={baseJob} onToastSuccess={jest.fn()} onToastError={jest.fn()} />)
    await userEvent.click(screen.getByRole('tab', { name: /Threat Model/i }))

    // T-1 has no source_locations in this fixture.
    expect(screen.getAllByTestId('ungrounded-badge').length).toBeGreaterThan(0)
    expect(screen.getByText(/Ungrounded — verify/i)).toBeInTheDocument()
  })
})
