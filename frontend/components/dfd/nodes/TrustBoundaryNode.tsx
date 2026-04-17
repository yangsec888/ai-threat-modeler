'use client'

import { memo } from 'react'
import { type Node, type NodeProps } from '@xyflow/react'
import type { DfdNodeData } from '@/utils/dfdToReactFlow'

function TrustBoundaryNodeInner(props: NodeProps<Node<DfdNodeData>>) {
  const { data } = props

  return (
    <div
      className="h-full w-full rounded-lg border-2 border-dashed border-amber-500 bg-amber-50/40 pointer-events-none"
      data-testid={`dfd-boundary-${props.id}`}
    >
      <div className="pointer-events-auto absolute -top-3 left-3 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 border border-amber-300 font-sans">
        {data.label}
      </div>
    </div>
  )
}

export const TrustBoundaryNode = memo(TrustBoundaryNodeInner)
