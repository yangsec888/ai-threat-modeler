/**
 * Settings Component for AI Threat Modeler Dashboard
 *
 * Author: Sam Li
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { getCommonTimezones } from '@/utils/date'
import { updateConfig, getConfig } from '@/config'
import { CheckCircle2, KeyRound, Github, ShieldCheck } from 'lucide-react'

interface GitHubTokenStatus {
  exists: boolean
  name: string | null
  createdAt: string | null
  updatedAt: string | null
  lastUsedAt: string | null
}

interface ModelOption {
  id: string
  label: string
}

export function Settings() {
  const { user, isAuthenticated } = useAuth()
  const { toasts, success, error: showError, removeToast } = useToast()
  const [encryptionKeyConfigured, setEncryptionKeyConfigured] = useState(false)
  const [llmProvider, setLlmProvider] = useState<'claude' | 'codex'>('claude')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('https://api.openai.com/v1')
  const [claudeModel, setClaudeModel] = useState('')
  const [openaiModel, setOpenaiModel] = useState('gpt-4.1')
  const [claudeModels, setClaudeModels] = useState<ModelOption[]>([])
  const [openaiModels, setOpenaiModels] = useState<ModelOption[]>([])
  const [loadingClaudeModels, setLoadingClaudeModels] = useState(false)
  const [loadingOpenaiModels, setLoadingOpenaiModels] = useState(false)
  const [claudeCodeMaxOutputTokens, setClaudeCodeMaxOutputTokens] = useState<number | null>(32000)
  const [githubMaxArchiveSizeMb, setGithubMaxArchiveSizeMb] = useState<number>(50)
  const [timezone, setTimezone] = useState('UTC')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [newEncryptionKey, setNewEncryptionKey] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  // GitHub PAT state
  const [githubTokenStatus, setGithubTokenStatus] = useState<GitHubTokenStatus | null>(null)
  const [githubTokenInput, setGithubTokenInput] = useState('')
  const [githubTokenName, setGithubTokenName] = useState('')
  const [savingGithubToken, setSavingGithubToken] = useState(false)
  const [testingGithubToken, setTestingGithubToken] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      if (!isAuthenticated || user?.role !== 'Admin') {
        const currentConfig = getConfig()
        setAnthropicApiKey(currentConfig.anthropic.apiKey)
        setAnthropicBaseUrl(currentConfig.anthropic.baseUrl)
        setTimezone(currentConfig.timezone || 'UTC')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await api.getSettings()
        const settings = response.settings

        setEncryptionKeyConfigured(!!settings.encryption_key_configured)
        setLlmProvider(settings.llm_provider === 'codex' ? 'codex' : 'claude')
        setAnthropicBaseUrl(settings.anthropic_base_url || 'https://api.anthropic.com')
        setOpenaiBaseUrl(settings.openai_base_url || 'https://api.openai.com/v1')
        setClaudeModel(settings.claude_model ?? '')
        setOpenaiModel(settings.openai_model || 'gpt-4.1')
        setClaudeCodeMaxOutputTokens(settings.claude_code_max_output_tokens ?? 32000)
        setGithubMaxArchiveSizeMb(settings.github_max_archive_size_mb ?? 50)
        setAnthropicApiKey('')
        setOpenaiApiKey('')

        const currentConfig = getConfig()
        setTimezone(currentConfig.timezone || 'UTC')

        try {
          const tokenRes = await api.getGitHubTokenStatus()
          setGithubTokenStatus(tokenRes.token ?? null)
        } catch (err) {
          console.warn('Failed to load GitHub token status:', err)
        }

        // Best-effort: populate model dropdowns from each provider. Requires a
        // saved API key, so failures are expected and silently ignored here.
        for (const provider of ['claude', 'codex'] as const) {
          try {
            const modelsRes = await api.getModels(provider)
            if (provider === 'claude') setClaudeModels(modelsRes.models)
            else setOpenaiModels(modelsRes.models)
          } catch (err) {
            console.warn(`Failed to load ${provider} models:`, err)
          }
        }
      } catch (err: unknown) {
        console.error('Failed to load settings:', err)
        if (err instanceof Error) setError(err.message)
        else setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [isAuthenticated, user])

  const loadModels = async (provider: 'claude' | 'codex', options?: { silent?: boolean }) => {
    if (provider === 'claude') setLoadingClaudeModels(true)
    else setLoadingOpenaiModels(true)
    try {
      const res = await api.getModels(provider)
      if (provider === 'claude') setClaudeModels(res.models)
      else setOpenaiModels(res.models)
    } catch (err: unknown) {
      if (!options?.silent) {
        showError(err instanceof Error ? err.message : 'Failed to load models')
      }
    } finally {
      if (provider === 'claude') setLoadingClaudeModels(false)
      else setLoadingOpenaiModels(false)
    }
  }

  const buildModelOptions = (models: ModelOption[], current: string): ModelOption[] => {
    if (current && !models.some((m) => m.id === current)) {
      return [{ id: current, label: `${current} (current)` }, ...models]
    }
    return models
  }

  const handleSave = async () => {
    try {
      setError('')

      if (user?.role === 'Admin') {
        const updates: {
          anthropic_api_key?: string
          anthropic_base_url?: string
          openai_api_key?: string
          openai_base_url?: string
          llm_provider?: 'claude' | 'codex'
          claude_model?: string | null
          openai_model?: string
          claude_code_max_output_tokens?: number | null
          github_max_archive_size_mb?: number
        } = {}

        updates.llm_provider = llmProvider

        if (anthropicApiKey && anthropicApiKey.trim().length > 0) {
          updates.anthropic_api_key = anthropicApiKey
        }
        if (anthropicBaseUrl && anthropicBaseUrl.trim().length > 0) {
          updates.anthropic_base_url = anthropicBaseUrl
        }
        if (openaiApiKey && openaiApiKey.trim().length > 0) {
          updates.openai_api_key = openaiApiKey
        }
        if (openaiBaseUrl && openaiBaseUrl.trim().length > 0) {
          updates.openai_base_url = openaiBaseUrl
        }
        updates.claude_model = claudeModel.trim() ? claudeModel.trim() : null
        if (openaiModel && openaiModel.trim().length > 0) {
          updates.openai_model = openaiModel.trim()
        }
        if (claudeCodeMaxOutputTokens !== undefined && claudeCodeMaxOutputTokens !== null) {
          updates.claude_code_max_output_tokens = claudeCodeMaxOutputTokens
        }
        if (typeof githubMaxArchiveSizeMb === 'number' && githubMaxArchiveSizeMb > 0) {
          updates.github_max_archive_size_mb = githubMaxArchiveSizeMb
        }

        if (updates.anthropic_api_key) {
          setValidating(true)
          try {
            const validationResult = await api.validateApiKey(
              updates.anthropic_api_key,
              updates.anthropic_base_url || anthropicBaseUrl,
              'claude',
            )
            if (validationResult.valid) {
              success(validationResult.message || 'Anthropic API key is valid and working correctly', 0)
            } else {
              showError(validationResult.error || 'Anthropic API key validation failed', 0)
            }
          } catch (validationErr) {
            const errorMsg = validationErr instanceof Error ? validationErr.message : 'Failed to validate API key'
            showError(`Anthropic API key validation error: ${errorMsg}`, 0)
          } finally {
            setValidating(false)
          }
        }

        if (updates.openai_api_key) {
          setValidating(true)
          try {
            const validationResult = await api.validateApiKey(
              updates.openai_api_key,
              updates.openai_base_url || openaiBaseUrl,
              'codex',
            )
            if (validationResult.valid) {
              success(validationResult.message || 'OpenAI API key is valid and working correctly', 0)
            } else {
              showError(validationResult.error || 'OpenAI API key validation failed', 0)
            }
          } catch (validationErr) {
            const errorMsg = validationErr instanceof Error ? validationErr.message : 'Failed to validate API key'
            showError(`OpenAI API key validation error: ${errorMsg}`, 0)
          } finally {
            setValidating(false)
          }
        }

        await api.updateSettings(updates)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        success('Configuration saved successfully')

        const response = await api.getSettings()
        const settings = response.settings
        setEncryptionKeyConfigured(!!settings.encryption_key_configured)
        setLlmProvider(settings.llm_provider === 'codex' ? 'codex' : 'claude')
        setAnthropicBaseUrl(settings.anthropic_base_url || 'https://api.anthropic.com')
        setOpenaiBaseUrl(settings.openai_base_url || 'https://api.openai.com/v1')
        setClaudeModel(settings.claude_model ?? '')
        setOpenaiModel(settings.openai_model || 'gpt-4.1')
        setClaudeCodeMaxOutputTokens(settings.claude_code_max_output_tokens ?? 32000)
        setGithubMaxArchiveSizeMb(settings.github_max_archive_size_mb ?? 50)
        setAnthropicApiKey('')
        setOpenaiApiKey('')

        void loadModels('claude', { silent: true })
        void loadModels('codex', { silent: true })
      } else {
        updateConfig({
          anthropic: { apiKey: anthropicApiKey, baseUrl: anthropicBaseUrl },
          timezone: timezone,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        success('Configuration saved successfully')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration'
      setError(message)
      showError(message)
    }
  }

  const handleRegenerateEncryptionKey = async () => {
    if (!window.confirm(
      'Regenerate the encryption key? The new key is shown to you ONCE for backup. ' +
      'Existing encrypted secrets are re-encrypted automatically.'
    )) {
      return
    }
    try {
      setRegenerating(true)
      setError('')
      setNewEncryptionKey(null)
      const response = await api.regenerateEncryptionKey()
      const newKey = response.encryption_key
      setNewEncryptionKey(newKey)
      setEncryptionKeyConfigured(true)
      setSaved(true)
      setTimeout(() => setSaved(false), 5000)
      setTimeout(() => setNewEncryptionKey(null), 30000)
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message)
      else setError('Failed to regenerate encryption key')
    } finally {
      setRegenerating(false)
    }
  }

  const handleSaveGithubToken = async () => {
    if (!githubTokenInput.trim()) {
      showError('Enter a GitHub PAT')
      return
    }
    setSavingGithubToken(true)
    try {
      const res = await api.setGitHubToken(githubTokenInput.trim(), githubTokenName.trim() || undefined)
      setGithubTokenStatus(res.token ?? null)
      setGithubTokenInput('')
      setGithubTokenName('')
      success(`GitHub PAT saved${res.githubLogin ? ` for ${res.githubLogin}` : ''}`)
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save GitHub PAT')
    } finally {
      setSavingGithubToken(false)
    }
  }

  const handleDeleteGithubToken = async () => {
    if (!window.confirm('Delete your stored GitHub PAT? You will need to re-enter it to access private repos.')) {
      return
    }
    try {
      await api.deleteGitHubToken()
      setGithubTokenStatus({ exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null })
      success('GitHub PAT deleted')
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete GitHub PAT')
    }
  }

  const handleTestGithubToken = async () => {
    if (!githubTokenInput.trim()) {
      showError('Enter a token to test')
      return
    }
    setTestingGithubToken(true)
    try {
      const res = await api.validateGitHubToken(githubTokenInput.trim())
      if (res.valid) {
        success(`Token is valid${res.login ? ` (login: ${res.login})` : ''}`)
      } else {
        showError(res.error || 'Token validation failed')
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to validate token')
    } finally {
      setTestingGithubToken(false)
    }
  }

  const handleReset = () => {
    const defaultTimezone = typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC'
    const defaultConfig = {
      anthropic: {
        apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '',
        baseUrl: process.env.NEXT_PUBLIC_ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      },
      timezone: process.env.NEXT_PUBLIC_TIMEZONE || defaultTimezone,
    }
    setAnthropicApiKey(defaultConfig.anthropic.apiKey)
    setAnthropicBaseUrl(defaultConfig.anthropic.baseUrl)
    setTimezone(defaultConfig.timezone)
    if (user?.role !== 'Admin') {
      updateConfig(defaultConfig)
      success('Settings reset to defaults')
    } else {
      success('Settings reset to defaults — click Save Configuration to apply')
    }
  }

  if (isAuthenticated && user?.role !== 'Admin') {
    return (
      <div className="container mx-auto max-w-4xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Access denied. Admin role required to view system settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              System settings (encryption status, API keys, GitHub PAT) are only accessible to administrators.
              Your personal display settings (timezone) can be configured below.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl p-8">
        <Card>
          <CardContent className="p-8">
            <p className="text-center text-muted-foreground">Loading settings...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Configure application settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          {saved && (
            <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
              Configuration saved successfully.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Encryption
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    {encryptionKeyConfigured ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                        data-testid="encryption-status-configured"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Encryption: configured
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                        Encryption: not configured
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateEncryptionKey}
                    disabled={regenerating || loading}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate Key'}
                  </Button>
                </div>
                {newEncryptionKey && (
                  <div className="p-3 text-sm bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="font-semibold text-yellow-800 mb-2">New encryption key (shown once):</p>
                    <code
                      data-testid="new-encryption-key-display"
                      className="block p-2 bg-white border border-yellow-300 rounded text-xs break-all font-mono"
                    >
                      {newEncryptionKey}
                    </code>
                    <p className="mt-2 text-yellow-700 text-xs">
                      Save this key in your secret manager. It will be hidden in 30 seconds.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  The encryption key is stored server-side and is never exposed via the API. Use Regenerate to rotate it; existing secrets are re-encrypted automatically.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Display Settings</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="timezone" className="text-sm font-medium">
                    Timezone
                  </label>
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {getCommonTimezones().map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LLM Provider</CardTitle>
          <CardDescription>
            Controls which model provider is used for threat modeling, chat, and context extraction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="llm-provider" className="text-sm font-medium">
              Active Provider
            </label>
            <select
              id="llm-provider"
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value as 'claude' | 'codex')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="claude">Anthropic Claude</option>
              <option value="codex">OpenAI (Codex)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Changes take effect after you click Save Configuration at the bottom of the page.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Anthropic API Configuration</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="anthropic-api-key" className="text-sm font-medium">
                  Anthropic API Key
                </label>
                <Input
                  id="anthropic-api-key"
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder="Enter your Anthropic API key (will be encrypted)"
                />
                <p className="text-xs text-muted-foreground">
                  Encrypted at rest. Leave empty to keep current value.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="anthropic-base-url" className="text-sm font-medium">
                  Anthropic Base URL
                </label>
                <Input
                  id="anthropic-base-url"
                  type="text"
                  value={anthropicBaseUrl}
                  onChange={(e) => setAnthropicBaseUrl(e.target.value)}
                  placeholder="https://api.anthropic.com"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="claude-model" className="text-sm font-medium">
                    Claude Model
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadModels('claude')}
                    disabled={loadingClaudeModels}
                  >
                    {loadingClaudeModels ? 'Loading...' : 'Refresh list'}
                  </Button>
                </div>
                <select
                  id="claude-model"
                  value={claudeModel}
                  onChange={(e) => setClaudeModel(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">opus (agent default)</option>
                  {buildModelOptions(claudeModels, claudeModel).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Loaded from your Anthropic account. Save an API key first, then Refresh. Leave as default for opus.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="claude-code-max-output-tokens" className="text-sm font-medium">
                  Claude Code Max Output Tokens
                </label>
                <Input
                  id="claude-code-max-output-tokens"
                  type="number"
                  min="1"
                  max="1000000"
                  value={claudeCodeMaxOutputTokens ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    setClaudeCodeMaxOutputTokens(value === '' ? null : parseInt(value, 10))
                  }}
                  placeholder="32000"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">OpenAI API Configuration</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="openai-api-key" className="text-sm font-medium">
                  OpenAI API Key
                </label>
                <Input
                  id="openai-api-key"
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="Enter your OpenAI API key (will be encrypted)"
                />
                <p className="text-xs text-muted-foreground">
                  Used when Active Provider is OpenAI (Codex). Leave empty to keep current value.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="openai-base-url" className="text-sm font-medium">
                  OpenAI Base URL
                </label>
                <Input
                  id="openai-base-url"
                  type="text"
                  value={openaiBaseUrl}
                  onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="openai-model" className="text-sm font-medium">
                    OpenAI Model
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadModels('codex')}
                    disabled={loadingOpenaiModels}
                  >
                    {loadingOpenaiModels ? 'Loading...' : 'Refresh list'}
                  </Button>
                </div>
                <select
                  id="openai-model"
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {buildModelOptions(openaiModels, openaiModel).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Loaded from your OpenAI account. Save an API key first, then Refresh. Required when using the OpenAI provider.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" /> GitHub
          </CardTitle>
          <CardDescription>
            Personal Access Token for importing private repositories. Encrypted at rest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {githubTokenStatus?.exists ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-emerald-50 p-3">
              <div className="text-sm">
                <p className="font-medium inline-flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  PAT configured{githubTokenStatus.name ? ` (${githubTokenStatus.name})` : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Saved {githubTokenStatus.createdAt}
                  {githubTokenStatus.lastUsedAt ? ` • Last used ${githubTokenStatus.lastUsedAt}` : ' • Never used'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDeleteGithubToken}>
                Remove
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No PAT configured — public repos only.</p>
          )}
          <div className="space-y-2">
            <label htmlFor="github-token-name" className="text-sm font-medium">Token name (optional)</label>
            <Input
              id="github-token-name"
              type="text"
              value={githubTokenName}
              onChange={(e) => setGithubTokenName(e.target.value)}
              placeholder="e.g. ai-threat-modeler scanner"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="github-token" className="text-sm font-medium">Personal Access Token</label>
            <Input
              id="github-token"
              type="password"
              value={githubTokenInput}
              onChange={(e) => setGithubTokenInput(e.target.value)}
              placeholder="ghp_..."
            />
            <p className="text-xs text-muted-foreground">
              Required scopes: <code>repo</code> (private) or <code>public_repo</code>.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveGithubToken} disabled={savingGithubToken}>
              {savingGithubToken ? 'Saving...' : 'Save PAT'}
            </Button>
            <Button variant="outline" onClick={handleTestGithubToken} disabled={testingGithubToken}>
              {testingGithubToken ? 'Testing...' : 'Test connection'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub Import Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label htmlFor="github-max-archive" className="text-sm font-medium">
              Max archive size (MB)
            </label>
            <Input
              id="github-max-archive"
              type="number"
              min="1"
              max="5000"
              value={githubMaxArchiveSizeMb}
              onChange={(e) => setGithubMaxArchiveSizeMb(parseInt(e.target.value || '0', 10) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Reject GitHub zipballs larger than this. Default 50 MB.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={validating}>
          {validating ? 'Validating API Key...' : 'Save Configuration'}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  )
}
