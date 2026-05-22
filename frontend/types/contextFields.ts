/**
 * Context field types for threat modeling staging.
 */

export interface ContextFields {
  projectSummary?: string | null;
  securityContext?: string | null;
  deploymentContext?: string | null;
  developerContext?: string | null;
  suggestedExclusions?: string | null;
  additionalContext?: string | null;
}

export type StagingStatus =
  | 'pending'
  | 'extracting'
  | 'ready'
  | 'failed'
  | 'consumed'
  | 'cancelled'
  | 'expired';

export interface ThreatModelingStaging {
  stagingId: string;
  status: StagingStatus;
  draftContextFields: ContextFields | null;
  extractionError: string | null;
  expiresAt: string;
  sourceType?: 'upload' | 'github';
  repoName?: string | null;
  gitBranch?: string | null;
  gitCommit?: string | null;
  gitRef?: string | null;
  gitRefType?: 'branch' | 'tag' | 'commit' | null;
  createdAt?: string;
  updatedAt?: string;
}

export const CONTEXT_FIELD_CAPS = {
  projectSummary: 500,
  securityContext: 500,
  deploymentContext: 500,
  suggestedExclusions: 500,
  developerContext: 2000,
  additionalContext: 2000,
} as const;

export const emptyContextFields = (): ContextFields => ({
  projectSummary: null,
  securityContext: null,
  deploymentContext: null,
  developerContext: null,
  suggestedExclusions: null,
  additionalContext: null,
});
