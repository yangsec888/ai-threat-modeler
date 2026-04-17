/**
 * Convert structured DFD + optional threat model to React Flow nodes/edges (positions filled by ELK).
 */

import type { Edge, Node } from '@xyflow/react'
import type { DataFlowDiagram, DFDNode, ThreatModel } from '@/types/threatModel'
import {
  getThreatStatsPerNode,
  strokeForDataClassification,
} from '@/utils/dfdDecorations'

export type DfdRfNodeType = 'externalEntity' | 'process' | 'dataStore' | 'trustBoundary'

export interface DfdNodeData extends Record<string, unknown> {
  label: string
  description?: string
  nodeType: DFDNode['type'] | 'trust_boundary'
  threatStats?: { count: number; maxSeverity: string | null }
  dimmed?: boolean
}

/** First trust boundary wins if a node appears in multiple lists. */
export function assignParentIds(
  nodes: DFDNode[],
  trustBoundaries: { id: string; nodes: string[] }[]
): Map<string, string> {
  const parent = new Map<string, string>()
  for (const tb of trustBoundaries) {
    for (const nid of tb.nodes) {
      const existing = parent.get(nid)
      if (existing && existing !== tb.id) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(
            `[DFD] Node "${nid}" appears in multiple trust boundaries; keeping "${existing}".`
          )
        }
        continue
      }
      if (!existing) parent.set(nid, tb.id)
    }
  }
  return parent
}

export function dfdToReactFlow(
  dfd: DataFlowDiagram,
  threatModel: ThreatModel | null | undefined
): { nodes: Node<DfdNodeData>[]; edges: Edge[] } {
  const parentByNode = assignParentIds(dfd.nodes, dfd.trust_boundaries)
  const stats = getThreatStatsPerNode(dfd.nodes, threatModel?.threats)

  const nodes: Node<DfdNodeData>[] = []

  for (const tb of dfd.trust_boundaries) {
    nodes.push({
      id: tb.id,
      type: 'trustBoundary',
      position: { x: 0, y: 0 },
      data: {
        label: tb.name,
        nodeType: 'trust_boundary',
      },
      style: { width: 320, height: 240 },
      zIndex: -1,
    })
  }

  for (const n of dfd.nodes) {
    const pid = parentByNode.get(n.id)
    const st = stats[n.id]
    const rfType: DfdRfNodeType =
      n.type === 'external_entity'
        ? 'externalEntity'
        : n.type === 'data_store'
          ? 'dataStore'
          : 'process'

    nodes.push({
      id: n.id,
      type: rfType,
      position: { x: 0, y: 0 },
      parentId: pid,
      extent: pid ? ('parent' as const) : undefined,
      data: {
        label: n.name,
        description: n.description,
        nodeType: n.type,
        threatStats:
          st.count > 0
            ? { count: st.count, maxSeverity: st.maxSeverity }
            : undefined,
      },
    })
  }

  const edges: Edge[] = dfd.data_flows.map((f) => ({
    id: f.id,
    source: f.source,
    target: f.destination,
    label: f.description,
    animated: false,
    style: { stroke: strokeForDataClassification(f.data_classification), strokeWidth: 2 },
    labelStyle: { fill: '#334155', fontWeight: 500, fontSize: 11 },
    labelBgStyle: { fill: '#f8fafc' },
    labelBgPadding: [4, 4] as [number, number],
    labelBgBorderRadius: 4,
    data: {
      description: f.description,
      protocol: f.protocol,
      classification: f.data_classification,
    },
  }))

  return { nodes, edges }
}
