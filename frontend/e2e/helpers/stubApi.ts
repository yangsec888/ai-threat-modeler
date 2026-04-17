import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Page } from '@playwright/test'

function loadDfdReport(): unknown {
  const p = path.join(__dirname, '../fixtures/dfd-report.json')
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
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
