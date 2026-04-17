import { test, expect } from '@playwright/test'
import { stubThreatModelingApi } from './helpers/stubApi'

function appOrigin(): string {
  return (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3333').replace(/\/$/, '')
}

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test('DFD PDF export suggests DFD filename', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByTestId('dfd-canvas-root')).toBeVisible({ timeout: 60_000 })

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('dfd-export-pdf').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^DFD - .*\.pdf$/)
})

test('Copy Mermaid writes flowchart to clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: appOrigin() })
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByTestId('dfd-canvas-root')).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('dfd-copy-mermaid').click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('flowchart')
})

test('SVG and PNG export trigger downloads', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByTestId('dfd-canvas-root')).toBeVisible({ timeout: 60_000 })

  const svgDl = page.waitForEvent('download')
  await page.getByTestId('dfd-export-svg').click()
  const svg = await svgDl
  expect(svg.suggestedFilename()).toMatch(/\.svg$/i)

  const pngDl = page.waitForEvent('download')
  await page.getByTestId('dfd-export-png').click()
  const png = await pngDl
  expect(png.suggestedFilename()).toMatch(/\.png$/i)
})
