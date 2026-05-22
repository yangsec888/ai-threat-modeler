import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Page } from '@playwright/test'

function loadDfdReport(): unknown {
  const p = path.join(__dirname, '../fixtures/dfd-report.json')
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function loadStagingDraft(): Record<string, string | null> {
  const p = path.join(__dirname, '../fixtures/staging-draft.json')
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, string | null>
}

const defaultOctocatRepo = {
  owner: 'octocat',
  repo: 'Hello-World',
  normalizedUrl: 'https://github.com/octocat/Hello-World',
  defaultBranch: 'main',
  isPrivate: false,
  description: 'My first repository on GitHub.',
  branches: ['main', 'dev'],
  tags: ['v1.0', 'v0.9'],
} as const

/** Stub GitHub token + check-repo for Import from GitHub e2e flows. */
export async function stubGithubApis(
  page: Page,
  checkRepoBody?: { hasToken?: boolean; repoInfo?: typeof defaultOctocatRepo & { isPrivate?: boolean } },
): Promise<void> {
  await page.route('**/api/github/token', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          token: { exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null },
        }),
      })
      return
    }
    await route.continue()
  })

  const repoInfo = checkRepoBody?.repoInfo ?? defaultOctocatRepo
  const hasToken = checkRepoBody?.hasToken ?? false

  await page.route('**/api/github/check-repo', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', hasToken, repoInfo }),
    })
  })
}

/** Stub staging endpoints for upload or GitHub two-step flows. */
export async function stubStagingApi(
  page: Page,
  options: {
    stagingId?: string
    finalStatus?: 'ready' | 'failed'
    githubJob?: {
      sourceUrl: string
      gitBranch: string
      repoName: string
    }
  } = {},
): Promise<string> {
  const stagingId = options.stagingId ?? 'staging-e2e-1'
  const draft = loadStagingDraft()
  let pollCount = 0

  await page.route('**/api/threat-modeling/stage', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ stagingId, status: 'pending' }),
      })
      return
    }
    await route.continue()
  })

  await page.route('**/api/github/stage', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ stagingId, status: 'pending' }),
      })
      return
    }
    await route.continue()
  })

  await page.route(`**/api/threat-modeling/stage/${stagingId}`, async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      pollCount += 1
      const status =
        options.finalStatus === 'failed'
          ? 'failed'
          : pollCount < 2
            ? 'extracting'
            : 'ready'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stagingId,
          status,
          draftContextFields: status === 'ready' ? draft : null,
          extractionError: status === 'failed' ? 'Extractor failed' : null,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
      })
      return
    }
    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.continue()
  })

  await page.route(`**/api/threat-modeling/stage/${stagingId}/run`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { contextFields?: Record<string, string | null> }
      const gh = options.githubJob
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'job-from-staging',
          job: {
            id: 'job-from-staging',
            status: 'pending',
            repoPath: '[STAGED] e2e-repo',
            query: 'Perform threat modeling analysis',
            contextFields: body.contextFields ?? draft,
            context: 'Project: E2E sample',
            createdAt: new Date().toISOString(),
            ...(gh
              ? {
                  sourceType: 'github',
                  sourceUrl: gh.sourceUrl,
                  gitBranch: gh.gitBranch,
                  repoName: gh.repoName,
                }
              : {}),
          },
        }),
      })
      return
    }
    await route.continue()
  })

  return stagingId
}

/** Stub auth + threat-modeling APIs so the dashboard runs without the backend. */
export async function stubThreatModelingApi(page: Page): Promise<void> {
  const dfdReport = loadDfdReport() as {
    job: {
      id: string
      repoPath: string
      query: string | null
      status: string
      errorMessage: string | null
      repoName?: string | null
      gitBranch?: string | null
      gitCommit?: string | null
      executionDuration?: number | null
      apiCost?: string | null
      createdAt: string
      updatedAt: string
      completedAt: string | null
    }
  }
  const job = dfdReport.job

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 1,
          username: 'e2e-admin',
          email: 'e2e@test.local',
          role: 'Admin',
          password_changed: true,
        },
      }),
    })
  })

  await page.route(
    (url) => {
      const pth = url.pathname.replace(/\/$/, '')
      return pth === '/api/threat-modeling/jobs'
    },
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          jobs: [
            {
              id: job.id,
              repoPath: job.repoPath,
              query: job.query,
              status: job.status,
              errorMessage: job.errorMessage,
              repoName: job.repoName,
              gitBranch: job.gitBranch,
              gitCommit: job.gitCommit,
              executionDuration: job.executionDuration,
              apiCost: job.apiCost,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              completedAt: job.completedAt,
            },
          ],
        }),
      })
    }
  )

  await page.route(
    (url) => /^\/api\/threat-modeling\/jobs\/[^/]+$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dfdReport),
      })
    }
  )
}
