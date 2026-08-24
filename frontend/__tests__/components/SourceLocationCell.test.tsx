/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { SourceLocationCell } from '@/components/SourceLocationCell'
import type { ThreatModelingJob } from '@/types/threatModelingJob'

const githubJob: ThreatModelingJob = {
  id: 'job-1',
  repoPath: 'repo',
  query: null,
  status: 'completed',
  errorMessage: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  completedAt: '2026-01-01',
  sourceType: 'github',
  sourceUrl: 'https://github.com/octocat/Hello-World@main',
  gitCommit: 'abc123',
}

describe('<SourceLocationCell />', () => {
  it('renders an ungrounded badge when no locations', () => {
    render(<SourceLocationCell locations={undefined} job={githubJob} />)
    expect(screen.getByTestId('ungrounded-badge')).toBeInTheDocument()
    expect(screen.getByText(/Ungrounded — verify/i)).toBeInTheDocument()
  })

  it('expands snippet and GitHub link on click', async () => {
    const user = userEvent.setup()
    render(
      <SourceLocationCell
        job={githubJob}
        locations={[
          {
            file: 'src/db.py',
            line_numbers: '42',
            symbol: 'run_query',
            snippet: 'cursor.execute(sql)',
          },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'src/db.py:42' }))
    expect(screen.getByText(/Symbol:/)).toBeInTheDocument()
    expect(screen.getByText('run_query')).toBeInTheDocument()
    expect(screen.getByText('cursor.execute(sql)')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'View on GitHub' })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/octocat/Hello-World/blob/abc123/src/db.py#L42',
    )
  })
})
