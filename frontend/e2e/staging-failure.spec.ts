import { test, expect } from '@playwright/test'
import { stubThreatModelingApi, stubStagingApi, stubGithubApis } from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await stubGithubApis(page)
  await stubStagingApi(page, { finalStatus: 'failed' })
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test('failed extraction shows manual fallback and allows run', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /Import from GitHub/i }).click()
  await page.getByPlaceholder('https://github.com/owner/repo').fill('https://github.com/octocat/Hello-World')
  await page.getByRole('button', { name: /Look up/i }).click()
  await expect(page.getByText('octocat/Hello-World')).toBeVisible()
  await page.getByRole('button', { name: /Analyze repository/i }).click()

  await expect(page.getByText(/Couldn't auto-generate context/i)).toBeVisible({ timeout: 15000 })
  await page.getByLabel('Additional notes').fill('Manual SOC2 scope only')
  await page.getByRole('button', { name: /Run threat model/i }).click()
  await expect(page.getByText(/pending|job-from-staging/i).first()).toBeVisible({ timeout: 10000 })
})
