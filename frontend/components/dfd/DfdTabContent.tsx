'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DfdCanvas, type DfdCanvasHandle } from '@/components/dfd/DfdCanvas'
import { DfdContextPanel } from '@/components/dfd/DfdContextPanel'
import { DfdLegend } from '@/components/dfd/DfdLegend'
import { DfdToolbar } from '@/components/dfd/DfdToolbar'
import type { ThreatModelingJob } from '@/types/threatModelingJob'
import type { DataFlowDiagram } from '@/types/threatModel'
import { dfdToMermaid } from '@/utils/dfdToMermaid'
import { dfdToReactFlow } from '@/utils/dfdToReactFlow'
import { layoutDfd, type LayoutDirection } from '@/utils/dfdLayout'
import { applyDfdVisualState } from '@/utils/dfdVisualFilters'
import type { NodeTypeKey, SeverityVisibility } from '@/utils/dfdVisualFilters'
import type { DfdNodeData } from '@/utils/dfdToReactFlow'

interface DfdTabContentProps {
  job: ThreatModelingJob
  dfdTabActive: boolean
  canvasRef: React.RefObject<DfdCanvasHandle | null>
  onRequestDfdPdf: () => void | Promise<void>
  onOpenThreatsForComponent?: (componentId: string) => void
  onToastSuccess: (msg: string) => void
  onToastError: (msg: string) => void
}

const defaultSeverity: SeverityVisibility = {
  CRITICAL: true,
  HIGH: true,
  MEDIUM: true,
  LOW: true,
}

const defaultTypes: Record<NodeTypeKey, boolean> = {
  external_entity: true,
  process: true,
  data_store: true,
}

export function DfdTabContent({
  job,
  dfdTabActive,
  canvasRef,
  onRequestDfdPdf,
  onOpenThreatsForComponent,
  onToastSuccess,
  onToastError,
}: DfdTabContentProps) {
  const dfd = job.dataFlowDiagram as DataFlowDiagram

  const [direction, setDirection] = useState<LayoutDirection>('LR')
  const [search, setSearch] = useState('')
  const [typeFilters, setTypeFilters] = useState(defaultTypes)
  const [severityVisible, setSeverityVisible] = useState(defaultSeverity)
  const [showLeftRail, setShowLeftRail] = useState(true)
  const [showContext, setShowContext] = useState(true)
  const [tablesOpen, setTablesOpen] = useState(true)
  const [descExpanded, setDescExpanded] = useState(false)
  const [layoutLoading, setLayoutLoading] = useState(true)
  const [layoutVersion, setLayoutVersion] = useState(0)

  const laidOutRef = useRef<{ nodes: Node<DfdNodeData>[]; edges: Edge[] } | null>(null)
  const [nodes, setNodes] = useState<Node<DfdNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  useEffect(() => {
    setSearch('')
    setTypeFilters(defaultTypes)
    setSeverityVisible(defaultSeverity)
    setDescExpanded(false)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [job.id])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLayoutLoading(true)
      try {
        const base = dfdToReactFlow(dfd, job.threatModel ?? null)
        const { nodes: laidNodes, edges: laidEdges } = await layoutDfd(
          base.nodes,
          base.edges,
          direction
        )
        if (cancelled) return
        laidOutRef.current = { nodes: laidNodes, edges: laidEdges }
        const applied = applyDfdVisualState(
          laidNodes,
          laidEdges,
          dfd,
          search,
          typeFilters,
          severityVisible
        )
        setNodes(applied.nodes)
        setEdges(applied.edges)
        setLayoutVersion((v) => v + 1)
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          onToastError(e instanceof Error ? e.message : 'Layout failed')
        }
      } finally {
        if (!cancelled) setLayoutLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [job.id, job.threatModel, direction, dfd, onToastError])

  useEffect(() => {
    const base = laidOutRef.current
    if (!base) return
    const applied = applyDfdVisualState(
      base.nodes,
      base.edges,
      dfd,
      search,
      typeFilters,
      severityVisible
    )
    setNodes((prev) => {
      const selected = new Map(prev.map((n) => [n.id, n.selected]))
      return applied.nodes.map((n) => ({
        ...n,
        selected: selected.get(n.id) ?? n.selected,
      }))
    })
    setEdges((prev) => {
      const selected = new Map(prev.map((e) => [e.id, e.selected]))
      return applied.edges.map((e) => ({
        ...e,
        selected: selected.get(e.id) ?? e.selected,
      }))
    })
  }, [search, typeFilters, severityVisible, dfd])

  const onNodesChange = useCallback((changes: NodeChange<Node<DfdNodeData>>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const onSelectionChange = useCallback((p: OnSelectionChangeParams<Node<DfdNodeData>, Edge>) => {
    const n = p.nodes[0]
    const e = p.edges[0]
    setSelectedNodeId(n?.id ?? null)
    setSelectedEdgeId(e?.id ?? null)
  }, [])

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((x) => x.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId]
  )
  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((x) => x.id === selectedEdgeId) ?? null : null),
    [edges, selectedEdgeId]
  )

  const handleFitView = useCallback(() => {
    canvasRef.current?.fitView({ padding: 0.15, duration: 200 })
  }, [canvasRef])

  const handleWideView = useCallback(() => {
    setShowLeftRail(false)
    setShowContext(false)
    setTablesOpen(false)
    requestAnimationFrame(() => {
      canvasRef.current?.fitView({ padding: 0.08, duration: 250 })
    })
  }, [canvasRef])

  const copyMermaid = useCallback(() => {
    const text = dfdToMermaid(
      dfd.nodes,
      dfd.data_flows,
      dfd.trust_boundaries,
      direction
    )
    void navigator.clipboard.writeText(text).then(
      () => onToastSuccess('Mermaid copied to clipboard'),
      () => onToastError('Could not copy to clipboard')
    )
  }, [dfd, direction, onToastSuccess, onToastError])

  const exportRaster = useCallback(
    async (kind: 'png' | 'svg') => {
      const el = canvasRef.current?.getExportElement()
      if (!el) {
        onToastError('Canvas is not ready for export')
        return
      }
      try {
        const { toSvg, toPng } = await import('html-to-image')
        const projectName = job.metadata?.project_name || job.repoPath
        const shortId = job.id.substring(0, 8)
        if (kind === 'svg') {
          const dataUrl = await toSvg(el, { cacheBust: true, backgroundColor: '#f8fafc' })
          const a = document.createElement('a')
          a.href = dataUrl
          a.download = `DFD - ${projectName} - ${shortId}.svg`
          a.click()
        } else {
          const dataUrl = await toPng(el, { cacheBust: true, backgroundColor: '#f8fafc', pixelRatio: 2 })
          const a = document.createElement('a')
          a.href = dataUrl
          a.download = `DFD - ${projectName} - ${shortId}.png`
          a.click()
        }
        onToastSuccess(kind === 'svg' ? 'SVG downloaded' : 'PNG downloaded')
      } catch (e) {
        onToastError(e instanceof Error ? e.message : 'Export failed')
      }
    },
    [canvasRef, job.id, job.metadata?.project_name, job.repoPath, onToastError, onToastSuccess]
  )

  const selectNodeById = useCallback(
    (id: string) => {
      setSelectedEdgeId(null)
      setSelectedNodeId(id)
      setNodes((nds) =>
        nds.map((n) => ({ ...n, selected: n.id === id }))
      )
      setEdges((eds) => eds.map((e) => ({ ...e, selected: false })))
      requestAnimationFrame(() => {
        canvasRef.current?.fitViewToNodeIds([id])
      })
    },
    [canvasRef]
  )

  const visibleNodeRows = useMemo(() => {
    return dfd.nodes.filter((n) => {
      const rf = nodes.find((r) => r.id === n.id)
      return rf && !rf.hidden
    })
  }, [dfd.nodes, nodes])

  const visibleFlowRows = useMemo(() => {
    return dfd.data_flows.filter((f) => {
      const rfS = nodes.find((r) => r.id === f.source)
      const rfT = nodes.find((r) => r.id === f.destination)
      return rfS && rfT && !rfS.hidden && !rfT.hidden
    })
  }, [dfd.data_flows, nodes])

  const description = dfd.description || ''
  const descPreview = description.length > 220 && !descExpanded

  return (
    <div className="space-y-3">
      <DfdToolbar
        search={search}
        onSearchChange={setSearch}
        direction={direction}
        onDirectionChange={setDirection}
        typeFilters={typeFilters}
        onTypeFilterChange={(k, v) => setTypeFilters((p) => ({ ...p, [k]: v }))}
        severityVisible={severityVisible}
        onSeverityVisibleChange={(s, v) => setSeverityVisible((p) => ({ ...p, [s]: v }))}
        onFitView={handleFitView}
        onExportPdf={onRequestDfdPdf}
        onExportPng={() => void exportRaster('png')}
        onExportSvg={() => void exportRaster('svg')}
        onCopyMermaid={copyMermaid}
        exportDisabled={!dfdTabActive || layoutLoading}
        showLeftRail={showLeftRail}
        onToggleLeftRail={() => setShowLeftRail((v) => !v)}
        showContextPanel={showContext}
        onToggleContextPanel={() => setShowContext((v) => !v)}
        layoutLoading={layoutLoading}
        onWideView={handleWideView}
      />

      <div className="flex flex-col lg:flex-row gap-3 min-h-[480px]">
        {showLeftRail && (
          <div className="w-full lg:w-56 xl:w-60 shrink-0 space-y-3 order-2 lg:order-1">
            {description && (
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className={`text-muted-foreground whitespace-pre-wrap ${descPreview ? 'line-clamp-3' : ''}`}>
                  {description}
                </div>
                {description.length > 220 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 px-2"
                    onClick={() => setDescExpanded((e) => !e)}
                    data-testid="dfd-desc-toggle"
                  >
                    {descExpanded ? 'Show less' : 'Show more'}
                  </Button>
                )}
              </div>
            )}
            <DfdLegend />
            <div className="rounded-md border p-2 text-xs space-y-1">
              <div className="font-medium">Trust boundaries</div>
              {dfd.trust_boundaries.map((tb) => (
                <Button
                  key={tb.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start h-8 text-xs"
                  onClick={() => selectNodeById(tb.id)}
                >
                  {tb.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 order-1 lg:order-2">
          <DfdCanvas
            ref={canvasRef}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={onSelectionChange}
            layoutVersion={layoutVersion}
          />
        </div>

        {showContext && (
          <div className="w-full lg:w-60 xl:w-64 shrink-0 order-3" data-testid="dfd-context-panel">
            <DfdContextPanel
              dfd={dfd}
              threats={job.threatModel?.threats}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onOpenThreatsForComponent={onOpenThreatsForComponent}
            />
          </div>
        )}
      </div>

      <div className="border rounded-md">
        <button
          type="button"
          className="flex w-full items-center gap-2 p-2 text-sm font-medium bg-muted/40 hover:bg-muted/60"
          onClick={() => setTablesOpen((o) => !o)}
          data-testid="dfd-tables-toggle"
        >
          {tablesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Nodes &amp; data flows tables
        </button>
        {tablesOpen && (
          <div className="p-3 space-y-4 border-t">
            <div>
              <h4 className="text-sm font-medium mb-2">Nodes ({visibleNodeRows.length})</h4>
              <div className="overflow-auto max-h-[240px] rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">ID</th>
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">Type</th>
                      <th className="text-left p-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dfd.nodes.map((node) => {
                      const rf = nodes.find((r) => r.id === node.id)
                      const hidden = rf?.hidden
                      if (hidden) return null
                      return (
                        <tr
                          key={node.id}
                          className={`border-t cursor-pointer hover:bg-muted/50 ${selectedNodeId === node.id ? 'bg-blue-50' : ''}`}
                          onClick={() => selectNodeById(node.id)}
                          data-testid={`dfd-table-node-${node.id}`}
                        >
                          <td className="p-2 font-mono text-xs">{node.id}</td>
                          <td className="p-2">{node.name}</td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 rounded bg-muted text-xs">
                              {node.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-2 text-muted-foreground">{node.description || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Data flows ({visibleFlowRows.length})</h4>
              <div className="overflow-auto max-h-[240px] rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">ID</th>
                      <th className="text-left p-2 font-medium">Source</th>
                      <th className="text-left p-2 font-medium">Destination</th>
                      <th className="text-left p-2 font-medium">Description</th>
                      <th className="text-left p-2 font-medium">Protocol</th>
                      <th className="text-left p-2 font-medium">Classification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dfd.data_flows.map((flow) => {
                      const rfS = nodes.find((r) => r.id === flow.source)
                      const rfT = nodes.find((r) => r.id === flow.destination)
                      if (!rfS || !rfT || rfS.hidden || rfT.hidden) return null
                      return (
                        <tr
                          key={flow.id}
                          className={`border-t cursor-pointer hover:bg-muted/50 ${selectedEdgeId === flow.id ? 'bg-blue-50' : ''}`}
                          onClick={() => {
                            setSelectedNodeId(null)
                            setSelectedEdgeId(flow.id)
                            setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
                            setEdges((eds) =>
                              eds.map((e) => ({ ...e, selected: e.id === flow.id }))
                            )
                          }}
                          data-testid={`dfd-table-flow-${flow.id}`}
                        >
                          <td className="p-2 font-mono text-xs">{flow.id}</td>
                          <td className="p-2 font-mono text-xs">{flow.source}</td>
                          <td className="p-2 font-mono text-xs">{flow.destination}</td>
                          <td className="p-2">{flow.description}</td>
                          <td className="p-2">{flow.protocol || '—'}</td>
                          <td className="p-2">{flow.data_classification || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
