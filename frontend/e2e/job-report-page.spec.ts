import { test, expect } from '@playwright/test'
import {
  FIXTURE_JOB_ID,
  openReportPage,
  stubThreatModelingApi,
} from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test.describe('Report page /reports/[jobId]', () => {
  test('clicking Preview opens a new tab pointing to /reports/<jobId>', async ({ page }) => {
    await stubThreatModelingApi(page)
    await page.goto('/')

    const popupPromise = page.context().waitForEvent('page')
    await page.getByRole('button', { name: 'Preview' }).click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')

    await expect(popup).toHaveURL(new RegExp(`/reports/${FIXTURE_JOB_ID.replace(/-/g, '\\-')}$`))
    await expect(popup.getByTestId('dfd-canvas-root')).toBeVisible({ timeout: 60_000 })
    await popup.close()
  })

  test('direct navigation renders three tabs and DFD canvas', async ({ page }) => {
    await stubThreatModelingApi(page)
    await openReportPage(page)

    await expect(page.getByRole('tab', { name: /Data Flow Diagram/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Threat Model/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Risk Registry/i })).toBeVisible()
    await expect(page.getByTestId('report-page-title')).toContainText('Test App')
  })

  test('direct navigation while job is pending shows not ready empty state', async ({ page }) => {
    await stubThreatModelingApi(page, { jobStatus: 'pending' })
    await page.goto(`/reports/${FIXTURE_JOB_ID}`)

    await expect(page.getByText(/not ready yet/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('dfd-canvas-root')).toHaveCount(0)
  })

  test('direct navigation to missing job shows Job not found', async ({ page }) => {
    await stubThreatModelingApi(page, { jobNotFound: true })
    await page.goto(`/reports/${FIXTURE_JOB_ID}`)

    await expect(page.getByText('Job not found')).toBeVisible({ timeout: 15_000 })
  })

  test('document.title contains the project name', async ({ page }) => {
    await stubThreatModelingApi(page)
    await openReportPage(page)

    await expect(page).toHaveTitle(/Test App/)
  })

  test('Back control returns to dashboard when history includes home', async ({ page }) => {
    await stubThreatModelingApi(page)
    await page.goto('/')
    await page.goto(`/reports/${FIXTURE_JOB_ID}`)
    await expect(page.getByTestId('dfd-canvas-root')).toBeVisible({ timeout: 60_000 })

    await page.getByTestId('report-back-button').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Threat Modeling Jobs')).toBeVisible()
  })

  test('tab switching works inside the report', async ({ page }) => {
    await stubThreatModelingApi(page)
    await openReportPage(page)

    await page.getByRole('tab', { name: /Threat Model/i }).click()
    await expect(page.getByText('SQL Injection')).toBeVisible()

    await page.getByRole('tab', { name: /Risk Registry/i }).click()
    await expect(page.getByText('Data breach')).toBeVisible()

    await page.getByRole('tab', { name: /Data Flow Diagram/i }).click()
    await expect(page.getByTestId('dfd-canvas-root')).toBeVisible()
  })
})
