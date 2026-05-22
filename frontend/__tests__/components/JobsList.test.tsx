/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { JobsList } from '@/components/JobsList'
import type { ThreatModelingJob } from '@/types/threatModelingJob'

jest.mock('@/utils/date', () => ({
  formatDateWithTimezone: (s: string) => s,
}))

const completedJob: ThreatModelingJob = {
  id: 'job-completed-1',
  repoPath: '[UPLOADED] app.zip',
  query: null,
  status: 'completed',
  errorMessage: null,
  repoName: 'my-app',
  gitBranch: 'main',
  gitCommit: null,
  sourceType: 'github',
  sourceUrl: 'https://github.com/octocat/Hello-World@main',
  gitRef: 'main',
  gitRefType: 'branch',
  executionDuration: 120,
  apiCost: '$1.00',
  createdAt: '2026-05-09T10:00:00Z',
  updatedAt: '2026-05-09T10:05:00Z',
  completedAt: '2026-05-09T10:05:00Z',
}

const pendingJob: ThreatModelingJob = {
  ...completedJob,
  id: 'job-pending-1',
  status: 'pending',
  completedAt: null,
}

describe('<JobsList />', () => {
  it('Preview button onClick invokes onPreview with the right job id', () => {
    const onPreview = jest.fn()
    render(
      <JobsList
        jobs={[completedJob]}
        isAuditor={false}
        onPreview={onPreview}
        onDownloadJson={jest.fn()}
        onDeleteJob={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Preview/i }))
    expect(onPreview).toHaveBeenCalledWith('job-completed-1')
  })

  it('Preview button is hidden when status is not completed', () => {
    render(
      <JobsList
        jobs={[pendingJob]}
        isAuditor={false}
        onPreview={jest.fn()}
        onDownloadJson={jest.fn()}
        onDeleteJob={jest.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /Preview/i })).not.toBeInTheDocument()
  })

  it('Delete button is hidden when isAuditor is true', () => {
    render(
      <JobsList
        jobs={[completedJob]}
        isAuditor
        onPreview={jest.fn()}
        onDownloadJson={jest.fn()}
        onDeleteJob={jest.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument()
  })

  it('renders source-type badges, branch ref, duration and cost', () => {
    render(
      <JobsList
        jobs={[completedJob]}
        isAuditor={false}
        onPreview={jest.fn()}
        onDownloadJson={jest.fn()}
        onDeleteJob={jest.fn()}
      />,
    )

    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText(/Repo: my-app/)).toBeInTheDocument()
    expect(screen.getByText(/Branch: main/)).toBeInTheDocument()
    expect(screen.getByText(/Duration: 2m/)).toBeInTheDocument()
    expect(screen.getByText(/\$1\.00/)).toBeInTheDocument()
    expect(screen.getByTestId('github-source-link')).toHaveAttribute(
      'href',
      'https://github.com/octocat/Hello-World',
    )
  })

  it('Download JSON button onClick invokes onDownloadJson', () => {
    const onDownloadJson = jest.fn()
    render(
      <JobsList
        jobs={[completedJob]}
        isAuditor={false}
        onPreview={jest.fn()}
        onDownloadJson={onDownloadJson}
        onDeleteJob={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Download JSON/i }))
    expect(onDownloadJson).toHaveBeenCalledWith('job-completed-1')
  })
})
