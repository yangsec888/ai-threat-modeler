/**
 * TypeScript interfaces for structured threat model report data.
 * Mirrors the JSON schema defined in appsec-agent/src/schemas/threat_model_report.ts.
 */

export interface SourceLocation {
  file: string
  line_numbers?: string
  symbol?: string
  snippet?: string
}

export interface DFDNode {
  id: string
  name: string
  type: 'external_entity' | 'process' | 'data_store'
  description?: string
  source_locations?: SourceLocation[]
}

export interface DFDDataFlow {
  id: string
  source: string
  destination: string
  description: string
  protocol?: string
  data_classification?: string
}

export interface DFDTrustBoundary {
  id: string
  name: string
  nodes: string[]
}

export interface DataFlowDiagram {
  description: string
  nodes: DFDNode[]
  data_flows: DFDDataFlow[]
  trust_boundaries: DFDTrustBoundary[]
}

export interface Threat {
  id: string
  title: string
  stride_category: 'Spoofing' | 'Tampering' | 'Repudiation' | 'Information Disclosure' | 'Denial of Service' | 'Elevation of Privilege'
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  affected_components: string[]
  description: string
  attack_vector?: string
  impact: string
  likelihood: 'HIGH' | 'MEDIUM' | 'LOW'
  mitigation: string
  references?: string[]
  source_locations?: SourceLocation[]
  // Merged from the threat_reviews table at the API layer (human review loop).
  review_status?: ReviewStatus
  review_note?: string | null
}

/** Human review decisions for a generated threat finding. */
export type ReviewStatus = 'unreviewed' | 'accepted' | 'mitigated' | 'false_positive' | 'needs_review'

export const REVIEW_STATUS_OPTIONS: ReviewStatus[] = [
  'unreviewed',
  'accepted',
  'mitigated',
  'false_positive',
  'needs_review',
]

export interface ThreatModel {
  executive_summary: string
  threats: Threat[]
}

export interface Risk {
  id: string
  title: string
  category: string
  stride_category?: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  current_risk_score?: string
  residual_risk_score?: string
  description: string
  affected_components?: string[]
  business_impact?: string
  remediation_plan: string
  effort_estimate?: string
  cost_estimate?: string
  timeline?: string
  related_threats?: string[]
  source_locations?: SourceLocation[]
}

export interface RiskRegistry {
  summary: string
  risks: Risk[]
}

export interface ReportMetadata {
  project_name: string
  scan_date: string
  methodology: string
  total_threats_identified: number
  total_risks_identified: number
}

export interface Recommendation {
  title: string
  description: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}

/** Shape of a single finding used by the baseline-comparison results. */
export interface ComparisonFinding {
  id?: string
  title: string
  category?: string
  components?: string[]
}

export interface MatchedComparisonFinding {
  generated: ComparisonFinding
  baseline: ComparisonFinding
  tier: 'exact' | 'fuzzy'
  confidence: number
}

export interface ThreatModelComparison {
  matched: MatchedComparisonFinding[]
  missed: ComparisonFinding[]
  extra: ComparisonFinding[]
  recall: number
  precision: number
}

