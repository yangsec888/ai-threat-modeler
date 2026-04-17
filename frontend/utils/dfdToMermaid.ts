/**
 * Deterministic converter from structured DFD data to Mermaid flowchart syntax.
 * 
 * Shape mapping follows standard DFD notation:
 *   external_entity → rectangle [name]
 *   process         → rounded rectangle ("name")
 *   data_store      → cylinder [("name")]
 *   trust_boundary  → subgraph
 *   data_flow       → arrow with label -->|"label"|
 */

import type { DFDNode, DFDDataFlow, DFDTrustBoundary } from '@/types/threatModel'

function escapeMermaidLabel(label: string): string {
  return label.replace(/"/g, '#quot;')
}

function renderNode(node: DFDNode): string {
  const label = escapeMermaidLabel(node.name)
  switch (node.type) {
    case 'external_entity': return `${node.id}["${label}"]`
    case 'process':         return `${node.id}("${label}")`
    case 'data_store':      return `${node.id}[("${label}")]`
    default:                return `${node.id}["${label}"]`
  }
}

export type DfdMermaidDirection = 'LR' | 'TB'

export function dfdToMermaid(
  nodes: DFDNode[],
  dataFlows: DFDDataFlow[],
  trustBoundaries: DFDTrustBoundary[],
  direction: DfdMermaidDirection = 'LR'
): string {
  const lines: string[] = [`flowchart ${direction}`]

  const boundaryNodes = new Set(trustBoundaries.flatMap(tb => tb.nodes))

  for (const tb of trustBoundaries) {
    lines.push(`  subgraph ${tb.id} ["${escapeMermaidLabel(tb.name)}"]`)
    for (const nodeId of tb.nodes) {
      const node = nodes.find(n => n.id === nodeId)
      if (node) lines.push(`    ${renderNode(node)}`)
    }
    lines.push('  end')
  }

  for (const node of nodes) {
    if (!boundaryNodes.has(node.id)) {
      lines.push(`  ${renderNode(node)}`)
    }
  }

  for (const flow of dataFlows) {
    const parts = [flow.description]
    if (flow.protocol) parts.push(`(${flow.protocol})`)
    const label = escapeMermaidLabel(parts.join(' '))
    lines.push(`  ${flow.source} -->|"${label}"| ${flow.destination}`)
  }

  return lines.join('\n')
}
