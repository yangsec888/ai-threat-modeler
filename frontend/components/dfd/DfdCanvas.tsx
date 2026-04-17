'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
  type KeyboardEvent,
} from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { DfdNodeData } from '@/utils/dfdToReactFlow'
import { ExternalEntityNode } from '@/components/dfd/nodes/ExternalEntityNode'
import { ProcessNode } from '@/components/dfd/nodes/ProcessNode'
import { DataStoreNode } from '@/components/dfd/nodes/DataStoreNode'
import { TrustBoundaryNode } from '@/components/dfd/nodes/TrustBoundaryNode'

const nodeTypes = {
  externalEntity: ExternalEntityNode,
  process: ProcessNode,
  dataStore: DataStoreNode,
  trustBoundary: TrustBoundaryNode,
}

export interface DfdCanvasHandle {
  getExportElement: () => HTMLElement | null
  fitView: (opts?: { padding?: number; duration?: number }) => void
  fitViewToNodeIds: (ids: string[]) => void
}

interface DfdCanvasInnerProps {
  nodes: Node<DfdNodeData>[]
  edges: Edge[]
  onNodesChange: OnNodesChange<Node<DfdNodeData>>
  onEdgesChange: OnEdgesChange
  onSelectionChange: OnSelectionChangeFunc<Node<DfdNodeData>, Edge>
  layoutVersion: number
  handleRef: ForwardedRef<DfdCanvasHandle | null>
}

function DfdCanvasInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onSelectionChange,
  layoutVersion,
  handleRef,
}: DfdCanvasInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()

  useImperativeHandle(handleRef, () => ({
    getExportElement: () => {
      const root = containerRef.current
      if (!root) return null
      return (
        (root.querySelector('.react-flow__viewport') as HTMLElement | null) ?? root
      )
    },
    fitView: (opts) => {
      fitView({ padding: opts?.padding ?? 0.15, duration: opts?.duration ?? 200 })
    },
    fitViewToNodeIds: (ids) => {
      if (!ids.length) return
      fitView({
        nodes: ids.map((id) => ({ id })),
        padding: 0.25,
        duration: 250,
      })
    },
  }))

  useEffect(() => {
    if (layoutVersion <= 0) return
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 200 })
    })
    return () => cancelAnimationFrame(id)
  }, [layoutVersion, fitView])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const t = e.target as HTMLElement | null
    if (!t?.closest?.('[data-testid^="dfd-node-"]')) return
    e.preventDefault()
    t.click()
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-[min(80vh,720px)] min-h-[440px] w-full rounded-md border bg-slate-50"
      data-testid="dfd-canvas-root"
      onKeyDown={onKeyDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        minZoom={0.05}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        elevateEdgesOnSelect
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          zoomable
          pannable
          className="!bg-white/90 !border !border-slate-200"
          maskColor="rgb(148 163 184 / 0.15)"
        />
      </ReactFlow>
    </div>
  )
}

interface DfdCanvasProps {
  nodes: Node<DfdNodeData>[]
  edges: Edge[]
  onNodesChange: OnNodesChange<Node<DfdNodeData>>
  onEdgesChange: OnEdgesChange
  onSelectionChange: OnSelectionChangeFunc<Node<DfdNodeData>, Edge>
  layoutVersion: number
}

export const DfdCanvas = forwardRef<DfdCanvasHandle, DfdCanvasProps>(
  function DfdCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <DfdCanvasInner {...props} handleRef={ref} />
      </ReactFlowProvider>
    )
  }
)
