/**
 * Parse and normalize GitHub repository URLs.
 *
 * Modeled after sast-ai-app/backend/src/utils/githubUrl.ts. Accepts:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - https://github.com/owner/repo/tree/<branch>/...
 *   - https://github.com/owner/repo/blob/<branch>/<file>
 *   - git@github.com:owner/repo.git
 *
 * Rejects non-github.com hosts, malformed paths, and owner/repo names that
 * fail GitHub's published character rules.
 *
 * Author: Sam Li
 */

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  normalizedUrl: string; // canonical https://github.com/<owner>/<repo>
}

const OWNER_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const REPO_REGEX = /^[a-zA-Z0-9._-]{1,100}$/;

const SUBPATH_PREFIXES = [
  'tree', 'blob', 'pull', 'pulls', 'issues', 'issue',
  'actions', 'commits', 'commit', 'releases', 'tags', 'compare',
  'wiki', 'pulse', 'graphs', 'projects', 'security', 'settings',
  'discussions', 'network'
];

function isValidOwner(owner: string): boolean {
  return OWNER_REGEX.test(owner);
}

function isValidRepo(repo: string): boolean {
  if (!REPO_REGEX.test(repo)) return false;
  if (repo === '.' || repo === '..') return false;
  return true;
}

export function parseGitHubUrl(input: string): ParsedGitHubUrl | null {
  if (!input || typeof input !== 'string') return null;

  let cleaned = input.trim();
  if (cleaned.length === 0) return null;

  // ssh:// and git@ -> https://
  if (cleaned.startsWith('git@github.com:')) {
    cleaned = 'https://github.com/' + cleaned.slice('git@github.com:'.length);
  } else if (cleaned.startsWith('ssh://git@github.com/')) {
    cleaned = 'https://github.com/' + cleaned.slice('ssh://git@github.com/'.length);
  } else if (cleaned.startsWith('github.com/')) {
    cleaned = 'https://' + cleaned;
  } else if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    return null;
  }

  // Strip .git suffix anywhere it appears at end of path
  cleaned = cleaned.replace(/\.git$/i, '');

  let urlObj: URL;
  try {
    urlObj = new URL(cleaned);
  } catch {
    return null;
  }

  if (urlObj.hostname !== 'github.com' && urlObj.hostname !== 'www.github.com') {
    return null;
  }

  const segments = urlObj.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const [owner, repoRaw, maybeSubpath] = segments;

  // Reject if first sub-path-after-repo is a known github route prefix not
  // allowed inside a clone: handled by simply ignoring everything after repo.
  // Subpath prefixes are accepted only as repo-internal navigation.
  if (maybeSubpath && !SUBPATH_PREFIXES.includes(maybeSubpath)) {
    // Don't reject; some valid links could in theory have unusual sub-paths.
    // We'll just discard the trailing segments below.
  }

  const repo = repoRaw.replace(/\.git$/i, '');

  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    return null;
  }

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
  };
}
