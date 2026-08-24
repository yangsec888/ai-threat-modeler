import { test, expect } from '@playwright/test'
import { openReportPage, stubThreatModelingApi } from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test.describe('Baseline comparison', () => {
  test('Compare tab runs a comparison against pasted baseline JSON and renders the summary', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    page.setDefaultTimeout(60_000)
    page.setDefaultNavigationTimeout(90_000)

    let compareBody: Record<string, unknown> | null = null
    await page.route('**/api/threat-modeling/jobs/*/compare', async (route) => {
      if (route.request().method() === 'POST') {
        compareBody = route.request().postDataJSON() as Record<string, unknown>
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            result: {
              matched: [
                {
                  generated: { id: 'T-001', title: 'SQL Injection' },
                  baseline: { id: 'B1', title: 'SQL Injection' },
                  tier: 'exact',
                  confidence: 1,
                },
              ],
              missed: [{ id: 'B2', title: 'SSRF' }],
              extra: [],
              recall: 0.5,
              precision: 0.5,
            },
          }),
        })
        return
      }
      await route.continue()
    })

    await openReportPage(page)
    await page.getByRole('tab', { name: /Compare to Baseline/i }).click()

    await page
      .getByTestId('baseline-json-input')
      .fill(
        '{"threats": [{"title": "SQL Injection", "stride_category": "Tampering"}]}',
      )
    await page.getByRole('button', { name: /Compare against baseline/i }).click()

    await expect(page.getByTestId('comparison-result')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('missed-list')).toContainText('SSRF')
    expect(compareBody).toBeTruthy()
    const baseline = compareBody?.['baseline'] as { threats?: unknown } | undefined
    expect(Array.isArray(baseline?.threats)).toBe(true)
  })
})
