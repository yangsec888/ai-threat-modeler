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

export function Settings() {
  const { user, isAuthenticated } = useAuth()
  const { toasts, success, error: showError, removeToast } = useToast()
  const [encryptionKey, setEncryptionKey] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('')
  const [claudeCodeMaxOutputTokens, setClaudeCodeMaxOutputTokens] = useState<number | null>(32000)
  const [timezone, setTimezone] = useState('UTC')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [newEncryptionKey, setNewEncryptionKey] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  useEffect(() => {
    // Load settings from backend if user is Admin
    const loadSettings = async () => {
      if (!isAuthenticated || user?.role !== 'Admin') {
        // For non-admin users, load from localStorage (backward compatibility)
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
        
        setEncryptionKey(settings.encryption_key || '')
        setAnthropicBaseUrl(settings.anthropic_base_url || 'https://api.anthropic.com')
        setClaudeCodeMaxOutputTokens(settings.claude_code_max_output_tokens ?? 32000)
        // API key is encrypted, so we don't show it
        setAnthropicApiKey('')
        
        // Also load timezone from localStorage (client-side only)
        const currentConfig = getConfig()
        setTimezone(currentConfig.timezone || 'UTC')
      } catch (err: unknown) {
        console.error('Failed to load settings:', err)
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Failed to load settings')
        }
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [isAuthenticated, user])

  const handleSave = async () => {
    try {
      setError('')
      
      if (user?.role === 'Admin') {
        // Save to backend database
        const updates: {
          encryption_key?: string
          anthropic_api_key?: string
          anthropic_base_url?: string
          claude_code_max_output_tokens?: number | null
        } = {}
        
        if (encryptionKey && encryptionKey.trim().length > 0) {
          updates.encryption_key = encryptionKey
        }
        if (anthropicApiKey && anthropicApiKey.trim().length > 0) {
          updates.anthropic_api_key = anthropicApiKey
        }
        if (anthropicBaseUrl && anthropicBaseUrl.trim().length > 0) {
          updates.anthropic_base_url = anthropicBaseUrl
        }
        if (claudeCodeMaxOutputTokens !== undefined && claudeCodeMaxOutputTokens !== null) {
          updates.claude_code_max_output_tokens = claudeCodeMaxOutputTokens
        }
        
        console.log('💾 Frontend sending settings update:', {
          hasEncryptionKey: !!updates.encryption_key,
          hasApiKey: !!updates.anthropic_api_key,
          apiKeyLength: updates.anthropic_api_key?.length || 0,
          hasBaseUrl: !!updates.anthropic_base_url,
        })
        
        // Validate API key if it's being updated
        if (updates.anthropic_api_key) {
          setValidating(true)
          try {
            const validationResult = await api.validateApiKey(
              updates.anthropic_api_key,
              updates.anthropic_base_url || anthropicBaseUrl
            )
            
            if (validationResult.valid) {
              // Show success toast that doesn't auto-close (duration: 0)
              success(validationResult.message || '✅ API key is valid and working correctly', 0)
            } else {
              // Show error toast that doesn't auto-close (duration: 0)
              showError(validationResult.error || '❌ API key validation failed', 0)
            }
          } catch (validationErr) {
            // Show error toast that doesn't auto-close
            const errorMsg = validationErr instanceof Error ? validationErr.message : 'Failed to validate API key'
            showError(`❌ API key validation error: ${errorMsg}`, 0)
          } finally {
            setValidating(false)
          }
        }
        
        await api.updateSettings(updates)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        
        // Reload settings to get updated values
        const response = await api.getSettings()
        const settings = response.settings
        setEncryptionKey(settings.encryption_key || '')
        setAnthropicBaseUrl(settings.anthropic_base_url || 'https://api.anthropic.com')
        setClaudeCodeMaxOutputTokens(settings.claude_code_max_output_tokens ?? 32000)
        setAnthropicApiKey('') // Clear the input since it's encrypted
      } else {
        // For non-admin users, save to localStorage (backward compatibility)
        updateConfig({
          anthropic: {
            apiKey: anthropicApiKey,
            baseUrl: anthropicBaseUrl,
          },
          timezone: timezone,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to save configuration')
      }
    }
  }

  const handleRegenerateEncryptionKey = async () => {
    if (!window.confirm(
      'Are you sure you want to regenerate the encryption key?\n\n' +
      'This will:\n' +
      '• Generate a new random encryption key\n' +
      '• Re-encrypt the API key with the new key (if configured)\n' +
      '• Display the new key for you to save\n\n' +
      '⚠️ WARNING: If you lose the new encryption key, you will not be able to decrypt the API key!\n\n' +
      'Do you want to continue?'
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
      setEncryptionKey(newKey)
      setSaved(true)
      setTimeout(() => setSaved(false), 5000)
      
      // Clear the new key display after 30 seconds for security
      setTimeout(() => {
        setNewEncryptionKey(null)
      }, 30000)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to regenerate encryption key')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleReset = () => {
    // Reset to default values from environment
    const defaultTimezone = typeof Intl !== 'undefined' && Intl.DateTimeFormat 
      ? Intl.DateTimeFormat().resolvedOptions().timeZone 
      : 'UTC';
    
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
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Show access denied for non-admin users
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
              System settings (encryption key, API keys) are only accessible to administrators.
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
    <div className="container mx-auto max-w-4xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Configure application settings. Changes are saved to your browser's local storage.
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
              ✅ Configuration saved successfully!
            </div>
          )}

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-4">Encryption Configuration</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="encryption-key" className="text-sm font-medium">
                      Encryption Key
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerateEncryptionKey}
                      disabled={regenerating || loading}
                    >
                      {regenerating ? 'Regenerating...' : '🔄 Regenerate Key'}
                    </Button>
                  </div>
                  <Input
                    id="encryption-key"
                    type="password"
                    value={encryptionKey}
                    onChange={(e) => setEncryptionKey(e.target.value)}
                    placeholder="Enter encryption key (minimum 32 characters)"
                  />
                  {newEncryptionKey && (
                    <div className="p-3 text-sm bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="font-semibold text-yellow-800 mb-2">⚠️ New Encryption Key Generated:</p>
                      <code className="block p-2 bg-white border border-yellow-300 rounded text-xs break-all font-mono">
                        {newEncryptionKey}
                      </code>
                      <p className="mt-2 text-yellow-700 text-xs">
                        <strong>Important:</strong> Save this key securely! It will be hidden in 30 seconds. 
                        If you lose it, you cannot decrypt the API key.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Encryption key used to encrypt/decrypt sensitive data. Must be at least 32 characters.
                    <strong className="text-destructive"> Warning:</strong> Changing this will re-encrypt the API key.
                    Click "Regenerate Key" to automatically generate a new secure key.
                  </p>
                </div>
              </div>
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
                    Your API key is encrypted and stored in the database. Leave empty to keep current value.
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
                  <p className="text-xs text-muted-foreground">
                    The base URL for the Anthropic API. Default: https://api.anthropic.com
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
                  <p className="text-xs text-muted-foreground">
                    Maximum number of output tokens for Claude Code responses. Default: 32000. 
                    Set to null or leave empty to use default. Range: 1-1000000.
                    This prevents "response exceeded the 32000 output token maximum" errors.
                  </p>
                </div>
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
                  <p className="text-xs text-muted-foreground">
                    Timezone used for displaying dates and times throughout the application.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={validating}>
              {validating ? 'Validating API Key...' : 'Save Configuration'}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Reset to Defaults
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> System settings (encryption key, API keys) are stored in the database and encrypted.
              Display settings (timezone) are stored in your browser's local storage.
            </p>
          </div>
        </CardContent>
      </Card>
      
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  )
}

