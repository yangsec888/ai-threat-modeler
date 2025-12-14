/**
 * Threat Modeling Component for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { FolderOpen, Download, Eye, Loader2, CheckCircle, XCircle, Clock, Trash2, Upload, FileSpreadsheet } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatDateWithTimezone } from '@/utils/date'
import { parseRiskRegistry } from '@/utils/riskRegistryParser'
import { sanitizeErrorMessage } from '@/lib/security'
import JSZip from 'jszip'

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`
  } else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    const parts: string[] = []
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    if (secs > 0) parts.push(`${secs}s`)
    return parts.join(' ')
  }
}

interface ThreatModelingJob {
  id: string
  repoPath: string
  query: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  reportPath: string | null // Backward compatibility
  dataFlowDiagramPath?: string | null
  threatModelPath?: string | null
  riskRegistryPath?: string | null
  errorMessage: string | null
  repoName?: string | null
  gitBranch?: string | null
  gitCommit?: string | null
  executionDuration?: number | null
  apiCost?: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  // Report contents
  reportContent?: string | null // Backward compatibility
  dataFlowDiagramContent?: string | null
  threatModelContent?: string | null
  riskRegistryContent?: string | null
  // Owner information (for Auditors)
  owner?: string
}

export function ThreatModeling() {
  const { canScheduleJobs, user } = useAuth()
  const isAuditor = user?.role === 'Auditor'
  const [selectedDirectory, setSelectedDirectory] = useState<FileSystemDirectoryHandle | null>(null)
  const [directoryName, setDirectoryName] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [jobs, setJobs] = useState<ThreatModelingJob[]>([])
  const [selectedJob, setSelectedJob] = useState<ThreatModelingJob | null>(null)
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
    try {
      const response = await api.getThreatModelingJob(jobId)
      const job = response.job

      setJobs((prevJobs) =>
        prevJobs.map((j) => (j.id === jobId ? job : j))
      )

      // If job completed or failed, stop polling and show notification
      if (job.status === 'completed') {
        setPollingJobs((prev) => {
          const next = new Set(prev)
          next.delete(jobId)
          return next
        })
        success(`Threat modeling job completed! Report is ready.`)
        loadJobs() // Refresh the list
      } else if (job.status === 'failed') {
        setPollingJobs((prev) => {
          const next = new Set(prev)
          next.delete(jobId)
          return next
        })
        showError(`Threat modeling job failed: ${job.errorMessage || 'Unknown error'}`)
      }
    } catch (err: unknown) {
      // If job not found (404), remove it from polling and jobs list
      if (err instanceof Error && err.message.includes('not found')) {
        console.warn(`Job ${jobId} not found, removing from polling`)
        setPollingJobs((prev) => {
          const next = new Set(prev)
          next.delete(jobId)
          return next
        })
        setJobs((prevJobs) => prevJobs.filter((j) => j.id !== jobId))
      } else {
        console.error('Failed to check job status:', err)
      }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedDirectory) {
      showError('Please select a directory to upload')
      return
    }

    setLoading(true)
    setUploading(true)

    try {
      let zipFile: File

      // Check if we have a FileSystemDirectoryHandle (modern browsers)
      if (selectedDirectory instanceof FileSystemDirectoryHandle) {
        // Create ZIP from directory
        info('Creating ZIP file from directory...')
        const zip = new JSZip()
        await addDirectoryToZip(zip, selectedDirectory)
        
        info('Compressing files...')
        const zipBlob = await zip.generateAsync({ 
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        })
        
        zipFile = new File([zipBlob], `${directoryName || 'repository'}.zip`, { 
          type: 'application/zip' 
        })
        info('ZIP file created. Uploading...')
      } else {
        // Fallback: use pre-created ZIP from webkitdirectory
        zipFile = (selectedDirectory as any).zipFile
        if (!zipFile) {
          throw new Error('Failed to create ZIP file')
        }
        info('Uploading directory...')
      }

      // Query is loaded from built-in YAML config file, not passed from frontend
      const response = await api.threatModeling(zipFile)
      
      // Add the new job to the list
      const newJob: ThreatModelingJob = {
        id: response.jobId,
        repoPath: response.job.repoPath,
        query: response.job.query,
        status: response.job.status,
        reportPath: null,
        errorMessage: null,
        repoName: response.job.repoName || null,
        gitBranch: response.job.gitBranch || null,
        gitCommit: response.job.gitCommit || null,
        executionDuration: response.job.executionDuration || null,
        apiCost: response.job.apiCost || null,
        createdAt: response.job.createdAt,
        updatedAt: response.job.createdAt,
        completedAt: null,
      }

      setJobs((prev) => [newJob, ...prev])
      setPollingJobs((prev) => new Set([...prev, response.jobId]))
      
      success('Threat modeling job created! The directory has been uploaded and will be analyzed. Source code will be removed after analysis.')
      
      // Clear form
      setSelectedDirectory(null)
      setDirectoryName('')
    } catch (err: unknown) {
      showError(sanitizeErrorMessage(err, 'Failed to create threat modeling job'))
    } finally {
      setLoading(false)
      setUploading(false)
      // Info toasts will auto-close after their duration
    }
  }

  const handleViewReport = async (job: ThreatModelingJob) => {
    try {
      const response = await api.getThreatModelingJob(job.id)
      console.log('Job response:', response)
      
      const updatedJob = response.job
      
      // Check if any report content is available
      const hasAnyContent = updatedJob.dataFlowDiagramContent || 
                           updatedJob.threatModelContent || 
                           updatedJob.riskRegistryContent ||
                           updatedJob.reportContent // Backward compatibility
      
      if (updatedJob.status === 'completed' && !hasAnyContent) {
        console.warn('Job is completed but report content is missing')
        showError('Report content is not available. The file may not have been generated correctly.')
      }
      
      setSelectedJob(updatedJob)
    } catch (err: unknown) {
      console.error('Error loading report:', err)
      if (err instanceof Error) {
        showError(err.message)
      } else {
        showError('Failed to load report')
      }
    }
  }

  const handleDownloadReport = async (jobId: string, type: 'data_flow_diagram' | 'threat_model' | 'risk_registry' | 'all' = 'all') => {
    try {
      await api.downloadThreatModelingReport(jobId, type)
      const reportName = type === 'all' ? 'All Reports (ZIP)'
                            : type === 'data_flow_diagram' ? 'Data Flow Diagram' 
                            : type === 'risk_registry' ? 'Risk Registry' 
                            : 'Threat Model'
      success(`${reportName} downloaded successfully!`)
    } catch (err: unknown) {
      if (err instanceof Error) {
        showError(err.message)
      } else {
        showError('Failed to download report')
      }
    }
  }


  const prepareRiskData = (riskRegistryContent: string): string[][] => {
    const risks = parseRiskRegistry(riskRegistryContent)
    
    if (risks.length === 0) {
      throw new Error('No risks found in the Risk Registry')
    }
    
    // Get all unique field names
    const allFields = new Set<string>()
    risks.forEach(risk => {
      Object.keys(risk).forEach(key => allFields.add(key))
    })
    
    // Define column order (prioritize important fields)
    const priorityFields = [
      'Risk ID',
      'Title',
      'Category',
      'STRIDE',
      'Severity',
      'Current Risk Score',
      'Residual Risk Score',
      'Description',
      'Affected Components',
      'Business Impact',
      'Remediation Plan',
      'Effort Estimate',
      'Cost Estimate',
      'Timeline',
    ]
    
    const orderedFields = [
      ...priorityFields.filter(f => allFields.has(f)),
      ...Array.from(allFields).filter(f => !priorityFields.includes(f)).sort(),
    ]
    
    // Create data array for Excel export
    const data: string[][] = []
    
    // Header row
    data.push(orderedFields)
    
    // Data rows
    risks.forEach(risk => {
      const row = orderedFields.map(field => {
        const value = risk[field] || ''
        // Clean up newlines and extra whitespace for better display in Excel
        return String(value).replace(/\n/g, ' ').replace(/\r/g, '').trim()
      })
      data.push(row)
    })
    
    return data
  }

  const handleExcelExport = () => {
    if (!selectedJob?.riskRegistryContent) {
      showError('No Risk Registry content available')
      return
    }

    try {
      const data = prepareRiskData(selectedJob.riskRegistryContent)
      const fileName = `Risk Registry - ${selectedJob.repoPath} - ${selectedJob.id.substring(0, 8)}.csv`
      
      // Convert data to CSV format
      const csvContent = data.map(row => {
        // Escape fields that contain commas, quotes, or newlines
        return row.map(field => {
          const stringField = String(field || '')
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            // Escape quotes by doubling them, then wrap in quotes
            return `"${stringField.replace(/"/g, '""')}"`
          }
          return stringField
        }).join(',')
      }).join('\n')
      
      // Add BOM for UTF-8 to ensure Excel opens it correctly
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
      
      // Create download link
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', fileName)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      success('Risk Registry exported to Excel successfully!')
    } catch (err: unknown) {
      console.error('Error exporting to Excel:', err)
      if (err instanceof Error) {
        showError(`Failed to export: ${err.message}`)
      } else {
        showError('Failed to export Risk Registry to Excel')
      }
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job and its report? This action cannot be undone.')) {
      return
    }

    try {
      await api.deleteThreatModelingJob(jobId)
      success('Job deleted successfully!')
      
      // Remove from local state
      setJobs((prev) => prev.filter((job) => job.id !== jobId))
      
      // If the deleted job was being viewed, close the preview
      if (selectedJob && selectedJob.id === jobId) {
        setSelectedJob(null)
      }
      
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

  const getStatusIcon = (status: string) => {
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

  const getStatusBadge = (status: string) => {
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
          <form onSubmit={handleSubmit} className="space-y-4">
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
                Select your local code repository directory. It will be uploaded to the server for analysis and automatically removed after processing to protect your source code.
              </p>
            </div>
            <Button type="submit" disabled={loading || !selectedDirectory}>
              {loading ? (
                <>
                  {uploading ? (
                    <>
                      <Upload className="mr-2 h-4 w-4 animate-pulse" />
                      Uploading & Creating Job...
                    </>
                  ) : (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Job...
                    </>
                  )}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload & Create Threat Modeling Job
                </>
              )}
            </Button>
          </form>
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
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No threat modeling jobs yet.</p>
              <p className="text-sm mt-2">Create a job above to get started.</p>
            </div>
          ) : (
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
                        <p className="text-sm font-medium">Repository: {job.repoPath}</p>
                        {job.owner && (
                          <p className="text-sm text-muted-foreground">Owner: {job.owner}</p>
                        )}
                        {(job.repoName || job.gitBranch || job.gitCommit) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {job.repoName && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                                Repo: {job.repoName}
                              </span>
                            )}
                            {job.gitBranch && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                                Branch: {job.gitBranch}
                              </span>
                            )}
                            {job.gitCommit && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                                Commit: {job.gitCommit}
                              </span>
                            )}
                          </div>
                        )}
                        {(job.executionDuration !== null && job.executionDuration !== undefined) && (
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
                            onClick={() => handleViewReport(job)}
                            className="flex items-center gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            Preview
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadReport(job.id)}
                            className="flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                        </>
                      )}
                      {!isAuditor && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteJob(job.id)}
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
          )}
          </CardContent>
        </Card>

      {/* Report Preview Modal */}
      {selectedJob && selectedJob.status === 'completed' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Report Preview</CardTitle>
                <CardDescription>
                  Threat modeling reports for {selectedJob.repoPath}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedJob(null)}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="threat_model" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="data_flow_diagram">Data Flow Diagram</TabsTrigger>
                <TabsTrigger value="threat_model">Threat Model</TabsTrigger>
                <TabsTrigger value="risk_registry">Risk Registry</TabsTrigger>
              </TabsList>
              
              <TabsContent value="data_flow_diagram" className="space-y-4 mt-4">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadReport(selectedJob.id, 'data_flow_diagram')}
                    className="flex items-center gap-2"
                    disabled={!selectedJob.dataFlowDiagramContent}
                  >
                    <Download className="h-4 w-4" />
                    Download Data Flow Diagram
                  </Button>
                </div>
                {selectedJob.dataFlowDiagramContent ? (
                  <div className="bg-muted p-4 rounded-md max-h-[600px] overflow-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {selectedJob.dataFlowDiagramContent}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Data Flow Diagram not available.</p>
              </div>
                )}
              </TabsContent>
              
              <TabsContent value="threat_model" className="space-y-4 mt-4">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadReport(selectedJob.id, 'threat_model')}
                    className="flex items-center gap-2"
                    disabled={!selectedJob.threatModelContent && !selectedJob.reportContent}
                  >
                    <Download className="h-4 w-4" />
                    Download Threat Model
                  </Button>
                </div>
                {(selectedJob.threatModelContent || selectedJob.reportContent) ? (
                  <div className="bg-muted p-4 rounded-md max-h-[600px] overflow-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {selectedJob.threatModelContent || selectedJob.reportContent}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Threat Model not available.</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="risk_registry" className="space-y-4 mt-4">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadReport(selectedJob.id, 'risk_registry')}
                    className="flex items-center gap-2"
                    disabled={!selectedJob.riskRegistryContent}
                  >
                    <Download className="h-4 w-4" />
                    Download Risk Registry
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleExcelExport}
                    className="flex items-center gap-2"
                    disabled={!selectedJob.riskRegistryContent}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Export to Excel
                  </Button>
                </div>
                {selectedJob.riskRegistryContent ? (
                  <div className="bg-muted p-4 rounded-md max-h-[600px] overflow-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {selectedJob.riskRegistryContent}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Risk Registry not available.</p>
                </div>
              )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
