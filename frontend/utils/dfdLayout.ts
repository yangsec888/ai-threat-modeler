/**
 * ELK layered layout for DFD React Flow graphs (async, browser + Node).
 */

import type { Edge, Node } from '@xyflow/react'
import type { DfdNodeData } from '@/utils/dfdToReactFlow'

function nodeDimensions(type: string | undefined): { width: number; height: number } {
  switch (type) {
    case 'trustBoundary':
      return { width: 360, height: 260 }
    case 'dataStore':
      return { width: 176, height: 76 }
    case 'externalEntity':
    case 'process':
    default:
      return { width: 200, height: 84 }
  }
}

export type LayoutDirection = 'LR' | 'TB'

export interface ElkLayoutedNode {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  children?: ElkLayoutedNode[]
}

function buildElkGraph(
  nodes: Node<DfdNodeData>[],
  edges: Edge[],
  direction: LayoutDirection
): Record<string, unknown> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const boundaries = nodes.filter((n) => n.type === 'trustBoundary')
  const children: Record<string, unknown>[] = []

  for (const b of boundaries) {
    const { width: bw, height: bh } = nodeDimensions('trustBoundary')
    const inner = nodes
      .filter((n) => n.parentId === b.id)
      .map((n) => {
        const { width, height } = nodeDimensions(n.type)
        return { id: n.id, width, height }
      })
    children.push({
      id: b.id,
      width: bw,
      height: bh,
      layoutOptions: {
        'elk.padding': '[20,20,20,36]',
      },
      labels: [{ text: (b.data as DfdNodeData)?.label ?? b.id }],
      children: inner,
    })
  }

  const insideBoundary = new Set<string>()
  for (const b of boundaries) {
    for (const n of nodes) {
      if (n.parentId === b.id) insideBoundary.add(n.id)
    }
  }

  for (const n of nodes) {
    if (n.type === 'trustBoundary') continue
    if (n.parentId) continue
    if (insideBoundary.has(n.id)) continue
    const { width, height } = nodeDimensions(n.type)
    children.push({ id: n.id, width, height })
  }

  const elkEdges = edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }))

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
    },
    children,
    edges: elkEdges,
  }
}

function applyLayoutRecursive(
  elkNode: ElkLayoutedNode,
  nodesOut: Node<DfdNodeData>[],
  skipRoot: boolean
): void {
  if (elkNode.id === 'root') {
    elkNode.children?.forEach((ch) => applyLayoutRecursive(ch, nodesOut, false))
    return
  }

  const rf = nodesOut.find((n) => n.id === elkNode.id)
  if (rf) {
    rf.position = {
      x: elkNode.x ?? 0,
      y: elkNode.y ?? 0,
    }
    if (elkNode.width != null && elkNode.height != null) {
      rf.style = {
        ...rf.style,
        width: elkNode.width,
        height: elkNode.height,
      }
    }
  }

  elkNode.children?.forEach((ch) => applyLayoutRecursive(ch, nodesOut, false))
}

export async function layoutDfd(
  nodes: Node<DfdNodeData>[],
  edges: Edge[],
  direction: LayoutDirection
): Promise<{ nodes: Node<DfdNodeData>[]; edges: Edge[] }> {
  const elkModule = await import('elkjs/lib/elk.bundled.js')
  const ELKConstructor = elkModule.default
  const elk = new ELKConstructor()
  const graph = buildElkGraph(nodes, edges, direction)
  const layouted = (await elk.layout(graph as never)) as unknown as ElkLayoutedNode

  const nextNodes = nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    style: n.style ? { ...n.style } : undefined,
  }))

  applyLayoutRecursive(layouted, nextNodes, true)

  return { nodes: nextNodes, edges }
}
