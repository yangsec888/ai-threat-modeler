/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { CompareBaseline } from '@/components/CompareBaseline'
import type { ThreatModelingJob } from '@/types/threatModelingJob'
import type { ThreatModelComparison } from '@/types/threatModel'

const mockCompare = jest.fn()
jest.mock('@/lib/api', () => ({
  api: {
    compareThreatModel: (...args: unknown[]) => mockCompare(...args),
  },
}))

const baseJob: ThreatModelingJob = {
  id: 'job-1',
  repoPath: 'repo',
  query: null,
  status: 'completed',
  errorMessage: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:00.000Z',
}

const comparison: ThreatModelComparison = {
  matched: [
    {
      generated: { id: 'G1', title: 'SQL Injection', category: 'Tampering' },
      baseline: { id: 'B1', title: 'SQL Injection', category: 'Tampering' },
      tier: 'exact',
      confidence: 1,
    },
  ],
  missed: [{ id: 'B2', title: 'SSRF' }],
  extra: [{ id: 'G2', title: 'XSS' }],
  recall: 0.5,
  precision: 0.5,
}

describe('<CompareBaseline />', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCompare.mockResolvedValue(comparison)
  })

  it('compares against a pasted baseline and renders the summary + lists', async () => {
    const user = userEvent.setup()
    const onToastSuccess = jest.fn()
    render(
      <CompareBaseline job={baseJob} onToastSuccess={onToastSuccess} onToastError={jest.fn()} />,
    )

    const input = screen.getByTestId('baseline-json-input')
    await user.click(input)
    await user.paste(
      '{"threats": [{"title": "SQL Injection", "stride_category": "Tampering"}]}',
    )
    await user.click(screen.getByRole('button', { name: /Compare against baseline/i }))

    await waitFor(() =>
      expect(mockCompare).toHaveBeenCalledWith('job-1', {
        threats: [{ title: 'SQL Injection', stride_category: 'Tampering' }],
      }),
    )

    expect(screen.getByTestId('comparison-result')).toBeInTheDocument()
    expect(screen.getAllByText('Matched').length).toBeGreaterThan(0)
    expect(screen.getByText('SQL Injection')).toBeInTheDocument()
    expect(screen.getByTestId('missed-list')).toHaveTextContent('SSRF')
    expect(screen.getByTestId('extra-list')).toHaveTextContent('XSS')
    await waitFor(() => expect(onToastSuccess).toHaveBeenCalledWith('Comparison complete'))
  })

  it('shows a parse error for invalid baseline JSON', async () => {
    const user = userEvent.setup()
    render(
      <CompareBaseline job={baseJob} onToastSuccess={jest.fn()} onToastError={jest.fn()} />,
    )

    await user.type(screen.getByTestId('baseline-json-input'), 'not-json')
    await user.click(screen.getByRole('button', { name: /Compare against baseline/i }))

    expect(screen.getByTestId('baseline-parse-error')).toBeInTheDocument()
    expect(mockCompare).not.toHaveBeenCalled()
  })
})
