import { test, expect, type Page } from '@playwright/test'

/**
 * e2e coverage for the v2.0.1 Settings refactor:
 *  - LLM Provider card with model dropdowns populated from GET /api/settings/models
 *  - Save Configuration / Reset to Defaults toast confirmations
 *  - Selected model is persisted via PUT /api/settings
 */

const claudeModels = [
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' },
]
const openaiModels = [
  { id: 'gpt-4.1', label: 'gpt-4.1' },
  { id: 'o3', label: 'o3' },
]
const deepinfraModels = [
  { id: 'moonshotai/Kimi-K2.6', label: 'moonshotai/Kimi-K2.6', inputPricePerM: 0.75, outputPricePerM: 3.5, contextLength: 262144 },
  { id: 'moonshotai/Kimi-K3', label: 'moonshotai/Kimi-K3', inputPricePerM: 2.85, outputPricePerM: 14.25, contextLength: 1000000 },
]

async function stubSettingsPage(
  page: Page,
  opts: {
    openaiApiKey?: string | null
    deepinfraApiKey?: string | null
    llmProvider?: 'claude' | 'codex' | 'deepinfra'
  } = {},
): Promise<{ getLastPut: () => Record<string, unknown> | null }> {
  let lastPutBody: Record<string, unknown> | null = null

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 1, username: 'admin', email: 'admin@test.local', role: 'Admin', password_changed: true },
      }),
    })
  })

  await page.route('**/api/github/token', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null } }),
      })
      return
    }
    await route.continue()
  })

  const settings = {
    encryption_key_configured: true,
    anthropic_api_key: '***ENCRYPTED***',
    anthropic_base_url: 'https://api.anthropic.com',
    openai_api_key: opts.openaiApiKey ?? null,
    openai_base_url: 'https://api.openai.com/v1',
    deepinfra_api_key: opts.deepinfraApiKey ?? null,
    deepinfra_base_url: 'https://api.deepinfra.com/v1/openai',
    deepinfra_reasoning_effort: 'medium',
    llm_provider: opts.llmProvider ?? 'claude',
    claude_model: null as string | null,
    openai_model: 'gpt-4.1',
    deepinfra_model: 'moonshotai/Kimi-K2.6',
    claude_code_max_output_tokens: 32000,
    github_max_archive_size_mb: 50,
    threat_modeler_max_turns: 100,
    threat_adversary_enabled: true,
    updated_at: new Date().toISOString(),
  }

  await page.route('**/api/settings', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', settings }),
      })
      return
    }
    if (method === 'PUT') {
      lastPutBody = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          settings: { ...settings, claude_model: (lastPutBody.claude_model as string | null) ?? null },
        }),
      })
      return
    }
    await route.continue()
  })

  await page.route('**/api/settings/models**', async (route) => {
    const url = route.request().url()
    const provider = url.includes('provider=codex')
      ? 'codex'
      : url.includes('provider=deepinfra')
        ? 'deepinfra'
        : 'claude'
    const modelsByProvider = { claude: claudeModels, codex: openaiModels, deepinfra: deepinfraModels }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        provider,
        models: modelsByProvider[provider as 'claude' | 'codex' | 'deepinfra'],
      }),
    })
  })

  return { getLastPut: () => lastPutBody }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-admin-token')
  })
})

test.describe('Settings — LLM Provider model selection (v2.0.1)', () => {
  test('shows only the active provider settings and populates its model dropdown', async ({ page }) => {
    await stubSettingsPage(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    // Default provider is Claude: only Anthropic settings render.
    const claudeSelect = page.locator('#claude-model')
    await expect(claudeSelect).toContainText('Claude Opus 4')
    await expect(claudeSelect).toContainText('opus (agent default)')
    await expect(page.locator('#openai-model')).toHaveCount(0)

    // Switching to OpenAI hides Claude settings and reveals OpenAI settings.
    await page.locator('#llm-provider').selectOption('codex')
    const openaiSelect = page.locator('#openai-model')
    await expect(openaiSelect).toContainText('o3')
    await expect(page.locator('#claude-model')).toHaveCount(0)
  })

  test('saves the selected Claude model and shows a success toast', async ({ page }) => {
    const { getLastPut } = await stubSettingsPage(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    const claudeSelect = page.locator('#claude-model')
    await expect(claudeSelect).toContainText('Claude Opus 4')
    await claudeSelect.selectOption('claude-opus-4-20250514')

    await page.getByRole('button', { name: 'Save Configuration' }).click()

    // The toast text has no trailing period; the inline banner does. Match the toast.
    await expect(page.getByText('Configuration saved successfully', { exact: true })).toBeVisible()
    await expect.poll(() => getLastPut()?.claude_model).toBe('claude-opus-4-20250514')
  })

  test('Anthropic API Key shows its configured status and Test validates the saved key', async ({ page }) => {
    // Default stub: Claude is the active provider and its key is configured.
    await stubSettingsPage(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    await expect(page.getByTestId('anthropic-key-status-configured')).toBeVisible()
    await page.getByRole('button', { name: 'Test Anthropic API key' }).click()
    await expect(page.getByText(/Saved Anthropic API key is valid/i)).toBeVisible()
  })

  test('OpenAI API Key shows its configured status and Test validates the saved key', async ({ page }) => {
    await stubSettingsPage(page, { openaiApiKey: '***ENCRYPTED***', llmProvider: 'codex' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    await expect(page.getByTestId('openai-key-status-configured')).toBeVisible()
    await page.getByRole('button', { name: 'Test OpenAI API key' }).click()
    // Test with a blank field exercises the saved key via the models endpoint.
    await expect(page.getByText(/Saved OpenAI API key is valid/i)).toBeVisible()
  })

  test('OpenAI API Key shows a not-configured status when no key is saved', async ({ page }) => {
    await stubSettingsPage(page, { openaiApiKey: null, llmProvider: 'codex' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    await expect(page.getByTestId('openai-key-status-missing')).toBeVisible()
  })

  test('switching to DeepInfra reveals its section and populates the model dropdown', async ({ page }) => {
    await stubSettingsPage(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    await expect(page.locator('#claude-model')).toBeVisible()

    await page.locator('#llm-provider').selectOption('deepinfra')

    const deepinfraSelect = page.locator('#deepinfra-model')
    await expect(deepinfraSelect).toContainText('moonshotai/Kimi-K3')
    await expect(page.locator('#deepinfra-reasoning-effort')).toBeVisible()
    await expect(page.locator('#claude-model')).toHaveCount(0)
    await expect(page.locator('#openai-model')).toHaveCount(0)
  })

  test('DeepInfra API Key shows its configured status and Test validates the saved key', async ({ page }) => {
    await stubSettingsPage(page, { deepinfraApiKey: '***ENCRYPTED***', llmProvider: 'deepinfra' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    await expect(page.getByTestId('deepinfra-key-status-configured')).toBeVisible()
    await page.getByRole('button', { name: 'Test DeepInfra API key' }).click()
    await expect(page.getByText(/Saved DeepInfra API key is valid/i)).toBeVisible()
  })

  test('Reset to Defaults shows a confirmation toast', async ({ page }) => {
    await stubSettingsPage(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.locator('#claude-model')).toBeVisible()

    await page.getByRole('button', { name: 'Reset to Defaults' }).click()

    await expect(page.getByText(/Settings reset to defaults/i)).toBeVisible()
  })

  test('shows threat modeler max turns and adversary pass settings', async ({ page }) => {
    await stubSettingsPage(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    await expect(page.getByLabel(/Threat Modeler Max Turns/i)).toBeVisible()
    await expect(page.getByLabel(/Adversarial 2nd pass/i)).toBeChecked()
  })
})
