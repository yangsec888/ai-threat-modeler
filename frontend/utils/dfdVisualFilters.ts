/**
 * Search dimming, type visibility, and severity visibility for DFD canvas.
 */

import type { Edge, Node } from '@xyflow/react'
import type { DataFlowDiagram } from '@/types/threatModel'
import type { DfdNodeData } from '@/utils/dfdToReactFlow'
import type { ThreatSeverity } from '@/utils/dfdDecorations'

export type NodeTypeKey = 'external_entity' | 'process' | 'data_store'

export interface SeverityVisibility {
  CRITICAL: boolean
  HIGH: boolean
  MEDIUM: boolean
  LOW: boolean
}

function isSeverity(s: string | null | undefined): s is ThreatSeverity {
  return s === 'CRITICAL' || s === 'HIGH' || s === 'MEDIUM' || s === 'LOW'
}

/** IDs of DFD nodes + trust boundaries that match the search query. */
export function matchingIdsForSearch(dfd: DataFlowDiagram, query: string): Set<string> {
  const q = query.trim().toLowerCase()
  const out = new Set<string>()
  if (!q) {
    dfd.nodes.forEach((n) => out.add(n.id))
    dfd.trust_boundaries.forEach((tb) => out.add(tb.id))
    return out
  }

  for (const n of dfd.nodes) {
    if (
      n.id.toLowerCase().includes(q) ||
      n.name.toLowerCase().includes(q) ||
      (n.description && n.description.toLowerCase().includes(q))
    ) {
      out.add(n.id)
    }
  }

  for (const f of dfd.data_flows) {
    if (
      f.description.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q) ||
      (f.protocol && f.protocol.toLowerCase().includes(q))
    ) {
      out.add(f.source)
      out.add(f.destination)
    }
  }

  for (const tb of dfd.trust_boundaries) {
    if (tb.name.toLowerCase().includes(q) || tb.id.toLowerCase().includes(q)) {
      out.add(tb.id)
    }
  }

  for (const tb of dfd.trust_boundaries) {
    const anyChild = tb.nodes.some((nid) => out.has(nid))
    if (anyChild) out.add(tb.id)
  }

  return out
}

export function applyDfdVisualState(
  nodes: Node<DfdNodeData>[],
  edges: Edge[],
  dfd: DataFlowDiagram,
  search: string,
  typeFilters: Record<NodeTypeKey, boolean>,
  severityVisible: SeverityVisibility
): { nodes: Node<DfdNodeData>[]; edges: Edge[] } {
  const match = matchingIdsForSearch(dfd, search)
  const hasSearch = search.trim().length > 0

  const nextNodes = nodes.map((n) => {
    if (n.type === 'trustBoundary') {
      const dimmed = hasSearch && !match.has(n.id)
      return {
        ...n,
        data: { ...n.data, dimmed },
        hidden: false,
      }
    }

    const nt = n.data.nodeType
    if (nt === 'trust_boundary') {
      return { ...n, hidden: false, data: { ...n.data, dimmed: false } }
    }

    const typeOk =
      (nt === 'external_entity' && typeFilters.external_entity) ||
      (nt === 'process' && typeFilters.process) ||
      (nt === 'data_store' && typeFilters.data_store)

    const max = n.data.threatStats?.maxSeverity
    const sevOk =
      !max || !isSeverity(max)
        ? true
        : severityVisible[max]

    const hidden = !typeOk || !sevOk
    const dimmed = hasSearch && !match.has(n.id) && !hidden

    return {
      ...n,
      hidden,
      data: { ...n.data, dimmed },
    }
  })

  const hiddenNode = new Set(nextNodes.filter((n) => n.hidden).map((n) => n.id))
  const nextEdges = edges.map((e) => {
    const endHidden = hiddenNode.has(e.source) || hiddenNode.has(e.target)
    const dim =
      hasSearch &&
      !endHidden &&
      !match.has(e.source) &&
      !match.has(e.target) &&
      !(String(e.label || '').toLowerCase().includes(search.trim().toLowerCase()))
    return {
      ...e,
      hidden: endHidden,
      style: {
        ...e.style,
        opacity: dim ? 0.25 : endHidden ? 0 : 1,
      },
    }
  })

  return { nodes: nextNodes, edges: nextEdges }
}
