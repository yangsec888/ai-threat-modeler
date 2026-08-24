import { test, expect } from '@playwright/test'
import { openReportPage, stubThreatModelingApi } from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test.describe('Review status workflow', () => {
  test('setting a threat review status persists via PATCH and shows the badge', async ({ page }) => {
    test.setTimeout(120_000)
    page.setDefaultTimeout(60_000)
    page.setDefaultNavigationTimeout(90_000)

    let patchedBody: Record<string, unknown> | null = null
    await page.route('**/api/threat-modeling/jobs/*/review', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchedBody = route.request().postDataJSON()
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            review: { jobId: 'T-001', findingId: 'T-001', status: 'accepted', note: null },
          }),
        })
        return
      }
      await route.continue()
    })

    await openReportPage(page)
    await page.getByRole('tab', { name: /Threat Model/i }).click()

    const select = page.getByTestId('review-select-T-001')
    await expect(select).toBeVisible()
    await select.selectOption('accepted')

    await expect(page.getByText('Accepted').first()).toBeVisible({ timeout: 10_000 })
    expect(patchedBody).toEqual({ findingId: 'T-001', status: 'accepted' })
  })
})
