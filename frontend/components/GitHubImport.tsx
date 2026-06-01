'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Github, Loader2, Search, GitBranch, Tag, GitCommit, Lock, Globe, KeyRound } from 'lucide-react'
import { api } from '@/lib/api'
import { sanitizeErrorMessage } from '@/lib/security'
import { ContextFieldsForm } from '@/components/ContextFieldsForm'
import { useThreatModelingStaging } from '@/hooks/useThreatModelingStaging'
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
  onTokenNeeded?: () => void
}

export function GitHubImport({ onImportStarted, onError, onInfo, onTokenNeeded }: GitHubImportProps) {
  const staging = useThreatModelingStaging()
  const [repoUrl, setRepoUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null)
  const [refType, setRefType] = useState<ThreatModelingJobGitRefType>('branch')
  const [branchName, setBranchName] = useState<string>('')
  const [selectedRef, setSelectedRef] = useState<string>('')
  const [commitSha, setCommitSha] = useState('')
  const [tokenStatus, setTokenStatus] = useState<GitHubTokenStatus | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
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
      setBranchName(info.defaultBranch)
      setSelectedRef(info.tags[0] ?? '')
      setCommitSha('')
      if (info.isPrivate && !res.hasToken) {
        onInfo?.('This is a private repository. Set a GitHub PAT in Settings before importing.')
      }
    } catch (err: unknown) {
      const message = sanitizeErrorMessage(err, 'Failed to look up repository')
      if (/private|404|not found|access/i.test(message) && onTokenNeeded) {
        onTokenNeeded()
      }
      onError(message)
    } finally {
      setChecking(false)
    }
  }

  const resolveGitRef = (): string | null => {
    if (!repoInfo) return null
    if (refType === 'branch') {
      const gitRef = branchName.trim()
      return gitRef || null
    }
    if (refType === 'tag') {
      const gitRef = selectedRef.trim()
      return gitRef || null
    }
    const gitRef = commitSha.trim()
    if (!/^[a-fA-F0-9]{7,40}$/.test(gitRef)) {
      onError('Commit SHA must be 7-40 hex characters')
      return null
    }
    return gitRef
  }

  const handleAnalyze = async () => {
    if (!repoInfo) {
      onError('Look up the repository first')
      return
    }
    const gitRef = resolveGitRef()
    if (!gitRef) {
      onError(
        refType === 'commit'
          ? 'Enter a commit SHA'
          : refType === 'branch'
            ? 'Enter a branch name'
            : `Select a ${refType}`,
      )
      return
    }
    try {
      await staging.startGitHub({
        repoUrl: repoInfo.normalizedUrl,
        gitRef,
        gitRefType: refType,
        repoName: repoInfo.repo,
      })
      onInfo?.('Repository staged. Review context fields, then run the threat model.')
    } catch (err: unknown) {
      onError(sanitizeErrorMessage(err, 'Failed to stage repository'))
    }
  }

  const handleRun = async () => {
    setRunning(true)
    try {
      const res = await staging.run()
      if (!res) return
      onImportStarted({
        id: res.jobId,
        repoPath: res.job.repoPath,
        query: res.job.query,
        status: res.job.status,
        errorMessage: null,
        repoName: res.job.repoName,
        gitBranch: res.job.gitBranch,
        gitCommit: res.job.gitCommit,
        context: res.job.context,
        contextFields: res.job.contextFields,
        sourceType: res.job.sourceType,
        sourceUrl: res.job.sourceUrl,
        gitRef: res.job.gitRef,
        gitRefType: res.job.gitRefType,
        createdAt: res.job.createdAt,
        updatedAt: res.job.createdAt,
        completedAt: null,
      })
      staging.reset()
      setRepoUrl('')
      setRepoInfo(null)
      setBranchName('')
      setSelectedRef('')
      setCommitSha('')
    } catch (err: unknown) {
      onError(sanitizeErrorMessage(err, 'Failed to start threat modeling'))
    } finally {
      setRunning(false)
    }
  }

  if (staging.status === 'expired') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {staging.error ?? 'Session expired — please re-import the repository.'}
        </div>
        <Button type="button" variant="outline" onClick={() => staging.reset()}>
          Reset
        </Button>
      </div>
    )
  }

  if (staging.status !== 'idle') {
    return (
      <div className="space-y-4">
        {staging.status === 'extracting' && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating context from repository…
          </p>
        )}
        <ContextFieldsForm
          fields={staging.fields}
          status={
            staging.status === 'extracting'
              ? 'extracting'
              : staging.status === 'failed'
                ? 'failed'
                : 'ready'
          }
          onChange={staging.setField}
          disabled={running}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => void handleRun()}
            disabled={running || staging.status === 'extracting'}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              'Run threat model'
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void staging.cancel()}>
            Cancel
          </Button>
        </div>
      </div>
    )
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
            disabled={checking}
          />
          <Button type="button" variant="outline" onClick={() => void handleCheckRepo()} disabled={checking}>
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Look up
              </>
            )}
          </Button>
        </div>
      </div>

      {repoInfo && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-start gap-2 text-sm">
            {repoInfo.isPrivate ? (
              <Lock className="h-4 w-4 text-amber-600 mt-0.5" />
            ) : (
              <Globe className="h-4 w-4 text-green-600 mt-0.5" />
            )}
            <div>
              <p className="font-medium">
                {repoInfo.owner}/{repoInfo.repo}
              </p>
              {repoInfo.description && (
                <p className="text-muted-foreground text-xs mt-0.5">{repoInfo.description}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {(['branch', 'tag', 'commit'] as const).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={refType === t ? 'default' : 'outline'}
                onClick={() => setRefType(t)}
              >
                {t === 'branch' && <GitBranch className="mr-1 h-3 w-3" />}
                {t === 'tag' && <Tag className="mr-1 h-3 w-3" />}
                {t === 'commit' && <GitCommit className="mr-1 h-3 w-3" />}
                {t}
              </Button>
            ))}
          </div>

          {refType === 'branch' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Default branch:</span>
                <span className="font-medium truncate">{repoInfo.defaultBranch}</span>
                {branchName !== repoInfo.defaultBranch && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 shrink-0"
                    onClick={() => setBranchName(repoInfo.defaultBranch)}
                  >
                    Use default
                  </Button>
                )}
              </div>

              <div>
                <label htmlFor="branch-input" className="text-sm font-medium mb-1 block">
                  Branch name
                </label>
                <Input
                  id="branch-input"
                  type="text"
                  placeholder="e.g. main"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Type any branch name. The list below shows up to 100 branches returned by GitHub.
                </p>
              </div>

              {repoInfo.branches.length > 0 && (
                <div>
                  <label htmlFor="branch-select" className="text-sm font-medium mb-1 block">
                    Listed branches
                  </label>
                  <select
                    id="branch-select"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={repoInfo.branches.includes(branchName) ? branchName : ''}
                    onChange={(e) => {
                      if (e.target.value) setBranchName(e.target.value)
                    }}
                  >
                    <option value="">Select from list…</option>
                    {repoInfo.branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                disabled={repoInfo.tags.length === 0}
              >
                {repoInfo.tags.length === 0 ? (
                  <option value="">No tags available</option>
                ) : (
                  repoInfo.tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
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
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={() => void handleAnalyze()}>
              <Search className="mr-2 h-4 w-4" />
              Analyze repository
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
