/**
 * @jest-environment jsdom
 *
 * GitHubImport tab tests: URL lookup, ref selection, validation,
 * import-started callback, and PAT-status hint.
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
    importFromGitHub: jest.fn(),
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

  it('looks up a public repo and shows branches/tags', async () => {
    ;(api.checkGitHubRepo as jest.Mock).mockResolvedValue({
      repoInfo: {
        owner: 'octocat', repo: 'Hello-World',
        normalizedUrl: 'https://github.com/octocat/Hello-World',
        defaultBranch: 'main', isPrivate: false, description: 'desc',
        branches: ['main', 'dev'], tags: ['v1.0'],
      },
      hasToken: false,
    })
    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/octocat/Hello-World' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))

    await waitFor(() => expect(screen.getByText(/octocat\/Hello-World/)).toBeInTheDocument())
    // Branch select within the loaded repo card
    const branchSelect = await screen.findByLabelText('Branch') as HTMLSelectElement
    expect(branchSelect.value).toBe('main')
    expect(branchSelect.options.length).toBe(2)
  })

  it('warns when repo is private and no PAT is configured', async () => {
    ;(api.checkGitHubRepo as jest.Mock).mockResolvedValue({
      repoInfo: {
        owner: 'me', repo: 'private-repo',
        normalizedUrl: 'https://github.com/me/private-repo',
        defaultBranch: 'main', isPrivate: true, description: null,
        branches: ['main'], tags: [],
      },
      hasToken: false,
    })
    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/me/private-repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    await waitFor(() => expect(onInfo).toHaveBeenCalledWith(expect.stringMatching(/private/i)))
  })

  it('starts an import and calls onImportStarted', async () => {
    ;(api.checkGitHubRepo as jest.Mock).mockResolvedValue({
      repoInfo: {
        owner: 'octocat', repo: 'Hello-World',
        normalizedUrl: 'https://github.com/octocat/Hello-World',
        defaultBranch: 'main', isPrivate: false, description: null,
        branches: ['main'], tags: [],
      },
      hasToken: false,
    })
    ;(api.importFromGitHub as jest.Mock).mockResolvedValue({
      job: { id: 'job-1', status: 'pending', sourceType: 'github' },
    })
    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/octocat/Hello-World' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    await waitFor(() => screen.getByLabelText(/Branch/i))

    fireEvent.click(screen.getByRole('button', { name: /Import & Create Job/i }))
    await waitFor(() => expect(api.importFromGitHub).toHaveBeenCalled())
    expect(api.importFromGitHub).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/octocat/Hello-World',
      gitRef: 'main',
      gitRefType: 'branch',
      repoName: 'Hello-World',
    })
    expect(onImportStarted).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }))
  })

  it('rejects malformed commit SHA before calling import', async () => {
    ;(api.checkGitHubRepo as jest.Mock).mockResolvedValue({
      repoInfo: {
        owner: 'o', repo: 'r',
        normalizedUrl: 'https://github.com/o/r',
        defaultBranch: 'main', isPrivate: false, description: null,
        branches: ['main'], tags: [],
      },
      hasToken: true,
    })
    render(<GitHubImport onImportStarted={onImportStarted} onError={onError} onInfo={onInfo} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/owner/repo'), {
      target: { value: 'https://github.com/o/r' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up/i }))
    await waitFor(() => screen.getByLabelText(/Branch/i))

    // Switch to commit ref type
    fireEvent.click(screen.getByRole('button', { name: /Commit/i }))
    fireEvent.change(screen.getByLabelText(/Commit SHA/i), { target: { value: 'nothex!' } })
    fireEvent.click(screen.getByRole('button', { name: /Import & Create Job/i }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/hex/i)))
    expect(api.importFromGitHub).not.toHaveBeenCalled()
  })
})
