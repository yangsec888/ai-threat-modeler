/**
 * Build ExtractionContext JSON for the context_extractor agent role.
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_DEPTH = 6;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_TREE_LINES = 400;

const MANIFEST_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'go.mod',
  'Cargo.toml',
  'Gemfile',
  'composer.json',
]);

const INTERESTING_BASENAMES = new Set([
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Jenkinsfile',
  'CLAUDE.md',
  'AGENTS.md',
  'SECURITY.md',
  'README.md',
  'readme.md',
]);

const EXTENSION_LANG: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.php': 'PHP',
  '.cs': 'C#',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
};

export interface ExtractionContextFile {
  path: string;
  content: string;
}

export interface ExtractionContext {
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  languages: Record<string, number>;
  tree_summary?: string;
  files: ExtractionContextFile[];
}

function isInterestingFile(relPath: string): boolean {
  const base = path.basename(relPath);
  if (MANIFEST_NAMES.has(base) || INTERESTING_BASENAMES.has(base)) {
    return true;
  }
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  if (norm.includes('.github/workflows/')) return true;
  if (norm.includes('.codefresh/')) return true;
  if (norm.startsWith('terraform/') || norm.includes('/terraform/')) return true;
  if (norm.startsWith('helm/') || norm.includes('/helm/')) return true;
  if (norm.startsWith('kustomize/') || norm.includes('/kustomize/')) return true;
  if (norm.includes('.cursor/rules/')) return true;
  return false;
}

function countLanguages(rootDir: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git' || name === 'vendor') continue;
      const full = path.join(dir, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
      } else if (st.isFile()) {
        const ext = path.extname(name).toLowerCase();
        const lang = EXTENSION_LANG[ext];
        if (lang) {
          counts[lang] = (counts[lang] || 0) + 1;
        }
      }
    }
  };
  walk(rootDir, 0);
  return counts;
}

function primaryLanguage(languages: Record<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [lang, count] of Object.entries(languages)) {
    if (count > bestCount) {
      bestCount = count;
      best = lang;
    }
  }
  return best;
}

function buildTreeSummary(rootDir: string): string {
  const lines: string[] = [];
  const walk = (dir: string, prefix: string, depth: number) => {
    if (depth > MAX_DEPTH || lines.length >= MAX_TREE_LINES) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (lines.length >= MAX_TREE_LINES) break;
      if (name === 'node_modules' || name === '.git') continue;
      const full = path.join(dir, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      const sizeHint = st.isFile() ? ` (${st.size}b)` : '/';
      lines.push(`${prefix}${name}${sizeHint}`);
      if (st.isDirectory()) {
        walk(full, prefix + '  ', depth + 1);
      }
    }
  };
  walk(rootDir, '', 0);
  return lines.join('\n');
}

function readDescriptionFromReadme(rootDir: string): string | null {
  for (const name of ['README.md', 'readme.md', 'Readme.md']) {
    const p = path.join(rootDir, name);
    if (!fs.existsSync(p)) continue;
    try {
      const text = fs.readFileSync(p, 'utf-8');
      const paragraphs = text.split(/\n\s*\n/);
      for (const para of paragraphs) {
        const line = para.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
        if (line.length > 20) {
          return line.length > 500 ? line.slice(0, 497) + '…' : line;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function collectInterestingFiles(
  rootDir: string,
  relPrefix: string,
  depth: number,
  files: ExtractionContextFile[],
  totalBytes: { value: number },
): void {
  if (depth > MAX_DEPTH || totalBytes.value >= MAX_TOTAL_BYTES) return;

  let entries: string[];
  try {
    entries = fs.readdirSync(rootDir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (totalBytes.value >= MAX_TOTAL_BYTES) return;
    if (name === 'node_modules' || name === '.git' || name === 'vendor') continue;

    const full = path.join(rootDir, name);
    const rel = relPrefix ? path.join(relPrefix, name).replace(/\\/g, '/') : name;

    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      collectInterestingFiles(full, rel, depth + 1, files, totalBytes);
    } else if (st.isFile() && isInterestingFile(rel)) {
      if (st.size > MAX_FILE_BYTES) continue;
      try {
        const content = fs.readFileSync(full, 'utf-8');
        const slice = content.length > MAX_FILE_BYTES ? content.slice(0, MAX_FILE_BYTES) : content;
        totalBytes.value += Buffer.byteLength(slice, 'utf-8');
        if (totalBytes.value <= MAX_TOTAL_BYTES) {
          files.push({ path: rel, content: slice });
        }
      } catch {
        /* skip binary/unreadable */
      }
    }
  }
}

function resolveSourceRoot(extractedDir: string): string {
  const resolved = path.resolve(extractedDir);
  if (!fs.existsSync(resolved)) {
    return resolved;
  }
  try {
    const contents = fs.readdirSync(resolved);
    if (contents.length === 1) {
      const single = path.join(resolved, contents[0]);
      if (fs.statSync(single).isDirectory()) {
        return single;
      }
    }
  } catch {
    /* use resolved */
  }
  return resolved;
}

export function buildExtractionContext(
  extractedDir: string,
  repoName: string,
  options: {
    owner?: string;
    gitBranch?: string | null;
    gitCommit?: string | null;
  } = {},
): ExtractionContext {
  const root = resolveSourceRoot(extractedDir);
  const languages = countLanguages(root);
  const files: ExtractionContextFile[] = [];
  const totalBytes = { value: 0 };
  collectInterestingFiles(root, '', 0, files, totalBytes);

  const tree = buildTreeSummary(root);

  return {
    owner: options.owner ?? 'unknown',
    repo: repoName,
    description: readDescriptionFromReadme(root),
    language: primaryLanguage(languages),
    languages,
    tree_summary: tree || undefined,
    files,
  };
}
