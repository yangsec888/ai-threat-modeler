/**
 * Threat Modeling Component for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { FolderOpen, Loader2, Github, Search } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { GitHubImport } from '@/components/GitHubImport'
import { JobsList } from '@/components/JobsList'
import { sanitizeErrorMessage } from '@/lib/security'
import JSZip from 'jszip'
import type { ThreatModelingJob } from '@/types/threatModelingJob'
import { ContextFieldsForm } from '@/components/ContextFieldsForm'
import { useThreatModelingStaging } from '@/hooks/useThreatModelingStaging'

export function ThreatModeling() {
  const { canScheduleJobs, user } = useAuth()
  const uploadStaging = useThreatModelingStaging()
  const isAuditor = user?.role === 'Auditor'
  const [selectedDirectory, setSelectedDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [directoryName, setDirectoryName] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [jobs, setJobs] = useState<ThreatModelingJob[]>([])
  const [pollingJobs, setPollingJobs] = useState<Set<string>>(new Set())
  const { toasts, success, error: showError, info, removeToast } = useToast()
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load jobs on mount
  useEffect(() => {
    loadJobs()
  }, [])

  // Poll for active jobs
  useEffect(() => {
    if (pollingJobs.size > 0) {
      pollingIntervalRef.current = setInterval(() => {
        pollingJobs.forEach((jobId) => {
          checkJobStatus(jobId)
        })
      }, 3000) // Poll every 3 seconds

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    }
  }, [pollingJobs])

  const loadJobs = async () => {
    try {
      const response = await api.getThreatModelingJobs()
      setJobs(response.jobs || [])
      
      // Check for active jobs that need polling
      const activeJobs = response.jobs?.filter(
        (job: ThreatModelingJob) => job.status === 'pending' || job.status === 'processing'
      ) || []
      
      if (activeJobs.length > 0) {
        setPollingJobs(new Set(activeJobs.map((job: ThreatModelingJob) => job.id)))
      }
    } catch (err: unknown) {
      console.error('Failed to load jobs:', err)
    }
  }

  const checkJobStatus = async (jobId: string) => {
    const result = await api.getThreatModelingJob(jobId)

    if (result.notFound) {
      console.warn(`Job ${jobId} not found, removing from polling`)
      setPollingJobs((prev) => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
      setJobs((prevJobs) => prevJobs.filter((j) => j.id !== jobId))
      return
    }

    if (result.forbidden || result.error || !result.job) {
      console.error('Failed to check job status:', result.error ?? 'forbidden')
      return
    }

    const job = result.job

    setJobs((prevJobs) => prevJobs.map((j) => (j.id === jobId ? job : j)))

    if (job.status === 'completed') {
      setPollingJobs((prev) => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
      success(`Threat modeling job completed! Report is ready.`)
      loadJobs()
    } else if (job.status === 'failed') {
      setPollingJobs((prev) => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
      showError(`Threat modeling job failed: ${job.errorMessage || 'Unknown error'}`)
    }
  }

  // Helper function to recursively read directory and add files to ZIP
  const addDirectoryToZip = async (zip: JSZip, dirHandle: FileSystemDirectoryHandle, path: string = '') => {
    // @ts-ignore - entries() is a valid FileSystemDirectoryHandle API
    for await (const [name, entry] of dirHandle.entries()) {
      const entryPath = path ? `${path}/${name}` : name;
      
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        zip.file(entryPath, file);
      } else if (entry.kind === 'directory') {
        await addDirectoryToZip(zip, entry, entryPath);
      }
    }
  };

  const handleBrowseDirectory = async () => {
    try {
      // Check if File System Access API is supported (Chrome, Edge, etc.)
      if ('showDirectoryPicker' in window) {
        const directoryHandle = await (window as any).showDirectoryPicker()
        setSelectedDirectory(directoryHandle)
        setDirectoryName(directoryHandle.name)
        success(`Directory "${directoryHandle.name}" selected. Ready to upload.`)
      } else {
        // Fallback: Use a hidden file input with webkitdirectory attribute
        const input = document.createElement('input')
        input.type = 'file'
        input.setAttribute('webkitdirectory', '')
        input.setAttribute('directory', '')
        input.style.display = 'none'
        document.body.appendChild(input)
        
        input.onchange = async (e: Event) => {
          const target = e.target as HTMLInputElement
          if (target.files && target.files.length > 0) {
            // Get the directory name from the first file's relative path
            const filePath = (target.files[0] as any).webkitRelativePath || ''
            const directoryPath = filePath.split('/')[0] || target.files[0].name
            setDirectoryName(directoryPath)
            
            // Create a ZIP from the files
            const zip = new JSZip()
            for (let i = 0; i < target.files.length; i++) {
              const file = target.files[i]
              const relativePath = (file as any).webkitRelativePath || file.name
              zip.file(relativePath, file)
            }
            
            const zipBlob = await zip.generateAsync({ type: 'blob' })
            const zipFile = new File([zipBlob], `${directoryPath}.zip`, { type: 'application/zip' })
            
            // Store the ZIP file (we'll use it in handleSubmit)
            ;(input as any).zipFile = zipFile
            setSelectedDirectory(input as any) // Store the input with zipFile
            
            success(`Directory "${directoryPath}" selected. Ready to upload.`)
          }
          document.body.removeChild(input)
        }
        
        input.click()
      }
    } catch (err: unknown) {
      // User cancelled the dialog or error occurred
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error selecting directory:', err)
        showError('Failed to select directory.')
      }
      // If user cancelled, don't show an error - that's expected behavior
    }
  }

  const buildZipFromSelection = async (): Promise<File> => {
    if (selectedDirectory instanceof FileSystemDirectoryHandle) {
      info('Creating ZIP file from directory...')
      const zip = new JSZip()
      await addDirectoryToZip(zip, selectedDirectory)
      info('Compressing files...')
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })
      return new File([zipBlob], `${directoryName || 'repository'}.zip`, {
        type: 'application/zip',
      })
    }
    const zipFile = (selectedDirectory as unknown as { zipFile?: File })?.zipFile
    if (!zipFile) throw new Error('Failed to create ZIP file')
    return zipFile
  }

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDirectory) {
      showError('Please select a directory to upload')
      return
    }
    setLoading(true)
    setUploading(true)
    try {
      const zipFile = await buildZipFromSelection()
      info('Uploading repository for context analysis...')
      await uploadStaging.startUpload(zipFile, directoryName || undefined)
      success('Repository staged. Review the generated context, then run the threat model.')
    } catch (err: unknown) {
      showError(sanitizeErrorMessage(err, 'Failed to analyze repository'))
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  const handleRunThreatModel = async () => {
    setLoading(true)
    try {
      const response = await uploadStaging.run()
      if (!response) return
      const newJob: ThreatModelingJob = {
        id: response.jobId,
        repoPath: response.job.repoPath,
        query: response.job.query,
        status: response.job.status,
        errorMessage: null,
        repoName: response.job.repoName || null,
        gitBranch: response.job.gitBranch || null,
        gitCommit: response.job.gitCommit || null,
        context: response.job.context ?? null,
        contextFields: response.job.contextFields ?? null,
        executionDuration: response.job.executionDuration || null,
        apiCost: response.job.apiCost || null,
        createdAt: response.job.createdAt,
        updatedAt: response.job.createdAt,
        completedAt: null,
      }
      setJobs((prev) => [newJob, ...prev])
      setPollingJobs((prev) => new Set([...prev, response.jobId]))
      success('Threat modeling job started!')
      uploadStaging.reset()
      setSelectedDirectory(null)
      setDirectoryName('')
    } catch (err: unknown) {
      showError(sanitizeErrorMessage(err, 'Failed to start threat modeling job'))
    } finally {
      setLoading(false)
    }
  }

  const handleOpenPreview = (jobId: string) => {
    window.open(`/reports/${jobId}`, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadJson = async (jobId: string) => {
    try {
      await api.downloadThreatModelingReport(jobId, 'json')
      success('JSON report downloaded successfully!')
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to download report')
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job and its report? This action cannot be undone.')) {
      return
    }

    try {
      await api.deleteThreatModelingJob(jobId)
      success('Job deleted successfully!')
      
      setJobs((prev) => prev.filter((job) => job.id !== jobId))

      // Stop polling if it was an active job
      setPollingJobs((prev) => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        showError(err.message)
      } else {
        showError('Failed to delete job')
      }
    }
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {canScheduleJobs ? (
      <Card>
        <CardHeader>
          <CardTitle>AI Threat Modeler Agent</CardTitle>
          <CardDescription>
            Create threat modeling analysis jobs. You'll be notified when they complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="upload">
                <FolderOpen className="mr-2 h-4 w-4" />
                Upload directory
              </TabsTrigger>
              <TabsTrigger value="github">
                <Github className="mr-2 h-4 w-4" />
                Import from GitHub
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="pt-4">
              {uploadStaging.status === 'expired' ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                    {uploadStaging.error ?? 'Session expired — please re-import the repository.'}
                  </div>
                  <Button type="button" variant="outline" onClick={() => uploadStaging.reset()}>
                    Reset
                  </Button>
                </div>
              ) : uploadStaging.status === 'idle' ? (
                <form onSubmit={handleAnalyze} className="space-y-4">
                  <div>
                    <label htmlFor="repository" className="text-sm font-medium mb-2 block">
                      Repository Directory
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 border rounded-md px-3 py-2 bg-muted/50 flex items-center">
                        {directoryName ? (
                          <span className="text-sm flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                            {directoryName}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">No directory selected</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleBrowseDirectory}
                        className="flex items-center gap-2"
                        disabled={uploading}
                      >
                        <FolderOpen className="h-4 w-4" />
                        {directoryName ? 'Change Directory' : 'Select Directory'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select your local code repository directory. It will be uploaded for context analysis, then you can review and edit deployment context before running the threat model.
                    </p>
                  </div>
                  <Button type="submit" disabled={loading || !selectedDirectory}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {uploading ? 'Uploading...' : 'Analyzing...'}
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Analyze repository
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  {uploadStaging.status === 'extracting' && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating context from repository…
                    </p>
                  )}
                  <ContextFieldsForm
                    fields={uploadStaging.fields}
                    status={
                      uploadStaging.status === 'running'
                        ? 'ready'
                        : uploadStaging.status === 'extracting'
                          ? 'extracting'
                          : uploadStaging.status === 'failed'
                            ? 'failed'
                            : 'ready'
                    }
                    onChange={uploadStaging.setField}
                    disabled={uploadStaging.status === 'running'}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void handleRunThreatModel()}
                      disabled={
                        loading ||
                        uploadStaging.status === 'extracting' ||
                        uploadStaging.status === 'running'
                      }
                    >
                      {uploadStaging.status === 'running' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting…
                        </>
                      ) : (
                        'Run threat model'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void uploadStaging.cancel()}
                      disabled={uploadStaging.status === 'running'}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="github" className="pt-4">
              <GitHubImport
                onImportStarted={(job) => {
                  setJobs((prev) => [job, ...prev])
                  setPollingJobs((prev) => new Set([...prev, job.id]))
                  success('GitHub import started! The repository is being downloaded and analyzed.')
                }}
                onError={(message) => showError(message)}
                onInfo={(message) => info(message)}
                onTokenNeeded={() => info('Configure a GitHub PAT in Settings to access private repositories.')}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Threat Modeling Reports</CardTitle>
            <CardDescription>
              You have Auditor access. You can view reports but cannot create new jobs.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Jobs List */}
        <Card>
        <CardHeader>
          <CardTitle>Threat Modeling Jobs</CardTitle>
          <CardDescription>
            View and manage your threat modeling analysis jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JobsList
            jobs={jobs}
            isAuditor={isAuditor}
            onPreview={handleOpenPreview}
            onDownloadJson={(id) => void handleDownloadJson(id)}
            onDeleteJob={(id) => void handleDeleteJob(id)}
          />
        </CardContent>
        </Card>

    </div>
  )
}
