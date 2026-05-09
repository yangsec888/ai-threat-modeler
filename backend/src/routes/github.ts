/**
 * GitHub Routes for AI Threat Modeler Dashboard
 *
 * - PAT CRUD (`/api/github/token`) and validation (`/token/validate`)
 * - Repo metadata lookup (`/api/github/check-repo`)
 * - GitHub-source threat-modeling import (`/api/github/import`)
 *
 * Reuses the existing upload pipeline (`processThreatModelingJob`) so a
 * GitHub-imported repo runs through the same agent invocation as a ZIP
 * upload, with the same cleanup semantics.
 *
 * Author: Sam Li
 */

import { Router, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireJobScheduling } from '../middleware/permissions';
import { GitHubTokenModel } from '../models/githubToken';
import { ThreatModelingJobModel } from '../models/threatModelingJob';
import { SettingsModel } from '../models/settings';
import { parseGitHubUrl } from '../utils/githubUrl';
import { extractZip, processThreatModelingJob } from './threatModeling';
import logger from '../utils/logger';

const router = Router();

const VALID_REF_TYPES = ['branch', 'tag', 'commit'] as const;
type RefType = typeof VALID_REF_TYPES[number];

const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_API_BASE = 'https://api.github.com';

interface GitHubError {
  status: number;
  message: string;
}

/**
 * Friendly error mapping for any outbound GitHub call. Returns `null` if the
 * response was successful, otherwise a {status, message} pair suitable for
 * sending to the client and persisting in `threat_modeling_jobs.error_message`.
 */
function mapGitHubError(response: Response | globalThis.Response, context: string = 'GitHub'): GitHubError | null {
  // The `Response` import shadow above is express.Response; we accept both.
  const r = response as unknown as globalThis.Response;
  if (r.ok) return null;
  const reset = r.headers.get('x-ratelimit-reset');
  const remaining = r.headers.get('x-ratelimit-remaining');
  if (r.status === 401) {
    return { status: 401, message: `${context}: PAT is invalid or expired; update it in Settings` };
  }
  if (r.status === 403 && remaining === '0') {
    let when = '';
    if (reset) {
      const epoch = parseInt(reset, 10);
      if (!Number.isNaN(epoch)) when = ` Try again after ${new Date(epoch * 1000).toISOString()}`;
    }
    return { status: 429, message: `${context}: rate limit reached.${when}` };
  }
  if (r.status === 403) {
    return { status: 403, message: `${context}: PAT does not have access to this repository` };
  }
  if (r.status === 404) {
    return { status: 404, message: `${context}: repository not found or is private (set a PAT in Settings to access private repos)` };
  }
  if (r.status >= 500) {
    return { status: 502, message: `${context}: GitHub is unavailable, try again later (upstream ${r.status})` };
  }
  return { status: r.status, message: `${context}: unexpected error from GitHub (${r.status})` };
}

function githubAuthHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'ai-threat-modeler',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// =====================================================================
// Token routes
// =====================================================================

// GET /api/github/token  - status (never returns the token itself)
router.get('/token', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const status = GitHubTokenModel.getStatus(req.userId!);
    res.json({ status: 'success', token: status });
  } catch (error: unknown) {
    logger.error('Get GitHub token status error', { error });
    res.status(500).json({ error: 'Failed to read GitHub token status' });
  }
});

// POST /api/github/token  - save or replace user's PAT
router.post('/token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { token, name } = req.body ?? {};
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'token is required' });
    }
    if (name !== undefined && typeof name !== 'string') {
      return res.status(400).json({ error: 'name must be a string' });
    }

    // Validate against GitHub before persisting.
    let ghResponse: globalThis.Response;
    try {
      ghResponse = await fetch(`${GITHUB_API_BASE}/user`, {
        method: 'GET',
        headers: githubAuthHeaders(token),
      });
    } catch (err) {
      logger.warn('github.token.set: validation network error', { error: err });
      return res.status(502).json({ error: 'Could not reach GitHub to validate token' });
    }
    const mapped = mapGitHubError(ghResponse, 'Token validation');
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.message });
    }
    const userInfo = await ghResponse.json().catch(() => ({})) as { login?: string };

    GitHubTokenModel.set(req.userId!, token, name?.trim() || null);
    logger.info('github.token.set', { userId: req.userId, tokenName: name ?? null, login: userInfo.login });
    const status = GitHubTokenModel.getStatus(req.userId!);
    res.json({ status: 'success', token: status, githubLogin: userInfo.login ?? null });
  } catch (error: unknown) {
    logger.error('Set GitHub token error', { error });
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to save GitHub token', message });
  }
});

// DELETE /api/github/token
router.delete('/token', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    GitHubTokenModel.delete(req.userId!);
    logger.info('github.token.delete', { userId: req.userId });
    res.json({ status: 'success' });
  } catch (error: unknown) {
    logger.error('Delete GitHub token error', { error });
    res.status(500).json({ error: 'Failed to delete GitHub token' });
  }
});

// POST /api/github/token/validate  - validate without persisting
router.post('/token/validate', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body ?? {};
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ valid: false, error: 'token is required' });
    }
    let ghResponse: globalThis.Response;
    try {
      ghResponse = await fetch(`${GITHUB_API_BASE}/user`, {
        method: 'GET',
        headers: githubAuthHeaders(token),
      });
    } catch (err) {
      logger.warn('github.token.validate: network error', { error: err });
      return res.json({ valid: false, error: 'Could not reach GitHub' });
    }
    const mapped = mapGitHubError(ghResponse, 'Token validation');
    if (mapped) {
      return res.json({ valid: false, error: mapped.message });
    }
    const userInfo = await ghResponse.json().catch(() => ({})) as { login?: string };
    const scopes = ghResponse.headers.get('x-oauth-scopes') ?? '';
    logger.info('github.token.validated', { userId: req.userId, login: userInfo.login });
    res.json({ valid: true, login: userInfo.login ?? null, scopes: scopes ? scopes.split(/,\s*/) : [] });
  } catch (error: unknown) {
    logger.error('Validate GitHub token error', { error });
    res.status(500).json({ valid: false, error: 'Failed to validate token' });
  }
});

// =====================================================================
// check-repo
// =====================================================================

interface RepoInfo {
  owner: string;
  repo: string;
  normalizedUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  description: string | null;
  branches: string[];
  tags: string[];
}

async function fetchRepoInfo(owner: string, repo: string, token: string | null): Promise<{ info?: RepoInfo; error?: GitHubError }> {
  const repoResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers: githubAuthHeaders(token) });
  const repoErr = mapGitHubError(repoResponse, 'Repository');
  if (repoErr) return { error: repoErr };
  const repoData = await repoResponse.json() as { default_branch: string; private: boolean; description: string | null };

  // GitHub returns up to 30 by default; per_page caps at 100. For v1 we cap at 100.
  const [branchesRes, tagsRes] = await Promise.all([
    fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches?per_page=100`, { headers: githubAuthHeaders(token) }),
    fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/tags?per_page=100`, { headers: githubAuthHeaders(token) }),
  ]);

  const branchesData = branchesRes.ok ? await branchesRes.json() as Array<{ name: string }> : [];
  const tagsData = tagsRes.ok ? await tagsRes.json() as Array<{ name: string }> : [];

  return {
    info: {
      owner,
      repo,
      normalizedUrl: `https://github.com/${owner}/${repo}`,
      defaultBranch: repoData.default_branch,
      isPrivate: repoData.private,
      description: repoData.description,
      branches: branchesData.map(b => b.name),
      tags: tagsData.map(t => t.name),
    },
  };
}

// POST /api/github/check-repo
router.post('/check-repo', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { repoUrl } = req.body ?? {};
    if (!repoUrl || typeof repoUrl !== 'string') {
      return res.status(400).json({ error: 'repoUrl is required' });
    }
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid GitHub URL' });
    }
    let token: string | null = null;
    try {
      token = GitHubTokenModel.getDecrypted(req.userId!);
    } catch (err) {
      logger.warn('check-repo: failed to load PAT, continuing unauthenticated', { error: err });
    }
    const { info, error } = await fetchRepoInfo(parsed.owner, parsed.repo, token);
    if (error) {
      return res.status(error.status).json({ error: error.message });
    }
    res.json({ status: 'success', repoInfo: info, hasToken: !!token });
  } catch (error: unknown) {
    logger.error('check-repo error', { error });
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to check repository', message });
  }
});

// =====================================================================
// import
// =====================================================================

function isValidGitRef(ref: string): boolean {
  // Forbid whitespace, control chars, and shell metacharacters. Defense in
  // depth even though we don't shell-out the ref.
  if (!ref || ref.length > 250) return false;
  if (/\s/.test(ref)) return false;
  // Forbid characters: ` $ ; & | < > " ' \ * ?
  if (/[`$;&|<>"'\\*?]/.test(ref)) return false;
  return true;
}

/**
 * Fetch a GitHub zipball with manual redirect handling so the PAT survives
 * the api.github.com → codeload.github.com hop.
 *
 * `fetch`'s default `redirect: 'follow'` strips the `Authorization` header on
 * cross-origin redirects (per the spec). For private repositories the
 * redirect target on `codeload.github.com` accepts the same Bearer token, so
 * we re-attach it explicitly when the redirect stays inside `*.github.com`.
 * For redirects out to signed `objects.githubusercontent.com` URLs we drop the
 * Authorization header (the signed URL carries its own short-lived token in
 * the query string and would either ignore our Bearer or reject it).
 */
async function fetchGitHubZipball(
  owner: string,
  repo: string,
  ref: string,
  token: string | null,
): Promise<globalThis.Response> {
  const initialUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/zipball/${encodeURIComponent(ref)}`;
  const initial = await fetch(initialUrl, {
    method: 'GET',
    headers: githubAuthHeaders(token),
    redirect: 'manual',
  });
  if (initial.status < 300 || initial.status >= 400) {
    return initial;
  }
  const location = initial.headers.get('location');
  if (!location) {
    return initial;
  }

  let preserveAuth = false;
  try {
    const targetHost = new URL(location).host;
    preserveAuth = targetHost === 'github.com' || targetHost.endsWith('.github.com');
  } catch {
    preserveAuth = false;
  }
  const redirectHeaders = preserveAuth
    ? githubAuthHeaders(token)
    : { 'User-Agent': 'ai-threat-modeler' };

  return fetch(location, {
    method: 'GET',
    headers: redirectHeaders,
    redirect: 'follow',
  });
}

/**
 * Streams a fetch body to disk while enforcing a hard byte ceiling. Returns
 * the number of bytes written on success. On size-cap or write error, the
 * partial file is unlinked and the function rejects.
 *
 * Implementation note: we wait for the writable stream's `'close'` event
 * rather than the `end(callback)` form because `end()` does NOT invoke its
 * callback on a destroyed stream — so any error path that called `destroy()`
 * before awaiting `end()` would hang the entire pipeline indefinitely (the
 * exact bug that left v1.6.0–v1.6.2 size-capped imports stuck in `pending`).
 * `'close'` fires for both `end()` and `destroy()` paths.
 */
async function streamBodyToDiskWithCap(
  body: ReadableStream<Uint8Array>,
  zipPath: string,
  maxBytes: number,
): Promise<number> {
  const reader = body.getReader();
  const writeStream = fs.createWriteStream(zipPath);
  const closed = new Promise<void>((resolve) => {
    writeStream.once('close', () => resolve());
  });

  let bytesWritten = 0;
  let pendingError: Error | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesWritten += value.byteLength;
      if (bytesWritten > maxBytes) {
        pendingError = new Error(
          `Repository archive exceeds the configured size cap (${maxBytes / (1024 * 1024)} MB). ` +
            `Raise the cap in Settings → GitHub → Max archive size (MB) and re-import.`,
        );
        break;
      }
      if (!writeStream.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => writeStream.once('drain', () => resolve()));
      }
    }
  } catch (err) {
    pendingError = err instanceof Error ? err : new Error('Zipball stream error');
  } finally {
    if (pendingError) {
      writeStream.destroy();
    } else {
      writeStream.end();
    }
    await closed;
    try { reader.cancel().catch(() => undefined); } catch { /* ignore */ }
  }

  if (pendingError) {
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
    throw pendingError;
  }
  return bytesWritten;
}

export async function downloadAndProcessGitHubRepo(
  jobId: string,
  owner: string,
  repo: string,
  ref: string,
  token: string | null,
  userId: number,
): Promise<void> {
  const uploadsDir = path.join(process.cwd(), 'uploads', 'threat-modeling');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const zipFileName = `github_${owner}_${repo}_${jobId}.zip`;
  const zipPath = path.join(uploadsDir, zipFileName);
  const extractedDir = path.join(uploadsDir, `extracted-${jobId}`);

  const maxBytes = SettingsModel.getGitHubMaxArchiveSizeMb() * 1024 * 1024;

  try {
    const ghResponse = await fetchGitHubZipball(owner, repo, ref, token);
    const mapped = mapGitHubError(ghResponse, 'Zipball download');
    if (mapped) {
      throw new Error(mapped.message);
    }

    const contentLength = ghResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new Error(
        `Repository archive (${Math.round(parseInt(contentLength, 10) / (1024 * 1024))} MB) ` +
          `exceeds the configured size cap (${maxBytes / (1024 * 1024)} MB). ` +
          `Raise the cap in Settings → GitHub → Max archive size (MB) and re-import.`,
      );
    }

    if (!ghResponse.body) {
      throw new Error('Zipball download returned no body');
    }

    await streamBodyToDiskWithCap(ghResponse.body, zipPath, maxBytes);

    GitHubTokenModel.markUsed(userId);

    await extractZip(zipPath, extractedDir);

    // Prefer a friendly repoName for the agent: just the repo, sanitized.
    const repoName = repo.replace(/[^a-zA-Z0-9._-]/g, '_') || 'repo';

    await processThreatModelingJob(
      jobId,
      '',
      '',
      zipPath,
      extractedDir,
      `${repoName}.zip`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn('github.import.failed', { jobId, userId, owner, repo, ref, reason: message });
    try {
      ThreatModelingJobModel.updateStatus(jobId, 'failed', null, message);
    } catch (statusErr) {
      logger.error('Failed to mark job as failed', { error: statusErr });
    }
    // Best-effort cleanup; processThreatModelingJob does its own cleanup on
    // success/failure but if we never got that far we need to clean up here.
    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch { /* ignore */ }
    try { if (fs.existsSync(extractedDir)) fs.rmSync(extractedDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// POST /api/github/import
router.post('/import', authenticateToken, requireJobScheduling, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body ?? {};
    const { repoUrl, gitRef, gitRefType, repoName } = body;
    if (!repoUrl || typeof repoUrl !== 'string') {
      return res.status(400).json({ error: 'repoUrl is required' });
    }
    if (!gitRef || typeof gitRef !== 'string') {
      return res.status(400).json({ error: 'gitRef is required' });
    }
    if (!isValidGitRef(gitRef)) {
      return res.status(400).json({ error: 'gitRef contains invalid characters' });
    }
    if (!VALID_REF_TYPES.includes(gitRefType as RefType)) {
      return res.status(400).json({ error: `gitRefType must be one of: ${VALID_REF_TYPES.join(', ')}` });
    }
    if (repoName !== undefined && typeof repoName !== 'string') {
      return res.status(400).json({ error: 'repoName must be a string' });
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid GitHub URL' });
    }

    const userId = req.userId!;
    let token: string | null = null;
    try {
      token = GitHubTokenModel.getDecrypted(userId);
    } catch (err) {
      logger.warn('import: failed to load PAT, continuing unauthenticated', { error: err });
    }

    const sourceUrl = `${parsed.normalizedUrl}@${gitRef}`;
    const jobRepoPath = `[GITHUB] ${parsed.owner}/${parsed.repo}@${gitRef}`;
    const job = ThreatModelingJobModel.create(
      userId,
      jobRepoPath,
      undefined,
      repoName?.trim() || parsed.repo,
      gitRefType === 'branch' ? gitRef : null,
      gitRefType === 'commit' ? gitRef : null,
      {
        sourceType: 'github',
        sourceUrl,
        gitRef,
        gitRefType: gitRefType as RefType,
      },
    );

    logger.info('github.import.start', {
      jobId: job.id,
      userId,
      owner: parsed.owner,
      repo: parsed.repo,
      ref: gitRef,
      refType: gitRefType,
      hasToken: !!token,
    });

    // Fire-and-forget; the polling UI surfaces success/failure via job status.
    void downloadAndProcessGitHubRepo(job.id, parsed.owner, parsed.repo, gitRef, token, userId);

    res.status(202).json({
      status: 'success',
      message: 'GitHub import started',
      jobId: job.id,
      job: {
        id: job.id,
        status: job.status,
        repoPath: job.repo_path,
        repoName: job.repo_name,
        sourceType: job.source_type ?? 'github',
        sourceUrl: job.source_url,
        gitRef: job.git_ref,
        gitRefType: job.git_ref_type,
        createdAt: job.created_at,
      },
    });
  } catch (error: unknown) {
    logger.error('GitHub import error', { error });
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to start GitHub import', message });
  }
});

export { router as githubRoutes };
