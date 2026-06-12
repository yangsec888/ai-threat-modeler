/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { GitHubImport } from '@/components/GitHubImport'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: {
    getGitHubTokenStatus: jest.fn(),
    checkGitHubRepo: jest.fn(),
    stageGitHubImport: jest.fn(),
    getThreatModelingStage: jest.fn(),
    runThreatModelingStage: jest.fn(),
    cancelThreatModelingStage: jest.fn(),
  },
}))

jest.mock('@/lib/security', () => ({
  sanitizeErrorMessage: (e: unknown, fallback: string) =>
    e instanceof Error ? e.message : fallback,
}))

describe('<GitHubImport />', () => {
  const onImportStarted = jest.fn()
  const onError = jest.fn()
  const onInfo = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(api.getGitHubTokenStatus as jest.Mock).mockResolvedValue({ token: { exists: false } })
    ;(api.stageGitHubImport as jest.Mock).mockResolvedValue({ stagingId: 'stg-1', status: 'pending' })
    ;(api.getThreatModelingStage as jest.Mock).mockResolvedValue({
      stagingId: 'stg-1',
      status: 'ready',
      draftContextFields: {
        projectSummary: 'Draft summary',
        securityContext: null,
        deploymentContext: null,
        developerContext: null,
        suggestedExclusions: null,
        additionalContext: null,
      },
      extractionError: null,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    })
    ;(api.runThreatModelingStage as jest.Mock).mockResolvedValue({
      jobId: 'job-1',
      job: {
        id: 'job-1',
        status: 'pending',
        repoPath: '[GITHUB] o/r@main',
        sourceType: 'github',
        createdAt: new Date().toISOString(),
      },
    })
  })

  it('renders the URL input and PAT-not-configured hint', async () => {
    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    await waitFor(() => expect(api.getGitHubTokenStatus).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('https://github.com/owner/repo')).toBeInTheDocument()
    expect(screen.getByText(/No PAT/i)).toBeInTheDocument()
  })

  it('calls onError when URL is empty and Look up is clicked', async () => {
    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/repository URL/i))
  })

  it('looks up a public repo and shows Analyze repository', async () => {
    ;(api.checkGitHubRepo as jest.Mock).mockResolvedValue({
      repoInfo: {
        owner: 'octocat',
        repo: 'Hello-World',
        normalizedUrl: 'https://github.com/octocat/Hello-World',
        defaultBranch: 'main',
        isPrivate: false,
        description: 'desc',
        branches: ['main', 'dev'],
        tags: ['v1.0'],
      },
      hasToken: false,
    })
    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/octocat/Hello-World' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))

    await waitFor(() => expect(screen.getByText(/octocat\/Hello-World/)).toBeInTheDocument())
    expect(screen.getByLabelText('Branch name')).toHaveValue('main')
    expect(screen.getByText(/Default branch:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Analyze repository/i })).toBeInTheDocument()
  })

  it('pre-fills default branch when it is missing from the listed branches', async () => {
    ;(api.checkGitHubRepo as jest.Mock).mockResolvedValue({
      repoInfo: {
        owner: 'capsulehealth',
        repo: 'vesto',
        normalizedUrl: 'https://github.com/capsulehealth/vesto',
        defaultBranch: 'master',
        isPrivate: true,
        description: null,
        branches: ['322-athena-demo', 'dev'],
        tags: [],
      },
      hasToken: true,
    })
    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/capsulehealth/vesto' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))

    await waitFor(() => expect(screen.getByLabelText('Branch name')).toHaveValue('master'))
    expect(screen.getByText(/Default branch:/)).toBeInTheDocument()
  })

  it('surfaces the specific extraction error as a toast and inline banner on failure', async () => {
    ;(api.checkGitHubRepo as jest.Mock).mockResolvedValue({
      repoInfo: {
        owner: 'octocat',
        repo: 'Hello-World',
        normalizedUrl: 'https://github.com/octocat/Hello-World',
        defaultBranch: 'main',
        isPrivate: false,
        description: null,
        branches: ['main'],
        tags: [],
      },
      hasToken: false,
    })
    const sizeCapError =
      'Repository archive exceeds the configured size cap (50 MB). Raise the cap in Settings → GitHub → Max archive size (MB) and re-import.'
    ;(api.getThreatModelingStage as jest.Mock).mockResolvedValue({
      stagingId: 'stg-1',
      status: 'failed',
      draftContextFields: null,
      extractionError: sizeCapError,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    })

    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/octocat/Hello-World' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    await waitFor(() => screen.getByRole('button', { name: /Analyze repository/i }))

    fireEvent.click(screen.getByRole('button', { name: /Analyze repository/i }))

    // Toast carries the specific, actionable reason (fired once via the ref guard).
    await waitFor(() => expect(onError).toHaveBeenCalledWith(sizeCapError))
    expect(onError).toHaveBeenCalledTimes(1)

    // Inline banner shows the same reason plus the manual-fallback guidance.
    const banner = await screen.findByTestId('context-extraction-error')
    expect(banner).toHaveTextContent(sizeCapError)
    expect(banner).toHaveTextContent(/Fill in any combination of fields below/i)
  })

  it('runs staging flow and calls onImportStarted after Run', async () => {
    jest.useFakeTimers()
    ;(api.checkGitHubRepo as jest.Mock).mockResolvedValue({
      repoInfo: {
        owner: 'octocat',
        repo: 'Hello-World',
        normalizedUrl: 'https://github.com/octocat/Hello-World',
        defaultBranch: 'main',
        isPrivate: false,
        description: null,
        branches: ['main'],
        tags: [],
      },
      hasToken: false,
    })

    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/octocat/Hello-World' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    await waitFor(() => screen.getByRole('button', { name: /Analyze repository/i }))

    fireEvent.click(screen.getByRole('button', { name: /Analyze repository/i }))
    await waitFor(() => expect(api.stageGitHubImport).toHaveBeenCalled())

    await waitFor(() => screen.getByDisplayValue('Draft summary'), { timeout: 5000 })
    jest.advanceTimersByTime(4000)
    await waitFor(() => screen.getByRole('button', { name: /Run threat model/i }))

    fireEvent.click(screen.getByRole('button', { name: /Run threat model/i }))
    await waitFor(() => expect(api.runThreatModelingStage).toHaveBeenCalled())
    expect(onImportStarted).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }))
    jest.useRealTimers()
  })
})
