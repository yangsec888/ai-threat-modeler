/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import ReportJobPage from '@/app/reports/[jobId]/page'
import { api } from '@/lib/api'
import type { ThreatModelingJob } from '@/types/threatModelingJob'

const mockBack = jest.fn()
const mockGetThreatModelingJob = api.getThreatModelingJob as jest.MockedFunction<
  typeof api.getThreatModelingJob
>
const mockDownload = api.downloadThreatModelingReport as jest.MockedFunction<
  typeof api.downloadThreatModelingReport
>

jest.mock('next/navigation', () => ({
  useParams: () => ({ jobId: 'job-1' }),
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}))

jest.mock('@/components/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof props.src === 'string' ? props.src : ''} alt={props.alt ?? ''} width={120} height={68} />
  ),
}))

jest.mock('@/components/JobReport', () => ({
  JobReport: () => <div data-testid="job-report-stub" />,
}))

jest.mock('@/components/JobContextCard', () => ({
  JobContextCard: () => <div data-testid="job-context-stub" />,
}))

jest.mock('@/lib/api', () => ({
  api: {
    getThreatModelingJob: jest.fn(),
    downloadThreatModelingReport: jest.fn(),
  },
}))

jest.mock('@/utils/date', () => ({
  formatDateWithTimezone: (s: string) => s,
}))

const completedJob: ThreatModelingJob = {
  id: 'job-1',
  repoPath: '[UPLOADED] test.zip',
  query: null,
  status: 'completed',
  errorMessage: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:01:00.000Z',
  completedAt: '2026-01-01T00:01:00.000Z',
  metadata: {
    project_name: 'My Project',
    scan_date: '2026-01-01',
    methodology: 'STRIDE',
    total_threats_identified: 1,
    total_risks_identified: 1,
  },
  dataFlowDiagram: {
    description: 'd',
    nodes: [],
    data_flows: [],
    trust_boundaries: [],
  },
  contextFields: { projectSummary: 'x', securityContext: null, deploymentContext: null, developerContext: null, suggestedExclusions: null, additionalContext: null },
}

describe('Report job page /reports/[jobId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    document.title = ''
    Object.defineProperty(window.history, 'length', { configurable: true, value: 1 })
  })

  it('shows loading spinner before fetch resolves', () => {
    mockGetThreatModelingJob.mockReturnValue(new Promise(() => {}))
    render(<ReportJobPage />)
    expect(screen.getByLabelText('Loading report')).toBeInTheDocument()
  })

  it('renders JobReport and JobContextCard when job is completed', async () => {
    mockGetThreatModelingJob.mockResolvedValue({
      job: completedJob,
      notFound: false,
      forbidden: false,
      error: null,
    })

    render(<ReportJobPage />)

    await waitFor(() => {
      expect(screen.getByTestId('job-report-stub')).toBeInTheDocument()
    })
    expect(screen.getByTestId('job-context-stub')).toBeInTheDocument()
    expect(screen.getByTestId('report-page-title')).toHaveTextContent('My Project')
    expect(document.title).toContain('My Project')
  })

  it('shows not ready yet when job is still running', async () => {
    mockGetThreatModelingJob.mockResolvedValue({
      job: { ...completedJob, status: 'pending' },
      notFound: false,
      forbidden: false,
      error: null,
    })

    render(<ReportJobPage />)

    await waitFor(() => {
      expect(screen.getByText(/not ready yet/i)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('job-report-stub')).not.toBeInTheDocument()
  })

  it('shows Job not found when result.notFound is true', async () => {
    mockGetThreatModelingJob.mockResolvedValue({
      job: null,
      notFound: true,
      forbidden: false,
      error: null,
    })

    render(<ReportJobPage />)

    await waitFor(() => {
      expect(screen.getByText('Job not found')).toBeInTheDocument()
    })
  })

  it('shows access denied when result.forbidden is true', async () => {
    mockGetThreatModelingJob.mockResolvedValue({
      job: null,
      notFound: false,
      forbidden: true,
      error: null,
    })

    render(<ReportJobPage />)

    await waitFor(() => {
      expect(screen.getByText(/don't have access/i)).toBeInTheDocument()
    })
  })

  it('shows something went wrong when result.error is set', async () => {
    mockGetThreatModelingJob.mockResolvedValue({
      job: null,
      notFound: false,
      forbidden: false,
      error: 'Server error',
    })

    render(<ReportJobPage />)

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })

  it('Back button calls router.back when history.length > 1', async () => {
    Object.defineProperty(window.history, 'length', { configurable: true, value: 2 })
    mockGetThreatModelingJob.mockResolvedValue({
      job: completedJob,
      notFound: false,
      forbidden: false,
      error: null,
    })

    const user = userEvent.setup()
    render(<ReportJobPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Back$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^Back$/i }))
    expect(mockBack).toHaveBeenCalled()
  })

  it('Back link navigates to / when history.length is 1', async () => {
    mockGetThreatModelingJob.mockResolvedValue({
      job: completedJob,
      notFound: false,
      forbidden: false,
      error: null,
    })

    render(<ReportJobPage />)

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Back to jobs/i })
      expect(link).toHaveAttribute('href', '/')
    })
  })

  it('Download JSON invokes api.downloadThreatModelingReport', async () => {
    mockGetThreatModelingJob.mockResolvedValue({
      job: completedJob,
      notFound: false,
      forbidden: false,
      error: null,
    })
    mockDownload.mockResolvedValue(undefined)

    const user = userEvent.setup()
    render(<ReportJobPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download JSON/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Download JSON/i }))

    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledWith('job-1', 'json')
    })
  })
})
