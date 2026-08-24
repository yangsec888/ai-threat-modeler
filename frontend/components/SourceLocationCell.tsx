'use client'

import { useState } from 'react'
import type { SourceLocation } from '@/types/threatModel'
import type { ThreatModelingJob } from '@/types/threatModelingJob'
import { buildSourceHref, formatSourceLocation } from '@/utils/sourceLocation'

interface SourceLocationCellProps {
  locations: SourceLocation[] | undefined
  job: ThreatModelingJob
}

export const SourceLocationCell = ({ locations, job }: SourceLocationCellProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (!locations?.length) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-100"
        title="No source location found — verify this finding against the code"
        data-testid="ungrounded-badge"
      >
        ⚠ Ungrounded — verify
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {locations.map((loc, index) => {
        const href = buildSourceHref(job, loc)
        const label = formatSourceLocation(loc)
        const isOpen = openIndex === index
        return (
          <div key={`${loc.file}-${loc.line_numbers ?? ''}-${index}`} className="text-xs">
            <button
              type="button"
              className="text-left font-mono text-blue-700 hover:underline"
              onClick={() => setOpenIndex(isOpen ? null : index)}
            >
              {label}
            </button>
            {isOpen && (
              <div className="mt-1 rounded border bg-muted/40 p-2 space-y-1">
                {loc.symbol && (
                  <div className="text-muted-foreground">
                    Symbol: <span className="font-medium text-foreground">{loc.symbol}</span>
                  </div>
                )}
                {loc.snippet && (
                  <pre className="text-[11px] whitespace-pre-wrap font-mono overflow-x-auto max-h-40">
                    {loc.snippet}
                  </pre>
                )}
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline inline-block"
                  >
                    View on GitHub
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
