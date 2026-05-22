import { test, expect } from '@playwright/test'
import { stubThreatModelingApi, stubStagingApi, stubGithubApis } from './helpers/stubApi'

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await stubGithubApis(page)
  await stubStagingApi(page, {
    stagingId: 'staging-gh-1',
    githubJob: {
      sourceUrl: 'https://github.com/octocat/Hello-World@main',
      gitBranch: 'main',
      repoName: 'Hello-World',
    },
  })
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test.describe('GitHub Import', () => {
  test('looks up a repo, analyzes context, and runs threat model', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: /Import from GitHub/i }).click()

    const urlInput = page.getByPlaceholder('https://github.com/owner/repo')
    await urlInput.fill('https://github.com/octocat/Hello-World')
    await page.getByRole('button', { name: /Look up/i }).click()

    await expect(page.getByText('octocat/Hello-World')).toBeVisible()
    await expect(page.getByLabel('Branch')).toHaveValue('main')

    await page.getByRole('button', { name: /Analyze repository/i }).click()
    await expect(page.getByLabel('Project summary')).toHaveValue('E2E sample web API', { timeout: 15000 })
    await page.getByLabel('Additional notes').fill('Compliance: SOC2')
    await page.getByRole('button', { name: /Run threat model/i }).click()

    const githubLink = page.getByTestId('github-source-link')
    await expect(githubLink).toBeVisible({ timeout: 10000 })
    await expect(githubLink).toHaveAttribute('href', 'https://github.com/octocat/Hello-World')
    await expect(page.getByText('Branch: main').first()).toBeVisible()
  })

  test('private repo without PAT shows a hint to set one in Settings', async ({ page }) => {
    await page.unroute('**/api/github/check-repo')
    await stubGithubApis(page, {
      hasToken: false,
      repoInfo: {
        owner: 'me',
        repo: 'private-repo',
        normalizedUrl: 'https://github.com/me/private-repo',
        defaultBranch: 'main',
        isPrivate: true,
        description: null,
        branches: ['main'],
        tags: [],
      },
    })
    await page.goto('/')
    await page.getByRole('tab', { name: /Import from GitHub/i }).click()
    await page.getByPlaceholder('https://github.com/owner/repo').fill('https://github.com/me/private-repo')
    await page.getByRole('button', { name: /Look up/i }).click()

    await expect(page.getByText('me/private-repo')).toBeVisible()
    await expect(
      page.getByText(/Set a GitHub PAT in Settings before importing/i),
    ).toBeVisible()
  })
})
