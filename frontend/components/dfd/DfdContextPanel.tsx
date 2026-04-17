'use client'

import type { Edge, Node } from '@xyflow/react'
import type { DataFlowDiagram, Threat } from '@/types/threatModel'
import type { DfdNodeData } from '@/utils/dfdToReactFlow'
import { Button } from '@/components/ui/button'

interface DfdContextPanelProps {
  dfd: DataFlowDiagram
  threats: Threat[] | undefined
  selectedNode: Node<DfdNodeData> | null
  selectedEdge: Edge | null
  onOpenThreatsForComponent?: (componentId: string) => void
}

export function DfdContextPanel({
  dfd,
  threats,
  selectedNode,
  selectedEdge,
  onOpenThreatsForComponent,
}: DfdContextPanelProps) {
  if (selectedEdge) {
    const d = selectedEdge.data as
      | { description?: string; protocol?: string; classification?: string }
      | undefined
    return (
      <div className="rounded-md border bg-card p-3 text-sm space-y-2 min-w-[200px] max-w-[280px] font-sans">
        <div className="font-semibold">Data flow</div>
        <div>
          <span className="text-muted-foreground">ID:</span>{' '}
          <span className="font-mono text-xs">{selectedEdge.id}</span>
        </div>
        <div>
          <span className="text-muted-foreground">From → To:</span>{' '}
          <span className="font-mono text-xs">
            {selectedEdge.source} → {selectedEdge.target}
          </span>
        </div>
        {d?.description && (
          <div>
            <div className="text-muted-foreground text-xs">Description</div>
            <div>{d.description}</div>
          </div>
        )}
        {d?.protocol && (
          <div>
            <div className="text-muted-foreground text-xs">Protocol</div>
            <div>{d.protocol}</div>
          </div>
        )}
        {d?.classification && (
          <div>
            <div className="text-muted-foreground text-xs">Classification</div>
            <div>{d.classification}</div>
          </div>
        )}
      </div>
    )
  }

  if (selectedNode) {
    const meta = dfd.nodes.find((n) => n.id === selectedNode.id)
    const incoming = dfd.data_flows.filter((f) => f.destination === selectedNode.id)
    const outgoing = dfd.data_flows.filter((f) => f.source === selectedNode.id)
    const related =
      threats?.filter((t) =>
        t.affected_components.some(
          (c) => c === selectedNode.id || c.toLowerCase() === (meta?.name || '').toLowerCase()
        )
      ) ?? []

    return (
      <div className="rounded-md border bg-card p-3 text-sm space-y-2 min-w-[200px] max-w-[320px] font-sans">
        <div className="font-semibold">{selectedNode.data.label}</div>
        <div className="text-xs text-muted-foreground font-mono">{selectedNode.id}</div>
        {meta?.description && (
          <div>
            <div className="text-muted-foreground text-xs">Description</div>
            <div>{meta.description}</div>
          </div>
        )}
        <div>
          <div className="text-muted-foreground text-xs">Incoming flows ({incoming.length})</div>
          <ul className="list-disc pl-4 text-xs max-h-24 overflow-auto">
            {incoming.map((f) => (
              <li key={f.id}>{f.description}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Outgoing flows ({outgoing.length})</div>
          <ul className="list-disc pl-4 text-xs max-h-24 overflow-auto">
            {outgoing.map((f) => (
              <li key={f.id}>{f.description}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Related threats ({related.length})</div>
          <ul className="space-y-1 max-h-32 overflow-auto">
            {related.map((t) => (
              <li key={t.id} className="text-xs">
                <span className="font-medium">{t.id}</span>: {t.title}{' '}
                <span className="text-orange-700">({t.severity})</span>
              </li>
            ))}
          </ul>
        </div>
        {onOpenThreatsForComponent && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full mt-1"
            onClick={() => onOpenThreatsForComponent(selectedNode.id)}
          >
            View in Threat Model tab
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground min-w-[200px] font-sans">
      Select a node or edge to inspect details.
    </div>
  )
}
