import { test, expect, type Page } from '@playwright/test'

async function stubAuthAndSettings(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 1, username: 'admin', email: 'admin@test.local', role: 'Admin', password_changed: true },
      }),
    })
  })
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          settings: {
            encryption_key_configured: true,
            anthropic_api_key: '***ENCRYPTED***',
            anthropic_base_url: 'https://api.anthropic.com',
            claude_code_max_output_tokens: 32000,
            github_max_archive_size_mb: 50,
            updated_at: new Date().toISOString(),
          },
        }),
      })
      return
    }
    await route.continue()
  })
}

test.beforeEach(async ({ page }) => {
  await stubAuthAndSettings(page)
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-admin-token')
  })
})

test.describe('GitHub PAT settings', () => {
  test('SEC-009: encryption key is never displayed in Settings', async ({ page }) => {
    await page.route('**/api/github/token', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ token: { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null } }),
        })
        return
      }
      await route.continue()
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByTestId('encryption-status-configured')).toBeVisible()
    // Encryption key input must not exist
    await expect(page.locator('input[id="encryption-key"]')).toHaveCount(0)
    // The configured key must not appear anywhere on the page
    const html = await page.content()
    expect(html).not.toMatch(/encryption_key"\s*:/i)
  })

  test('saves a PAT and shows it as configured', async ({ page }) => {
    let getCount = 0
    await page.route('**/api/github/token', async (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        getCount += 1
        if (getCount === 1) {
          await route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ token: { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null } }),
          })
        } else {
          await route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({
              token: {
                exists: true, name: 'my-pat',
                createdAt: '2026-05-09T12:00:00Z', updatedAt: '2026-05-09T12:00:00Z', lastUsedAt: null,
              },
            }),
          })
        }
        return
      }
      if (method === 'POST') {
        const body = route.request().postDataJSON() as { token: string; name?: string | null }
        expect(body.token.length).toBeGreaterThan(0)
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            githubLogin: 'octocat',
            token: {
              exists: true, name: body.name ?? null,
              createdAt: '2026-05-09T12:00:00Z', updatedAt: '2026-05-09T12:00:00Z', lastUsedAt: null,
            },
          }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.locator('#github-token-name').fill('my-pat')
    await page.locator('#github-token').fill('ghp_e2e_token')
    await page.getByRole('button', { name: /Save PAT/i }).click()
    await expect(page.getByText(/PAT configured \(my-pat\)/)).toBeVisible()
  })

  test('Test connection validates a PAT against the backend', async ({ page }) => {
    await page.route('**/api/github/token', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ token: { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null } }),
        })
        return
      }
      await route.continue()
    })
    await page.route('**/api/github/token/validate', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ valid: true, login: 'octocat', scopes: ['repo'] }),
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.locator('#github-token').fill('ghp_test_token')
    await page.getByRole('button', { name: /Test connection/i }).click()
    await expect(page.getByText(/Token is valid/)).toBeVisible()
  })
})
