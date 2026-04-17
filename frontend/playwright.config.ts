import { defineConfig, devices } from '@playwright/test'

/**
 * Point at an already-running Next dev server, e.g.:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test
 * When unset, Playwright starts `npm run dev:e2e` on port 3333.
 */
const baseURL = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3333').replace(/\/$/, '')
const useExternalDevServer = Boolean(process.env.PLAYWRIGHT_BASE_URL)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(useExternalDevServer
    ? {}
    : {
        webServer: {
          command: 'npm run dev:e2e',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
