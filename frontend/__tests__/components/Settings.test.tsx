/**
 * @jest-environment jsdom
 *
 * Settings page tests focused on the encryption-status badge replacing the
 * encryption_key input and the new GitHub PAT card.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { Settings } from '@/components/Settings'
import { api } from '@/lib/api'

jest.mock('@/contexts/AuthContext', () => {
  // Stable reference so the Settings load effect (dep: user) doesn't re-fire on
  // every render and clobber locally-edited state.
  const user = { id: 1, username: 'admin', role: 'Admin' }
  return {
    useAuth: () => ({ user, isAuthenticated: true }),
  }
})

jest.mock('@/lib/api', () => ({
  api: {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    regenerateEncryptionKey: jest.fn(),
    validateApiKey: jest.fn(),
    getModels: jest.fn(),
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
        openai_api_key: null,
        openai_base_url: 'https://api.openai.com/v1',
        llm_provider: 'claude',
        claude_model: null,
        openai_model: 'gpt-4.1',
        claude_code_max_output_tokens: 32000,
        github_max_archive_size_mb: 50,
        updated_at: 't',
      },
    })
    ;(api.getGitHubTokenStatus as jest.Mock).mockResolvedValue({
      token: { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null },
    })
    ;(api.getModels as jest.Mock).mockResolvedValue({ status: 'success', provider: 'claude', models: [] })
  })

  it('shows the encryption-configured badge and no editable encryption key input', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByTestId('encryption-status-configured'))
    expect(screen.queryByLabelText(/^Encryption Key$/)).not.toBeInTheDocument()
  })

  it('renders the GitHub PAT card and shows the "no PAT" empty state', async () => {
    render(<Settings />)
    await screen.findByText(/No PAT configured/i)
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

  describe('LLM Provider model selection (v2.0.1)', () => {
    beforeEach(() => {
      ;(api.getModels as jest.Mock).mockImplementation((provider: 'claude' | 'codex') =>
        Promise.resolve({
          status: 'success',
          provider,
          models:
            provider === 'claude'
              ? [{ id: 'claude-opus-4-20250514', label: 'Claude Opus 4' }]
              : [
                  { id: 'gpt-4.1', label: 'gpt-4.1' },
                  { id: 'o3', label: 'o3' },
                ],
        }),
      )
    })

    it('loads provider models into the Claude and OpenAI dropdowns on mount', async () => {
      render(<Settings />)
      await waitFor(() => expect(api.getModels).toHaveBeenCalledWith('claude'))
      await waitFor(() => expect(api.getModels).toHaveBeenCalledWith('codex'))

      const claudeSelect = (await screen.findByLabelText('Claude Model')) as HTMLSelectElement
      await waitFor(() =>
        expect(within(claudeSelect).getByRole('option', { name: 'Claude Opus 4' })).toBeInTheDocument(),
      )
      // Claude keeps the agent-default empty option.
      expect(within(claudeSelect).getByRole('option', { name: /opus \(agent default\)/i })).toBeInTheDocument()

      const openaiSelect = screen.getByLabelText('OpenAI Model') as HTMLSelectElement
      expect(within(openaiSelect).getByRole('option', { name: 'o3' })).toBeInTheDocument()
    })

    it('refreshes the Claude model list when "Refresh list" is clicked', async () => {
      render(<Settings />)
      await waitFor(() => expect(api.getModels).toHaveBeenCalledWith('claude'))
      ;(api.getModels as jest.Mock).mockClear()

      const refreshButtons = screen.getAllByRole('button', { name: /Refresh list/i })
      fireEvent.click(refreshButtons[0])

      await waitFor(() => expect(api.getModels).toHaveBeenCalledWith('claude'))
    })

    it('saves the selected Claude model and shows a success toast', async () => {
      ;(api.updateSettings as jest.Mock).mockResolvedValue({ status: 'success' })
      const user = userEvent.setup()
      render(<Settings />)

      const claudeSelect = (await screen.findByLabelText('Claude Model')) as HTMLSelectElement
      await waitFor(() =>
        expect(within(claudeSelect).getByRole('option', { name: 'Claude Opus 4' })).toBeInTheDocument(),
      )
      await user.selectOptions(claudeSelect, 'claude-opus-4-20250514')
      await waitFor(() => expect(claudeSelect.value).toBe('claude-opus-4-20250514'))

      await user.click(screen.getByRole('button', { name: /Save Configuration/i }))

      await waitFor(() => expect(api.updateSettings).toHaveBeenCalled())
      expect(api.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ claude_model: 'claude-opus-4-20250514' }),
      )
      expect((await screen.findAllByText(/Configuration saved successfully/i)).length).toBeGreaterThan(0)
    })

    it('shows a toast when Reset to Defaults is clicked', async () => {
      const user = userEvent.setup()
      render(<Settings />)
      await screen.findByLabelText('Claude Model')

      await user.click(screen.getByRole('button', { name: /Reset to Defaults/i }))

      expect(await screen.findByText(/Settings reset to defaults/i)).toBeInTheDocument()
    })
  })
})
