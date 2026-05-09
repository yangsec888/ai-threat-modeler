'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Github, Loader2, Search, GitBranch, Tag, GitCommit, Lock, Globe, KeyRound, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import { sanitizeErrorMessage } from '@/lib/security'
import type { ThreatModelingJob, ThreatModelingJobGitRefType } from '@/types/threatModelingJob'

interface RepoInfo {
  owner: string
  repo: string
  normalizedUrl: string
  defaultBranch: string
  isPrivate: boolean
  description: string | null
  branches: string[]
  tags: string[]
}

interface GitHubTokenStatus {
  exists: boolean
  name: string | null
  createdAt: string | null
  updatedAt: string | null
  lastUsedAt: string | null
}

interface GitHubImportProps {
  onImportStarted: (job: ThreatModelingJob) => void
  onError: (message: string) => void
  onInfo?: (message: string) => void
  /** Optional: prompt the user to set a PAT (called when import returns 404/private). */
  onTokenNeeded?: () => void
}

export function GitHubImport({ onImportStarted, onError, onInfo, onTokenNeeded }: GitHubImportProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null)
  const [refType, setRefType] = useState<ThreatModelingJobGitRefType>('branch')
  const [selectedRef, setSelectedRef] = useState<string>('')
  const [commitSha, setCommitSha] = useState('')
  const [tokenStatus, setTokenStatus] = useState<GitHubTokenStatus | null>(null)

  useEffect(() => {
    // Best-effort: not all users have permissions to view token; ignore errors.
    api.getGitHubTokenStatus()
      .then((res) => setTokenStatus(res.token ?? null))
      .catch(() => setTokenStatus(null))
  }, [])

  const handleCheckRepo = async () => {
    if (!repoUrl.trim()) {
      onError('Enter a GitHub repository URL')
      return
    }
    setChecking(true)
    setRepoInfo(null)
    try {
      const res = await api.checkGitHubRepo(repoUrl.trim())
      const info: RepoInfo = res.repoInfo
      setRepoInfo(info)
      setRefType('branch')
      setSelectedRef(info.defaultBranch)
      setCommitSha('')
      if (info.isPrivate && !res.hasToken) {
        onInfo?.('This is a private repository. Set a GitHub PAT in Settings before importing.')
      }
    } catch (err: unknown) {
      const message = sanitizeErrorMessage(err, 'Failed to look up repository')
      // Surface a hint when the failure is most likely PAT-related.
      if (/private|404|not found|access/i.test(message) && onTokenNeeded) {
        onTokenNeeded()
      }
      onError(message)
    } finally {
      setChecking(false)
    }
  }

  const handleImport = async () => {
    if (!repoInfo) {
      onError('Look up the repository first')
      return
    }
    let gitRef = ''
    if (refType === 'branch' || refType === 'tag') {
      gitRef = selectedRef.trim()
    } else {
      gitRef = commitSha.trim()
    }
    if (!gitRef) {
      onError(refType === 'commit' ? 'Enter a commit SHA' : `Select a ${refType}`)
      return
    }
    if (refType === 'commit' && !/^[a-fA-F0-9]{7,40}$/.test(gitRef)) {
      onError('Commit SHA must be 7-40 hex characters')
      return
    }

    setImporting(true)
    try {
      const res = await api.importFromGitHub({
        repoUrl: repoInfo.normalizedUrl,
        gitRef,
        gitRefType: refType,
        repoName: repoInfo.repo,
      })
      onImportStarted(res.job as ThreatModelingJob)
      // Reset for the next import
      setRepoUrl('')
      setRepoInfo(null)
      setSelectedRef('')
      setCommitSha('')
    } catch (err: unknown) {
      onError(sanitizeErrorMessage(err, 'Failed to start GitHub import'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Github className="h-4 w-4" />
        <span className="font-medium">Import from GitHub</span>
        {tokenStatus?.exists ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
            <KeyRound className="h-3 w-3" />
            PAT configured{tokenStatus.name ? `: ${tokenStatus.name}` : ''}
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
            <KeyRound className="h-3 w-3" />
            No PAT — public repos only
          </span>
        )}
      </div>

      <div>
        <label htmlFor="github-url" className="text-sm font-medium mb-2 block">
          GitHub Repository URL
        </label>
        <div className="flex gap-2">
          <Input
            id="github-url"
            type="text"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={checking || importing}
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={handleCheckRepo} disabled={checking || importing}>
            {checking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Looking up...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Look up
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Public repos work without a token; private repos require a PAT (see Settings).
        </p>
      </div>

      {repoInfo && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <a
              href={repoInfo.normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline inline-flex items-center gap-1"
            >
              {repoInfo.owner}/{repoInfo.repo}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                repoInfo.isPrivate ? 'bg-yellow-100 text-yellow-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {repoInfo.isPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
              {repoInfo.isPrivate ? 'Private' : 'Public'}
            </span>
            <span className="text-xs text-muted-foreground">default: {repoInfo.defaultBranch}</span>
          </div>
          {repoInfo.description && (
            <p className="text-xs text-muted-foreground">{repoInfo.description}</p>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Reference type</label>
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant={refType === 'branch' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setRefType('branch')
                  setSelectedRef(repoInfo.defaultBranch)
                }}
              >
                <GitBranch className="mr-1 h-4 w-4" /> Branch
              </Button>
              <Button
                type="button"
                variant={refType === 'tag' ? 'default' : 'outline'}
                size="sm"
                disabled={repoInfo.tags.length === 0}
                onClick={() => {
                  setRefType('tag')
                  setSelectedRef(repoInfo.tags[0] ?? '')
                }}
              >
                <Tag className="mr-1 h-4 w-4" /> Tag
              </Button>
              <Button
                type="button"
                variant={refType === 'commit' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRefType('commit')}
              >
                <GitCommit className="mr-1 h-4 w-4" /> Commit
              </Button>
            </div>
          </div>

          {refType === 'branch' && (
            <div>
              <label htmlFor="branch-select" className="text-sm font-medium mb-1 block">
                Branch
              </label>
              <select
                id="branch-select"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedRef}
                onChange={(e) => setSelectedRef(e.target.value)}
                disabled={importing}
              >
                {repoInfo.branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {refType === 'tag' && (
            <div>
              <label htmlFor="tag-select" className="text-sm font-medium mb-1 block">
                Tag
              </label>
              <select
                id="tag-select"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedRef}
                onChange={(e) => setSelectedRef(e.target.value)}
                disabled={importing || repoInfo.tags.length === 0}
              >
                {repoInfo.tags.length === 0 ? (
                  <option value="">No tags available</option>
                ) : (
                  repoInfo.tags.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))
                )}
              </select>
            </div>
          )}

          {refType === 'commit' && (
            <div>
              <label htmlFor="commit-input" className="text-sm font-medium mb-1 block">
                Commit SHA
              </label>
              <Input
                id="commit-input"
                type="text"
                placeholder="e.g. 8f3a1b2c"
                value={commitSha}
                onChange={(e) => setCommitSha(e.target.value)}
                disabled={importing}
              />
              <p className="text-xs text-muted-foreground mt-1">
                7-40 hex characters
              </p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting import...
                </>
              ) : (
                <>
                  <Github className="mr-2 h-4 w-4" />
                  Import & Create Job
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
