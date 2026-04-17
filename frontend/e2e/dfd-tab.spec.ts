import { test, expect, type Page } from '@playwright/test'
import { stubThreatModelingApi } from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

async function openCompletedDfd(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByTestId('dfd-canvas-root')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Layout…')).toBeHidden({ timeout: 60_000 })
}

test.describe('DFD tab', () => {
  test('renders canvas nodes and trust boundaries', async ({ page }) => {
    await openCompletedDfd(page)
    await expect(page.locator('[data-testid^="dfd-node-"]')).toHaveCount(6)
    await expect(page.locator('[data-testid^="dfd-boundary-"]')).toHaveCount(2)
  })

  test('node click shows context panel with threats', async ({ page }) => {
    await openCompletedDfd(page)
    await page.getByTestId('dfd-node-proc-1').click()
    await expect(page.getByText('Related threats')).toBeVisible()
    await expect(page.getByText(/T-001/)).toBeVisible()
  })

  test('selecting a flow row shows edge details in context panel', async ({ page }) => {
    await openCompletedDfd(page)
    await page.getByTestId('dfd-table-flow-f1').click()
    const ctx = page.getByTestId('dfd-context-panel')
    await expect(ctx.getByText('Data flow', { exact: true })).toBeVisible()
    await expect(ctx.getByText('HTTPS', { exact: true })).toBeVisible()
  })

  test('search dims non-matching nodes', async ({ page }) => {
    await openCompletedDfd(page)
    await page.getByTestId('dfd-search').fill('Docker')
    const dim = await page
      .getByTestId('dfd-node-ee-1')
      .evaluate((el) => parseFloat(getComputedStyle(el).opacity))
    const bright = await page
      .getByTestId('dfd-node-proc-3')
      .evaluate((el) => parseFloat(getComputedStyle(el).opacity))
    expect(dim).toBeLessThan(0.5)
    expect(bright).toBeGreaterThan(0.9)
  })

  test('layout LR then TB changes node transform', async ({ page }) => {
    await openCompletedDfd(page)
    const handle = page.getByTestId('dfd-node-proc-1')
    const readStyle = () =>
      handle.evaluate((el) => el.closest('.react-flow__node')?.getAttribute('style') ?? '')
    const before = await readStyle()
    await page.getByTestId('dfd-layout-tb').click()
    await expect(page.getByText('Layout…')).toBeHidden({ timeout: 60_000 })
    await expect.poll(readStyle).not.toBe(before)
  })

  test('hiding HIGH severity hides proc-1 from canvas', async ({ page }) => {
    await openCompletedDfd(page)
    await page.getByTestId('dfd-severity-HIGH').click()
    await expect(page.getByTestId('dfd-node-proc-1')).toBeHidden()
  })

  test('table row focuses node in viewport', async ({ page }) => {
    await openCompletedDfd(page)
    await page.getByTestId('dfd-table-node-ds-1').click()
    await expect(page.getByTestId('dfd-node-ds-1')).toBeVisible()
  })

  test('description collapse toggle is keyboard-operable', async ({ page }) => {
    await openCompletedDfd(page)
    const btn = page.getByTestId('dfd-desc-toggle')
    await expect(btn).toBeVisible()
    await btn.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Show less')).toBeVisible()
  })
})
