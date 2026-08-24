import { test, expect, type Page } from '@playwright/test'

/**
 * SEC: default-credential hardening — an account still using the built-in
 * default password must be locked behind a non-dismissible gate.
 */
async function stubDefaultUser(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 1,
          username: 'admin',
          email: 'admin@test.local',
          role: 'Admin',
          password_changed: false,
        },
      }),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-admin-token')
  })
})

test.describe('Default-password gate', () => {
  test('locks the app behind a non-dismissible gate for a default-credential user', async ({
    page,
  }) => {
    await stubDefaultUser(page)
    await page.goto('/')

    const gate = page.getByTestId('password-change-gate')
    await expect(gate).toBeVisible()
    await expect(
      page.getByText('Default Password Must Be Changed', { exact: false }),
    ).toBeVisible()

    // No way to close the dialog: no Cancel button, no close control.
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    // The app surface must not be reachable behind the gate (no sidebar aside).
    await expect(page.locator('aside')).toHaveCount(0)

    // Sign out escape hatch exists.
    await page.getByTestId('gate-logout').click()
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  })

  test('unlocks the app after the password is changed', async ({ page }) => {
    await stubDefaultUser(page)
    // After a successful change, the API returns password_changed: true.
    await page.route('**/api/auth/change-password', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Password changed successfully',
            user: {
              id: 1,
              username: 'admin',
              email: 'admin@test.local',
              role: 'Admin',
              password_changed: true,
            },
          }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await expect(page.getByTestId('password-change-gate')).toBeVisible()

    await page.getByLabel('Current Password', { exact: true }).fill('admin')
    await page.getByLabel('New Password', { exact: true }).fill('Strong3!Pass')
    await page.getByLabel('Confirm New Password', { exact: true }).fill('Strong3!Pass')
    await page.getByRole('button', { name: 'Change Password' }).click()

    // Gate clears and the app surface is reachable again.
    await expect(page.getByTestId('password-change-gate')).toHaveCount(0)
    await expect(page.locator('aside')).toBeVisible()
  })

  test('does not gate a user who has already changed their password', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 1,
            username: 'admin',
            email: 'admin@test.local',
            role: 'Admin',
            password_changed: true,
          },
        }),
      })
    })
    await page.goto('/')
    await expect(page.getByTestId('password-change-gate')).toHaveCount(0)
    await expect(page.locator('aside')).toBeVisible()
  })
})
