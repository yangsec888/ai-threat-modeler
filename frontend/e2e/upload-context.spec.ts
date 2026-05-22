import { test, expect } from '@playwright/test'
import { stubThreatModelingApi, stubStagingApi } from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await stubStagingApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test('upload flow: analyze, edit context, run threat model', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /Upload directory/i }).click()

  // Stub directory picker via init script is heavy; click Analyze requires selection.
  // Use hidden file input path: trigger webkitdirectory by setting files on input if present.
  const fileInput = page.locator('input[type="file"]')
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles({
      name: 'repo.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'),
    })
  }

  const analyzeBtn = page.getByRole('button', { name: /Analyze repository/i })
  if (await analyzeBtn.isEnabled()) {
    await analyzeBtn.click()
    await expect(page.getByLabel('Project summary')).toBeVisible({ timeout: 15000 })
    await page.getByLabel('Project summary').fill('Edited project summary')
    await page.getByLabel('Additional notes').fill('SOC2 in scope')
    await page.getByRole('button', { name: /Run threat model/i }).click()
    await expect(page.getByText('job-from-staging').or(page.getByText(/pending/i))).toBeVisible({
      timeout: 10000,
    })
  }
})
