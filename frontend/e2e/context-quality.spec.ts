import { test, expect } from '@playwright/test'
import { stubThreatModelingApi, stubStagingApi } from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await stubStagingApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test('thin context shows the GIGO quality warning before running', async ({ page }) => {
  // Generous timeouts so this spec is robust under full parallel-suite load
  // (the report/staging pages compile on first hit and can exceed the 30s default).
  test.setTimeout(120_000)
  page.setDefaultTimeout(60_000)
  page.setDefaultNavigationTimeout(90_000)

  await page.goto('/')
  await page.getByRole('tab', { name: /Upload directory/i }).click()

  const fileInput = page.locator('input[type="file"]')
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles({
      name: 'repo.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(
        'PK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00',
      ),
    })
  }

  const analyzeBtn = page.getByRole('button', { name: /Analyze repository/i })
  if (await analyzeBtn.isEnabled()) {
    await analyzeBtn.click()
    await expect(page.getByLabel('Project summary')).toBeVisible({ timeout: 15_000 })

    // Thin the context to trigger the quality warning: trivial placeholder and
    // clear the remaining fields.
    await page.getByLabel('Project summary').fill('x')
    await page.getByLabel('Security context').fill('')
    await page.getByLabel('Deployment context').fill('')
    await page.getByLabel('Developer / compliance guidance').fill('')
    await page.getByLabel('Suggested exclusions').fill('')

    await expect(page.getByTestId('context-quality-warning')).toBeVisible()
    await expect(page.getByTestId('context-quality-warning')).toContainText(/Context looks thin/i)
  }
})
