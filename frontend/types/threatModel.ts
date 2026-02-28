/**
 * TypeScript interfaces for structured threat model report data.
 * Mirrors the JSON schema defined in appsec-agent/src/schemas/threat_model_report.ts.
 */

export interface DFDNode {
  id: string
  name: string
  type: 'external_entity' | 'process' | 'data_store'
  description?: string
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
}

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
