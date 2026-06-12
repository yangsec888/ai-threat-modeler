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

async function stubSettingsPage(page: Page): Promise<{ getLastPut: () => Record<string, unknown> | null }> {
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
    openai_api_key: null,
    openai_base_url: 'https://api.openai.com/v1',
    llm_provider: 'claude',
    claude_model: null as string | null,
    openai_model: 'gpt-4.1',
    claude_code_max_output_tokens: 32000,
    github_max_archive_size_mb: 50,
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
    const provider = url.includes('provider=codex') ? 'codex' : 'claude'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        provider,
        models: provider === 'codex' ? openaiModels : claudeModels,
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
  test('populates Claude and OpenAI model dropdowns from /api/settings/models', async ({ page }) => {
    await stubSettingsPage(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()

    const claudeSelect = page.locator('#claude-model')
    await expect(claudeSelect).toContainText('Claude Opus 4')
    await expect(claudeSelect).toContainText('opus (agent default)')

    const openaiSelect = page.locator('#openai-model')
    await expect(openaiSelect).toContainText('o3')
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

  test('Reset to Defaults shows a confirmation toast', async ({ page }) => {
    await stubSettingsPage(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.locator('#claude-model')).toBeVisible()

    await page.getByRole('button', { name: 'Reset to Defaults' }).click()

    await expect(page.getByText(/Settings reset to defaults/i)).toBeVisible()
  })
})
