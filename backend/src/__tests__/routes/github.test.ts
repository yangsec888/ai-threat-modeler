/**
 * Tests for GitHub routes: token CRUD/validate, check-repo, import.
 *
 * These tests stub the outbound GitHub fetch and the heavy
 * download-and-process pipeline so we can assert routing, validation, and
 * audit-log behavior without doing real network IO.
 *
 * Author: Sam Li
 */

jest.mock('better-sqlite3', () => {
  const mockDb = {
    prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) })),
    exec: jest.fn(),
    pragma: jest.fn(),
  };
  return jest.fn(() => mockDb);
});

// Mock the heavy pipeline imports so the github route loads without pulling
// in extractZip / processThreatModelingJob real implementations.
jest.mock('../../routes/threatModeling', () => ({
  extractZip: jest.fn(async () => undefined),
  processThreatModelingJob: jest.fn(async () => undefined),
}));

jest.mock('../../models/threatModelingJob', () => ({
  ThreatModelingJobModel: {
    create: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

jest.mock('../../models/githubToken', () => ({
  GitHubTokenModel: {
    set: jest.fn(),
    delete: jest.fn(),
    getStatus: jest.fn(),
    getDecrypted: jest.fn(),
    markUsed: jest.fn(),
  },
}));

jest.mock('../../models/settings', () => ({
  SettingsModel: {
    getGitHubMaxArchiveSizeMb: jest.fn(() => 50),
  },
}));

jest.mock('../../middleware/auth', () => ({
  authenticateToken: jest.fn((req: any, _res: any, next: any) => {
    req.userId = 42;
    req.username = 'tester';
    req.userRole = 'Admin';
    next();
  }),
  AuthRequest: {},
}));

jest.mock('../../middleware/permissions', () => ({
  requireJobScheduling: jest.fn((_req: any, _res: any, next: any) => next()),
  requireAdmin: jest.fn((_req: any, _res: any, next: any) => next()),
}));

import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { githubRoutes, downloadAndProcessGitHubRepo } from '../../routes/github';
import { GitHubTokenModel } from '../../models/githubToken';
import { ThreatModelingJobModel } from '../../models/threatModelingJob';
import { processThreatModelingJob } from '../../routes/threatModeling';

const app = express();
app.use(express.json());
app.use('/api/github', githubRoutes);

const realFetch = global.fetch;

describe('GitHub Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubTokenModel.getStatus as jest.Mock).mockReturnValue({
      exists: false, name: null, createdAt: null, updatedAt: null, lastUsedAt: null,
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  // -----------------------------
  // /token
  // -----------------------------
  describe('GET /api/github/token', () => {
    it('returns status without exposing the token', async () => {
      (GitHubTokenModel.getStatus as jest.Mock).mockReturnValue({
        exists: true, name: 'pat', createdAt: 't', updatedAt: 't', lastUsedAt: null,
      });
      const r = await request(app).get('/api/github/token');
      expect(r.status).toBe(200);
      expect(r.body.token.exists).toBe(true);
      expect(r.body.token).not.toHaveProperty('token');
      expect(r.body.token).not.toHaveProperty('token_encrypted');
    });
  });

  describe('POST /api/github/token', () => {
    it('rejects missing token', async () => {
      const r = await request(app).post('/api/github/token').send({});
      expect(r.status).toBe(400);
    });

    it('validates against GitHub before persisting', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ login: 'octocat' }),
      } as any);
      (GitHubTokenModel.getStatus as jest.Mock).mockReturnValue({
        exists: true, name: 'pat', createdAt: 't', updatedAt: 't', lastUsedAt: null,
      });

      const r = await request(app).post('/api/github/token').send({ token: 'ghp_abc', name: 'pat' });
      expect(r.status).toBe(200);
      expect(GitHubTokenModel.set).toHaveBeenCalledWith(42, 'ghp_abc', 'pat');
      expect(r.body.githubLogin).toBe('octocat');
    });

    it('returns 401 when GitHub rejects the token', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Map(),
        json: async () => ({ message: 'Bad credentials' }),
      } as any);
      const r = await request(app).post('/api/github/token').send({ token: 'ghp_bad' });
      expect(r.status).toBe(401);
      expect(GitHubTokenModel.set).not.toHaveBeenCalled();
    });

    it('returns 502 when GitHub is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));
      const r = await request(app).post('/api/github/token').send({ token: 'ghp_x' });
      expect(r.status).toBe(502);
      expect(GitHubTokenModel.set).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/github/token', () => {
    it('deletes the token', async () => {
      const r = await request(app).delete('/api/github/token');
      expect(r.status).toBe(200);
      expect(GitHubTokenModel.delete).toHaveBeenCalledWith(42);
    });
  });

  describe('POST /api/github/token/validate', () => {
    it('returns valid=true for a working PAT', async () => {
      const headers = new Map<string, string>([['x-oauth-scopes', 'repo, read:user']]);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200, headers,
        json: async () => ({ login: 'me' }),
      } as any);
      const r = await request(app).post('/api/github/token/validate').send({ token: 'ghp_ok' });
      expect(r.status).toBe(200);
      expect(r.body.valid).toBe(true);
      expect(r.body.login).toBe('me');
      expect(r.body.scopes).toEqual(expect.arrayContaining(['repo', 'read:user']));
    });

    it('returns valid=false for a bad PAT', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 401, headers: new Map(),
        json: async () => ({}),
      } as any);
      const r = await request(app).post('/api/github/token/validate').send({ token: 'ghp_bad' });
      expect(r.status).toBe(200);
      expect(r.body.valid).toBe(false);
    });

    it('rejects empty token', async () => {
      const r = await request(app).post('/api/github/token/validate').send({});
      expect(r.status).toBe(400);
      expect(r.body.valid).toBe(false);
    });
  });

  // -----------------------------
  // /check-repo
  // -----------------------------
  describe('POST /api/github/check-repo', () => {
    it('rejects invalid github URL', async () => {
      const r = await request(app).post('/api/github/check-repo').send({ repoUrl: 'not-a-url' });
      expect(r.status).toBe(400);
    });

    it('returns repo metadata and hasToken=false when no PAT', async () => {
      (GitHubTokenModel.getDecrypted as jest.Mock).mockReturnValue(null);
      const fetchMock = jest.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200, headers: new Map(),
          json: async () => ({ default_branch: 'main', private: false, description: 'desc' }),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200, headers: new Map(),
          json: async () => [{ name: 'main' }, { name: 'dev' }],
        })
        .mockResolvedValueOnce({
          ok: true, status: 200, headers: new Map(),
          json: async () => [{ name: 'v1.0' }],
        });
      global.fetch = fetchMock as any;

      const r = await request(app)
        .post('/api/github/check-repo')
        .send({ repoUrl: 'https://github.com/octocat/Hello-World' });
      expect(r.status).toBe(200);
      expect(r.body.repoInfo.owner).toBe('octocat');
      expect(r.body.repoInfo.repo).toBe('Hello-World');
      expect(r.body.repoInfo.defaultBranch).toBe('main');
      expect(r.body.repoInfo.branches).toEqual(['main', 'dev']);
      expect(r.body.repoInfo.tags).toEqual(['v1.0']);
      expect(r.body.hasToken).toBe(false);
    });

    it('maps 404 to a friendly error', async () => {
      (GitHubTokenModel.getDecrypted as jest.Mock).mockReturnValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 404, headers: new Map(),
        json: async () => ({}),
      } as any);
      const r = await request(app)
        .post('/api/github/check-repo')
        .send({ repoUrl: 'https://github.com/octocat/missing' });
      expect(r.status).toBe(404);
      expect(r.body.error).toMatch(/not found|private/i);
    });

    it('maps rate limit to 429', async () => {
      (GitHubTokenModel.getDecrypted as jest.Mock).mockReturnValue(null);
      const headers = new Map<string, string>([
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-reset', '1700000000'],
      ]);
      global.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 403, headers, json: async () => ({}),
      } as any);
      const r = await request(app)
        .post('/api/github/check-repo')
        .send({ repoUrl: 'https://github.com/octocat/Hello-World' });
      expect(r.status).toBe(429);
      expect(r.body.error).toMatch(/rate limit/i);
    });
  });

  // -----------------------------
  // /import (validation only — pipeline mocked)
  // -----------------------------
  describe('POST /api/github/import', () => {
    beforeEach(() => {
      (ThreatModelingJobModel.create as jest.Mock).mockReturnValue({
        id: 'job-1',
        status: 'pending',
        repo_path: '[GITHUB] o/r@main',
        repo_name: 'r',
        source_type: 'github',
        source_url: 'https://github.com/o/r@main',
        git_ref: 'main',
        git_ref_type: 'branch',
        created_at: 't',
      });
    });

    it('rejects missing repoUrl', async () => {
      const r = await request(app).post('/api/github/import').send({ gitRef: 'main', gitRefType: 'branch' });
      expect(r.status).toBe(400);
    });

    it('rejects invalid gitRefType', async () => {
      const r = await request(app).post('/api/github/import').send({
        repoUrl: 'https://github.com/o/r',
        gitRef: 'main',
        gitRefType: 'tagz',
      });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/gitRefType/);
    });

    it('rejects gitRef with shell metacharacters', async () => {
      const r = await request(app).post('/api/github/import').send({
        repoUrl: 'https://github.com/o/r',
        gitRef: 'main; rm -rf /',
        gitRefType: 'branch',
      });
      expect(r.status).toBe(400);
    });

    it('creates a github-source job and returns 202', async () => {
      const r = await request(app).post('/api/github/import').send({
        repoUrl: 'https://github.com/o/r',
        gitRef: 'main',
        gitRefType: 'branch',
        repoName: 'r',
      });
      expect(r.status).toBe(202);
      expect(r.body.jobId).toBe('job-1');
      expect(r.body.job.sourceType).toBe('github');
      expect(r.body.job.sourceUrl).toContain('https://github.com/o/r');
      expect(ThreatModelingJobModel.create).toHaveBeenCalledWith(
        42,
        '[GITHUB] o/r@main',
        undefined,
        'r',
        'main',
        null,
        expect.objectContaining({ sourceType: 'github', gitRef: 'main', gitRefType: 'branch' }),
      );
    });
  });

  // -----------------------------
  // /import — pipeline: size-cap regression
  //
  // Pre-v1.6.3, when the streaming download tripped the size cap, we called
  // `writeStream.destroy()` and then awaited `writeStream.end(callback)` in a
  // `finally`. Node does NOT invoke that callback on a destroyed stream, so
  // the function hung forever, the outer catch never ran, and the job sat in
  // `pending` indefinitely with no `error_message`. This regression test pins
  // the "doesn't hang, marks job failed" behavior to the size-cap path.
  // -----------------------------
  describe('downloadAndProcessGitHubRepo size-cap path', () => {
    let originalCwd: string;
    let tmpDir: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-import-test-'));
      process.chdir(tmpDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('marks the job failed (does not hang) when the zipball exceeds the size cap', async () => {
      const overCapBytes = (50 + 1) * 1024 * 1024; // 51 MB > 50 MB cap
      const oneChunk = new Uint8Array(overCapBytes);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(oneChunk);
          controller.close();
        },
      });
      // Manual-redirect path: first hop is a 200 directly (no redirect),
      // so the function streams the body straight away.
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        body,
      } as any);

      const jobId = 'job-size-cap';

      // Hard guard: if the bug regresses, this never resolves. Race against a
      // generous timeout so the suite fails loudly instead of timing out at
      // the Jest level.
      await Promise.race([
        downloadAndProcessGitHubRepo(jobId, 'o', 'r', 'main', null, 42),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('downloadAndProcessGitHubRepo hung past 5s — size-cap finally regression')), 5000),
        ),
      ]);

      expect(ThreatModelingJobModel.updateStatus).toHaveBeenCalledTimes(1);
      const call = (ThreatModelingJobModel.updateStatus as jest.Mock).mock.calls[0];
      expect(call[0]).toBe(jobId);
      expect(call[1]).toBe('failed');
      expect(call[3]).toMatch(/size cap/i);
      expect(call[3]).toMatch(/Settings/);

      // The pipeline must NOT have moved on to extract / agent run.
      expect(processThreatModelingJob).not.toHaveBeenCalled();
      expect(GitHubTokenModel.markUsed).not.toHaveBeenCalled();

      // The partial zip should have been cleaned up by streamBodyToDiskWithCap.
      const zipPath = path.join(tmpDir, 'uploads', 'threat-modeling', `github_o_r_${jobId}.zip`);
      expect(fs.existsSync(zipPath)).toBe(false);
    }, 10000);
  });
});
