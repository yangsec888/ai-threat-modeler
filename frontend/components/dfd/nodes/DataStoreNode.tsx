'use client'

import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DfdNodeData } from '@/utils/dfdToReactFlow'
import { borderClassForMaxSeverity } from '@/utils/dfdDecorations'
import type { ThreatSeverity } from '@/utils/dfdDecorations'

function DataStoreNodeInner(props: NodeProps<Node<DfdNodeData>>) {
  const { data, selected } = props
  const stats = data.threatStats
  const maxSev = (stats?.maxSeverity as ThreatSeverity | null) ?? null
  const border = borderClassForMaxSeverity(maxSev)

  return (
    <div
      className={`relative rounded-md border-2 border-slate-400 bg-slate-50 px-3 py-2 shadow-sm min-w-[140px] max-w-[200px] font-sans text-sm ${border} ${selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''} ${data.dimmed ? 'opacity-25' : ''}`}
      tabIndex={0}
      data-testid={`dfd-node-${props.id}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />
      <div className="font-semibold text-slate-900 leading-tight">{data.label}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5">Data store</div>
      {stats && stats.count > 0 && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[10px] rounded bg-orange-100 text-orange-800 px-1.5 py-0.5 font-medium">
            {stats.count} {stats.maxSeverity}
          </span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
    </div>
  )
}

export const DataStoreNode = memo(DataStoreNodeInner)
