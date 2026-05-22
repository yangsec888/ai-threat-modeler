/**
 * Dedicated threat modeling report page (opens in new tab from Jobs → Preview).
 */

'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import logo from '@/app/logo.png'
import { AuthGuard } from '@/components/AuthGuard'
import { JobReport } from '@/components/JobReport'
import { JobContextCard } from '@/components/JobContextCard'
import { Button } from '@/components/ui/button'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { formatDateWithTimezone } from '@/utils/date'
import type { ThreatModelingJob } from '@/types/threatModelingJob'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'

type LoadState = 'loading' | 'ready' | 'notfound' | 'forbidden' | 'error'

const ReportPageContent = () => {
  const params = useParams<{ jobId: string }>()
  const router = useRouter()
  const jobId = typeof params?.jobId === 'string' ? params.jobId : ''
  const { toasts, success, error: showError, removeToast } = useToast()
  const [job, setJob] = useState<ThreatModelingJob | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')

  useEffect(() => {
    if (!jobId) {
      setLoadState('notfound')
      return
    }

    let cancelled = false

    const load = async () => {
      setLoadState('loading')
      const result = await api.getThreatModelingJob(jobId)
      if (cancelled) return

      if (result.notFound) {
        setJob(null)
        setLoadState('notfound')
        return
      }
      if (result.forbidden) {
        setJob(null)
        setLoadState('forbidden')
        return
      }
      if (result.error || !result.job) {
        setJob(null)
        setLoadState('error')
        if (result.error) showError(result.error)
        return
      }
      setJob(result.job)
      setLoadState('ready')
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [jobId, showError])

  useEffect(() => {
    if (job?.status === 'completed') {
      const title = job.metadata?.project_name || job.repoPath || 'Threat model'
      document.title = `${title} — Threat Model Report`
    } else if (job) {
      document.title = 'Threat Model Report — AI Threat Modeler'
    }
  }, [job])

  const handleDownloadJson = useCallback(async () => {
    if (!jobId) return
    try {
      await api.downloadThreatModelingReport(jobId, 'json')
      success('JSON report downloaded successfully!')
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to download report')
    }
  }, [jobId, success, showError])

  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    setCanGoBack(window.history.length > 1)
  }, [])

  const handleBack = () => {
    router.back()
  }

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2
          className="h-10 w-10 animate-spin text-muted-foreground"
          aria-label="Loading report"
        />
      </div>
    )
  }

  if (loadState === 'notfound') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6">
        <p className="text-lg font-medium">Job not found</p>
        <Button variant="outline" asChild>
          <Link href="/">Back to jobs</Link>
        </Button>
      </div>
    )
  }

  if (loadState === 'forbidden') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6">
        <p className="text-lg font-medium">You don&apos;t have access to this job</p>
        <Button variant="outline" asChild>
          <Link href="/">Back to jobs</Link>
        </Button>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6">
        <p className="text-lg font-medium">Something went wrong</p>
        <Button variant="outline" asChild>
          <Link href="/">Back to jobs</Link>
        </Button>
      </div>
    )
  }

  const jobNotReady = !job || job.status !== 'completed'

  const displayTitle = job?.metadata?.project_name || job?.repoPath || 'Threat model'

  return (
    <main className="min-h-screen bg-background">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <header className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Image
              src={logo}
              alt="AI Threat Modeler"
              width={120}
              height={68}
              className="object-contain shrink-0"
              priority
            />
            {canGoBack ? (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                data-testid="report-back-button"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" asChild className="shrink-0">
                <Link href="/" data-testid="report-back-to-jobs">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to jobs
                </Link>
              </Button>
            )}
          </div>
          {job && !jobNotReady && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDownloadJson()}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </Button>
          )}
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
        {job && (
          <div>
            <h1 className="text-xl font-semibold truncate" data-testid="report-page-title">
              {displayTitle}
            </h1>
            <p className="text-sm text-muted-foreground">{formatDateWithTimezone(job.createdAt)}</p>
            {job.metadata?.scan_date && (
              <p className="text-sm text-muted-foreground">Scan date: {job.metadata.scan_date}</p>
            )}
          </div>
        )}

        {job && (job.contextFields || job.context) && (
          <JobContextCard contextFields={job.contextFields} context={job.context} />
        )}

        {jobNotReady && job ? (
          <div className="rounded-lg border border-border p-8 text-center space-y-3">
            <p className="font-medium">This job is not ready yet</p>
            <p className="text-sm text-muted-foreground">
              Status: {job.status}. Open this page again when the job has completed.
            </p>
            <Button variant="outline" asChild>
              <Link href="/">Back to jobs</Link>
            </Button>
          </div>
        ) : job ? (
          <JobReport job={job} onToastSuccess={success} onToastError={showError} />
        ) : null}
      </div>
    </main>
  )
}

const ReportJobPage = () => {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ReportPageContent />
      </Suspense>
    </AuthGuard>
  )
}

export default ReportJobPage
