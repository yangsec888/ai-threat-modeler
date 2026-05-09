/**
 * Threat modeling job shape used by the dashboard and DFD tab.
 */

import type { DataFlowDiagram, ReportMetadata, RiskRegistry, ThreatModel, Recommendation } from '@/types/threatModel'

export type ThreatModelingJobSourceType = 'upload' | 'github'
export type ThreatModelingJobGitRefType = 'branch' | 'tag' | 'commit'

export interface ThreatModelingJob {
  id: string
  repoPath: string
  query: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage: string | null
  repoName?: string | null
  gitBranch?: string | null
  gitCommit?: string | null
  sourceType?: ThreatModelingJobSourceType | null
  sourceUrl?: string | null
  gitRef?: string | null
  gitRefType?: ThreatModelingJobGitRefType | null
  executionDuration?: number | null
  apiCost?: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  metadata?: ReportMetadata | null
  dataFlowDiagram?: DataFlowDiagram | null
  threatModel?: ThreatModel | null
  riskRegistry?: RiskRegistry | null
  recommendations?: Recommendation[] | null
  conclusion?: string | null
  owner?: string
}
