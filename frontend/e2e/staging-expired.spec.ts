import { test, expect } from '@playwright/test'
import { stubThreatModelingApi } from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  const stagingId = 'staging-expired-1'
  await page.route('**/api/github/stage', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ stagingId, status: 'pending' }),
    })
  })
  await page.route(`**/api/threat-modeling/stage/${stagingId}`, async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'expired' }) })
  })
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test('session expired shows reset banner', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /Import from GitHub/i }).click()
  await page.route('**/api/github/check-repo', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        hasToken: false,
        repoInfo: {
          owner: 'o',
          repo: 'r',
          normalizedUrl: 'https://github.com/o/r',
          defaultBranch: 'main',
          isPrivate: false,
          description: null,
          branches: ['main'],
          tags: [],
        },
      }),
    })
  })
  await page.getByPlaceholder('https://github.com/owner/repo').fill('https://github.com/o/r')
  await page.getByRole('button', { name: /Look up/i }).click()
  await page.getByRole('button', { name: /Analyze repository/i }).click()
  await expect(page.getByText(/Session expired/i)).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /Reset/i }).click()
  await expect(page.getByPlaceholder('https://github.com/owner/repo')).toBeVisible()
})
