/**
 * Threat aggregation and edge styling for DFD visualization.
 */

import type { DFDNode } from '@/types/threatModel'
import type { Threat } from '@/types/threatModel'

export type ThreatSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface NodeThreatStats {
  count: number
  maxSeverity: ThreatSeverity | null
}

const SEVERITY_RANK: Record<ThreatSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

function isThreatSeverity(s: string): s is ThreatSeverity {
  return s === 'CRITICAL' || s === 'HIGH' || s === 'MEDIUM' || s === 'LOW'
}

function maxSeverity(a: ThreatSeverity | null, b: ThreatSeverity): ThreatSeverity | null {
  if (!a) return b
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a
}

/** Match affected_components entry to a DFD node: id first, then case-insensitive name. */
export function componentMatchesNode(component: string, node: DFDNode): boolean {
  if (component === node.id) return true
  return component.trim().toLowerCase() === node.name.trim().toLowerCase()
}

export function getThreatStatsPerNode(
  nodes: DFDNode[],
  threats: Threat[] | undefined
): Record<string, NodeThreatStats> {
  const map: Record<string, NodeThreatStats> = {}
  for (const n of nodes) {
    map[n.id] = { count: 0, maxSeverity: null }
  }
  if (!threats?.length) return map

  for (const t of threats) {
    const sev = isThreatSeverity(t.severity) ? t.severity : null
    if (!sev) continue
    for (const comp of t.affected_components) {
      const node = nodes.find((n) => componentMatchesNode(comp, n))
      if (!node) continue
      const st = map[node.id]
      st.count += 1
      st.maxSeverity = maxSeverity(st.maxSeverity, sev)
    }
  }
  return map
}

/** Stroke color for data flow edges (hex). */
export function strokeForDataClassification(
  classification: string | undefined | null
): string {
  const c = (classification || '').toLowerCase()
  if (c.includes('pii') || c.includes('phi')) return '#b91c1c'
  if (c.includes('confidential') || c.includes('secret')) return '#7c3aed'
  if (c.includes('internal')) return '#ca8a04'
  if (c.includes('public')) return '#15803d'
  return '#64748b'
}

export function borderClassForMaxSeverity(max: ThreatSeverity | null): string {
  if (!max) return 'border-slate-300'
  switch (max) {
    case 'CRITICAL':
      return 'border-red-600 ring-2 ring-red-200'
    case 'HIGH':
      return 'border-orange-500 ring-2 ring-orange-100'
    case 'MEDIUM':
      return 'border-amber-400'
    case 'LOW':
      return 'border-emerald-500'
    default:
      return 'border-slate-300'
  }
}
