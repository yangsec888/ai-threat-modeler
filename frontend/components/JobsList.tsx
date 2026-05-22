'use client'

import { Button } from '@/components/ui/button'
import {
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Trash2,
  Github,
  ExternalLink,
} from 'lucide-react'
import { formatDateWithTimezone } from '@/utils/date'
import type { ThreatModelingJob } from '@/types/threatModelingJob'

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0) parts.push(`${secs}s`)
  return parts.join(' ')
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-600" />
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-600" />
    default:
      return null
  }
}

function getStatusBadge(status: string) {
  const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium'
  switch (status) {
    case 'completed':
      return `${baseClasses} bg-green-100 text-green-800`
    case 'failed':
      return `${baseClasses} bg-red-100 text-red-800`
    case 'processing':
      return `${baseClasses} bg-blue-100 text-blue-800`
    case 'pending':
      return `${baseClasses} bg-yellow-100 text-yellow-800`
    default:
      return `${baseClasses} bg-gray-100 text-gray-800`
  }
}

export interface JobsListProps {
  jobs: ThreatModelingJob[]
  isAuditor: boolean
  onPreview: (jobId: string) => void
  onDownloadJson: (jobId: string) => void
  onDeleteJob: (jobId: string) => void
}

export const JobsList = ({
  jobs,
  isAuditor,
  onPreview,
  onDownloadJson,
  onDeleteJob,
}: JobsListProps) => {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No threat modeling jobs yet.</p>
        <p className="text-sm mt-2">Create a job above to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(job.status)}
                <span className={getStatusBadge(job.status)}>
                  {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatDateWithTimezone(job.createdAt)}
                </span>
              </div>
              <div className="space-y-1">
                {job.sourceType === 'github' && job.sourceUrl ? (
                  <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    <Github className="h-4 w-4 text-muted-foreground" />
                    <span>Repository:</span>
                    <a
                      href={job.sourceUrl.split('@')[0] || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:underline inline-flex items-center gap-1"
                      data-testid="github-source-link"
                    >
                      {job.sourceUrl.split('@')[0].replace('https://github.com/', '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                ) : (
                  <p className="text-sm font-medium">Repository: {job.repoPath}</p>
                )}
                {job.owner && (
                  <p className="text-sm text-muted-foreground">Owner: {job.owner}</p>
                )}
                {(job.repoName || job.gitBranch || job.gitCommit || job.gitRef) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {job.sourceType === 'github' && (
                      <span className="px-2 py-1 bg-slate-100 text-slate-800 rounded text-xs font-medium inline-flex items-center gap-1">
                        <Github className="h-3 w-3" />
                        GitHub
                      </span>
                    )}
                    {job.repoName && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        Repo: {job.repoName}
                      </span>
                    )}
                    {job.gitRef && job.gitRefType && (
                      <span className="px-2 py-1 bg-amber-100 text-amber-900 rounded text-xs font-medium">
                        {job.gitRefType.charAt(0).toUpperCase() + job.gitRefType.slice(1)}:{' '}
                        {job.gitRef}
                      </span>
                    )}
                    {!job.gitRef && job.gitBranch && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                        Branch: {job.gitBranch}
                      </span>
                    )}
                    {!job.gitRef && job.gitCommit && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                        Commit: {job.gitCommit}
                      </span>
                    )}
                  </div>
                )}
                {job.executionDuration !== null && job.executionDuration !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    Duration: {formatDuration(job.executionDuration)}
                    {job.apiCost && ` • Cost: ${job.apiCost}`}
                  </p>
                )}
                {job.errorMessage && (
                  <p className="text-sm text-red-600">Error: {job.errorMessage}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              {job.status === 'completed' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPreview(job.id)}
                    className="flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownloadJson(job.id)}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download JSON
                  </Button>
                </>
              )}
              {!isAuditor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeleteJob(job.id)}
                  className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
