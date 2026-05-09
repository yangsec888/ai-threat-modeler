import { test, expect, type Page } from '@playwright/test'
import { stubThreatModelingApi } from './helpers/stubApi'

async function stubGithubApis(page: Page): Promise<void> {
  await page.route('**/api/github/token', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          token: { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null },
        }),
      })
      return
    }
    await route.continue()
  })

  await page.route('**/api/github/check-repo', async (route) => {
    expect(route.request().method()).toBe('POST')
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        hasToken: false,
        repoInfo: {
          owner: 'octocat',
          repo: 'Hello-World',
          normalizedUrl: 'https://github.com/octocat/Hello-World',
          defaultBranch: 'main',
          isPrivate: false,
          description: 'My first repository on GitHub.',
          branches: ['main', 'dev'],
          tags: ['v1.0', 'v0.9'],
        },
      }),
    })
  })

  await page.route('**/api/github/import', async (route) => {
    expect(route.request().method()).toBe('POST')
    const body = route.request().postDataJSON() as Record<string, unknown>
    expect(body.repoUrl).toBe('https://github.com/octocat/Hello-World')
    expect(body.gitRefType).toBe('branch')
    expect(body.gitRef).toBe('main')
    await route.fulfill({
      status: 202, contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        message: 'GitHub import started',
        jobId: 'job-gh-1',
        job: {
          id: 'job-gh-1',
          status: 'pending',
          repoPath: '[GITHUB] octocat/Hello-World@main',
          repoName: 'Hello-World',
          sourceType: 'github',
          sourceUrl: 'https://github.com/octocat/Hello-World@main',
          gitRef: 'main',
          gitRefType: 'branch',
          createdAt: new Date().toISOString(),
        },
      }),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await stubThreatModelingApi(page)
  await stubGithubApis(page)
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'e2e-test-token')
  })
})

test.describe('GitHub Import', () => {
  test('looks up a repo, picks a branch, and starts an import', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: /Import from GitHub/i }).click()

    const urlInput = page.getByPlaceholder('https://github.com/owner/repo')
    await urlInput.fill('https://github.com/octocat/Hello-World')
    await page.getByRole('button', { name: /Look up/i }).click()

    await expect(page.getByText('octocat/Hello-World')).toBeVisible()
    await expect(page.getByLabel('Branch')).toHaveValue('main')

    await page.getByRole('button', { name: /Import & Create Job/i }).click()

    // Job appears in the list
    const githubLink = page.getByTestId('github-source-link')
    await expect(githubLink).toBeVisible()
    await expect(githubLink).toHaveAttribute('href', 'https://github.com/octocat/Hello-World')
    await expect(page.getByText('Branch: main').first()).toBeVisible()
  })

  test('private repo without PAT shows a hint to set one in Settings', async ({ page }) => {
    await page.unroute('**/api/github/check-repo')
    await page.route('**/api/github/check-repo', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
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
        }),
      })
    })
    await page.goto('/')
    await page.getByRole('tab', { name: /Import from GitHub/i }).click()
    await page.getByPlaceholder('https://github.com/owner/repo').fill('https://github.com/me/private-repo')
    await page.getByRole('button', { name: /Look up/i }).click()

    await expect(page.getByText('me/private-repo')).toBeVisible()
    await expect(page.getByText('Private', { exact: true })).toBeVisible()
  })
})
