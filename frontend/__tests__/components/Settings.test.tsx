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
        threat_modeler_max_turns: 100,
        threat_adversary_enabled: true,
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

  it('renders the GitHub PAT card without a card-level save button', async () => {
    render(<Settings />)
    await screen.findByText(/No PAT configured/i)
    expect(screen.getByText(/No PAT configured/i)).toBeInTheDocument()
    // The PAT is saved via the bottom "Save Configuration" button now.
    expect(screen.queryByRole('button', { name: /Save PAT/i })).not.toBeInTheDocument()
    // Inline GitHub PAT "Test" button is present (aria-labelled for a11y).
    expect(screen.getByRole('button', { name: 'Test GitHub PAT' })).toBeInTheDocument()
  })

  it('does not call setGitHubToken from the global save when the PAT field is empty', async () => {
    ;(api.updateSettings as jest.Mock).mockResolvedValue({ status: 'success' })
    const user = userEvent.setup()
    render(<Settings />)
    await screen.findByText(/No PAT configured/i)

    await user.click(screen.getByRole('button', { name: /Save Configuration/i }))

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled())
    expect(api.setGitHubToken).not.toHaveBeenCalled()
  })

  it('saves a typed PAT through the global Save Configuration button', async () => {
    ;(api.updateSettings as jest.Mock).mockResolvedValue({ status: 'success' })
    ;(api.setGitHubToken as jest.Mock).mockResolvedValue({
      token: { exists: true, name: 'mine', createdAt: 't', updatedAt: 't', lastUsedAt: null },
      githubLogin: 'octocat',
    })
    const user = userEvent.setup()
    render(<Settings />)
    await screen.findByText(/No PAT configured/i)

    await user.type(screen.getByLabelText(/Token name/i), 'mine')
    await user.type(screen.getByLabelText(/Personal Access Token/i), 'ghp_abc123')
    await user.click(screen.getByRole('button', { name: /Save Configuration/i }))

    await waitFor(() => expect(api.setGitHubToken).toHaveBeenCalledWith('ghp_abc123', 'mine'))
  })

  it('shows a configured PAT with a Test button and no Remove button', async () => {
    ;(api.getGitHubTokenStatus as jest.Mock).mockResolvedValue({
      token: {
        exists: true, name: 'mine',
        createdAt: '2026-05-09T12:00:00Z', updatedAt: '2026-05-09T12:00:00Z', lastUsedAt: null,
      },
    })
    render(<Settings />)
    await waitFor(() => screen.getByText(/PAT configured \(mine\)/i))
    expect(screen.getByRole('button', { name: 'Test GitHub PAT' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument()
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

    it('shows only the active provider settings and populates its model dropdown', async () => {
      const user = userEvent.setup()
      render(<Settings />)
      await waitFor(() => expect(api.getModels).toHaveBeenCalledWith('claude'))

      // Default provider is Claude: only Anthropic settings are visible.
      const claudeSelect = (await screen.findByLabelText('Claude Model')) as HTMLSelectElement
      await waitFor(() =>
        expect(within(claudeSelect).getByRole('option', { name: 'Claude Opus 4' })).toBeInTheDocument(),
      )
      expect(within(claudeSelect).getByRole('option', { name: /opus \(agent default\)/i })).toBeInTheDocument()
      expect(screen.queryByLabelText('OpenAI Model')).not.toBeInTheDocument()

      // Switching to OpenAI hides Claude settings and reveals OpenAI settings.
      await user.selectOptions(screen.getByLabelText('Active Provider'), 'codex')

      const openaiSelect = (await screen.findByLabelText('OpenAI Model')) as HTMLSelectElement
      await waitFor(() =>
        expect(within(openaiSelect).getByRole('option', { name: 'o3' })).toBeInTheDocument(),
      )
      expect(screen.queryByLabelText('Claude Model')).not.toBeInTheDocument()
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

    it('renders threat modeler max turns and adversary pass controls', async () => {
      render(<Settings />)
      await screen.findByLabelText('Claude Model')
      expect(screen.getByLabelText(/Threat Modeler Max Turns/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Adversarial 2nd pass/i)).toBeInTheDocument()
    })
  })

  describe('OpenAI API key status and Test button', () => {
    const codexSettings = (openaiKey: string | null) => ({
      settings: {
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        openai_api_key: openaiKey,
        openai_base_url: 'https://api.openai.com/v1',
        llm_provider: 'codex',
        claude_model: null,
        openai_model: 'gpt-4.1',
        claude_code_max_output_tokens: 32000,
        github_max_archive_size_mb: 50,
        updated_at: 't',
      },
    })

    it('shows the configured status badge when a key is saved', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(codexSettings('***ENCRYPTED***'))
      render(<Settings />)
      expect(await screen.findByTestId('openai-key-status-configured')).toBeInTheDocument()
      expect(screen.queryByTestId('openai-key-status-missing')).not.toBeInTheDocument()
    })

    it('shows the not-configured status badge when no key is saved', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(codexSettings(null))
      render(<Settings />)
      expect(await screen.findByTestId('openai-key-status-missing')).toBeInTheDocument()
      expect(screen.queryByTestId('openai-key-status-configured')).not.toBeInTheDocument()
    })

    it('Test exercises the saved key via the models endpoint when the field is blank', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(codexSettings('***ENCRYPTED***'))
      ;(api.getModels as jest.Mock).mockResolvedValue({ status: 'success', provider: 'codex', models: [] })
      const user = userEvent.setup()
      render(<Settings />)
      await screen.findByTestId('openai-key-status-configured')
      ;(api.getModels as jest.Mock).mockClear()

      await user.click(screen.getByRole('button', { name: 'Test OpenAI API key' }))

      await waitFor(() => expect(api.getModels).toHaveBeenCalledWith('codex'))
      expect(await screen.findByText(/Saved OpenAI API key is valid/i)).toBeInTheDocument()
      expect(api.validateApiKey).not.toHaveBeenCalled()
    })

    it('Test validates the entered key against the codex provider', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(codexSettings(null))
      ;(api.validateApiKey as jest.Mock).mockResolvedValue({ valid: true, message: 'Key OK' })
      const user = userEvent.setup()
      render(<Settings />)
      await screen.findByTestId('openai-key-status-missing')

      await user.type(screen.getByLabelText('OpenAI API Key'), 'sk-openai-123')
      await user.click(screen.getByRole('button', { name: 'Test OpenAI API key' }))

      await waitFor(() =>
        expect(api.validateApiKey).toHaveBeenCalledWith('sk-openai-123', 'https://api.openai.com/v1', 'codex'),
      )
      expect(await screen.findByText(/Key OK/i)).toBeInTheDocument()
    })

    it('Test warns when no key is entered and none is saved', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(codexSettings(null))
      const user = userEvent.setup()
      render(<Settings />)
      await screen.findByTestId('openai-key-status-missing')

      await user.click(screen.getByRole('button', { name: 'Test OpenAI API key' }))

      expect(await screen.findByText(/Enter an OpenAI API key to test/i)).toBeInTheDocument()
    })
  })

  describe('DeepInfra API key status and Test button', () => {
    const deepinfraSettings = (deepinfraKey: string | null) => ({
      settings: {
        encryption_key_configured: true,
        anthropic_api_key: null,
        anthropic_base_url: 'https://api.anthropic.com',
        openai_api_key: null,
        openai_base_url: 'https://api.openai.com/v1',
        deepinfra_api_key: deepinfraKey,
        deepinfra_base_url: 'https://api.deepinfra.com/v1/openai',
        deepinfra_reasoning_effort: 'medium',
        llm_provider: 'deepinfra',
        claude_model: null,
        openai_model: 'gpt-4.1',
        deepinfra_model: 'moonshotai/Kimi-K2.6',
        claude_code_max_output_tokens: 32000,
        github_max_archive_size_mb: 50,
        updated_at: 't',
      },
    })

    it('reveals only the DeepInfra section when deepinfra is the active provider', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(deepinfraSettings(null))
      render(<Settings />)
      expect(await screen.findByLabelText('DeepInfra Model')).toBeInTheDocument()
      expect(screen.getByLabelText('Reasoning Effort')).toBeInTheDocument()
      expect(screen.queryByLabelText('Claude Model')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('OpenAI Model')).not.toBeInTheDocument()
    })

    it('shows the configured status badge when a key is saved', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(deepinfraSettings('***ENCRYPTED***'))
      render(<Settings />)
      expect(await screen.findByTestId('deepinfra-key-status-configured')).toBeInTheDocument()
      expect(screen.queryByTestId('deepinfra-key-status-missing')).not.toBeInTheDocument()
    })

    it('Test validates the entered key against the deepinfra provider', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(deepinfraSettings(null))
      ;(api.validateApiKey as jest.Mock).mockResolvedValue({ valid: true, message: 'Key OK' })
      const user = userEvent.setup()
      render(<Settings />)
      await screen.findByTestId('deepinfra-key-status-missing')

      await user.type(screen.getByLabelText('DeepInfra API Key'), 'sk-deepinfra-123')
      await user.click(screen.getByRole('button', { name: 'Test DeepInfra API key' }))

      await waitFor(() =>
        expect(api.validateApiKey).toHaveBeenCalledWith('sk-deepinfra-123', 'https://api.deepinfra.com/v1/openai', 'deepinfra'),
      )
      expect(await screen.findByText(/Key OK/i)).toBeInTheDocument()
    })
  })

  describe('Anthropic API key status and Test button', () => {
    const claudeSettings = (anthropicKey: string | null) => ({
      settings: {
        encryption_key_configured: true,
        anthropic_api_key: anthropicKey,
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

    it('shows the configured status badge when a key is saved', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(claudeSettings('***ENCRYPTED***'))
      render(<Settings />)
      expect(await screen.findByTestId('anthropic-key-status-configured')).toBeInTheDocument()
      expect(screen.queryByTestId('anthropic-key-status-missing')).not.toBeInTheDocument()
    })

    it('shows the not-configured status badge when no key is saved', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(claudeSettings(null))
      render(<Settings />)
      expect(await screen.findByTestId('anthropic-key-status-missing')).toBeInTheDocument()
      expect(screen.queryByTestId('anthropic-key-status-configured')).not.toBeInTheDocument()
    })

    it('Test exercises the saved key via the models endpoint when the field is blank', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(claudeSettings('***ENCRYPTED***'))
      ;(api.getModels as jest.Mock).mockResolvedValue({ status: 'success', provider: 'claude', models: [] })
      const user = userEvent.setup()
      render(<Settings />)
      await screen.findByTestId('anthropic-key-status-configured')
      ;(api.getModels as jest.Mock).mockClear()

      await user.click(screen.getByRole('button', { name: 'Test Anthropic API key' }))

      await waitFor(() => expect(api.getModels).toHaveBeenCalledWith('claude'))
      expect(await screen.findByText(/Saved Anthropic API key is valid/i)).toBeInTheDocument()
      expect(api.validateApiKey).not.toHaveBeenCalled()
    })

    it('Test validates the entered key against the claude provider', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(claudeSettings(null))
      ;(api.validateApiKey as jest.Mock).mockResolvedValue({ valid: true, message: 'Key OK' })
      const user = userEvent.setup()
      render(<Settings />)
      await screen.findByTestId('anthropic-key-status-missing')

      await user.type(screen.getByLabelText('Anthropic API Key'), 'sk-ant-123')
      await user.click(screen.getByRole('button', { name: 'Test Anthropic API key' }))

      await waitFor(() =>
        expect(api.validateApiKey).toHaveBeenCalledWith('sk-ant-123', 'https://api.anthropic.com', 'claude'),
      )
      expect(await screen.findByText(/Key OK/i)).toBeInTheDocument()
    })

    it('Test warns when no key is entered and none is saved', async () => {
      ;(api.getSettings as jest.Mock).mockResolvedValue(claudeSettings(null))
      const user = userEvent.setup()
      render(<Settings />)
      await screen.findByTestId('anthropic-key-status-missing')

      await user.click(screen.getByRole('button', { name: 'Test Anthropic API key' }))

      expect(await screen.findByText(/Enter an Anthropic API key to test/i)).toBeInTheDocument()
    })
  })
})
