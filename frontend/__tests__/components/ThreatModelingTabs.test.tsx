/**
 * @jest-environment jsdom
 *
 * Smoke test that the new Upload/GitHub tab UI renders and the GitHub source
 * metadata appears in the job list.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { ThreatModeling } from '@/components/ThreatModeling'
import { api } from '@/lib/api'

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'op', role: 'Operator' },
    canScheduleJobs: true,
    isAuthenticated: true,
  }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    getThreatModelingJobs: jest.fn(),
    getThreatModelingJob: jest.fn(),
    getGitHubTokenStatus: jest.fn(),
    threatModeling: jest.fn(),
    deleteThreatModelingJob: jest.fn(),
  },
}))

jest.mock('@/lib/security', () => ({
  sanitizeErrorMessage: (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback),
}))

jest.mock('@/utils/date', () => ({
  formatDateWithTimezone: (s: string) => s,
}))

jest.mock('@/components/dfd/DfdTabContent', () => ({
  DfdTabContent: () => null,
}))

describe('<ThreatModeling /> - tabs and GitHub source rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(api.getGitHubTokenStatus as jest.Mock).mockResolvedValue({ token: { exists: false } })
  })

  it('renders Upload directory and Import from GitHub tabs', async () => {
    ;(api.getThreatModelingJobs as jest.Mock).mockResolvedValue({ jobs: [] })
    render(<ThreatModeling />)
    await waitFor(() => expect(api.getThreatModelingJobs).toHaveBeenCalled())
    expect(screen.getByRole('tab', { name: /Upload directory/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Import from GitHub/i })).toBeInTheDocument()
  })

  it('shows the GitHubImport panel when the GitHub tab is activated', async () => {
    ;(api.getThreatModelingJobs as jest.Mock).mockResolvedValue({ jobs: [] })
    const user = userEvent.setup()
    render(<ThreatModeling />)
    await waitFor(() => expect(api.getThreatModelingJobs).toHaveBeenCalled())
    await user.click(screen.getByRole('tab', { name: /Import from GitHub/i }))
    await waitFor(() =>
      expect(screen.getByPlaceholderText('https://github.com/owner/repo')).toBeInTheDocument(),
    )
  })

  it('renders a GitHub-source job with a clickable link and ref badge', async () => {
    ;(api.getThreatModelingJobs as jest.Mock).mockResolvedValue({
      jobs: [
        {
          id: 'job-gh',
          repoPath: '[GITHUB] octocat/Hello-World@main',
          query: null,
          status: 'pending',
          errorMessage: null,
          repoName: 'Hello-World',
          gitBranch: 'main',
          gitCommit: null,
          sourceType: 'github',
          sourceUrl: 'https://github.com/octocat/Hello-World@main',
          gitRef: 'main',
          gitRefType: 'branch',
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z',
          completedAt: null,
        },
      ],
    })
    render(<ThreatModeling />)
    const link = await screen.findByTestId('github-source-link')
    expect(link).toHaveAttribute('href', 'https://github.com/octocat/Hello-World')
    expect(link).toHaveTextContent('octocat/Hello-World')
    expect(screen.getByText(/Branch: main/)).toBeInTheDocument()
  })
})
