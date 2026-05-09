/**
 * @jest-environment jsdom
 *
 * Settings page tests focused on the encryption-status badge replacing the
 * encryption_key input and the new GitHub PAT card.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { Settings } from '@/components/Settings'
import { api } from '@/lib/api'

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', role: 'Admin' },
    isAuthenticated: true,
  }),
}))

jest.mock('@/lib/api', () => ({
  api: {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    regenerateEncryptionKey: jest.fn(),
    validateApiKey: jest.fn(),
    getGitHubTokenStatus: jest.fn(),
    setGitHubToken: jest.fn(),
    deleteGitHubToken: jest.fn(),
    validateGitHubToken: jest.fn(),
  },
}))

jest.mock('@/utils/date', () => ({
  getCommonTimezones: () => [{ value: 'UTC', label: 'UTC' }],
}))

jest.mock('@/config', () => ({
  getConfig: () => ({ anthropic: { apiKey: '', baseUrl: '' }, timezone: 'UTC' }),
  updateConfig: jest.fn(),
}))

describe('<Settings />', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(api.getSettings as jest.Mock).mockResolvedValue({
      settings: {
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        claude_code_max_output_tokens: 32000,
        github_max_archive_size_mb: 50,
        updated_at: 't',
      },
    })
    ;(api.getGitHubTokenStatus as jest.Mock).mockResolvedValue({
      token: { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null },
    })
  })

  it('shows the encryption-configured badge and no editable encryption key input', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByTestId('encryption-status-configured'))
    expect(screen.queryByLabelText(/^Encryption Key$/)).not.toBeInTheDocument()
  })

  it('renders the GitHub PAT card and shows the "no PAT" empty state', async () => {
    render(<Settings />)
    await waitFor(() => document.getElementById('github-token'))
    expect(screen.getByText(/No PAT configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save PAT/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test connection/i })).toBeInTheDocument()
  })

  it('disables Save PAT path with empty input', async () => {
    ;(api.setGitHubToken as jest.Mock).mockResolvedValue({
      token: { exists: true, name: null, createdAt: 't', updatedAt: 't', lastUsedAt: null },
    })
    const user = userEvent.setup()
    render(<Settings />)
    const saveBtn = await screen.findByRole('button', { name: /Save PAT/i })
    // Empty input should not call the API
    await user.click(saveBtn)
    expect(api.setGitHubToken).not.toHaveBeenCalled()
  })

  it('shows existing PAT and allows removal', async () => {
    ;(api.getGitHubTokenStatus as jest.Mock).mockResolvedValue({
      token: {
        exists: true, name: 'mine',
        createdAt: '2026-05-09T12:00:00Z', updatedAt: '2026-05-09T12:00:00Z', lastUsedAt: null,
      },
    })
    ;(api.deleteGitHubToken as jest.Mock).mockResolvedValue({ status: 'success' })
    window.confirm = jest.fn(() => true)
    render(<Settings />)
    await waitFor(() => screen.getByText(/PAT configured \(mine\)/i))
    fireEvent.click(screen.getByRole('button', { name: /Remove/i }))
    await waitFor(() => expect(api.deleteGitHubToken).toHaveBeenCalled())
  })
})
