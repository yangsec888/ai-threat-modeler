'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Scale } from 'lucide-react'
import type { ThreatModelingJob } from '@/types/threatModelingJob'
import type { ThreatModel, ThreatModelComparison } from '@/types/threatModel'
import { api } from '@/lib/api'

interface CompareBaselineProps {
  job: ThreatModelingJob
  onToastSuccess: (message: string) => void
  onToastError: (message: string) => void
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export const CompareBaseline = ({ job, onToastSuccess, onToastError }: CompareBaselineProps) => {
  const [baselineText, setBaselineText] = useState('')
  const [result, setResult] = useState<ThreatModelComparison | null>(null)
  const [parsingError, setParsingError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCompare = async () => {
    setParsingError(null)
    if (!baselineText.trim()) {
      onToastError('Paste a baseline threat model JSON first')
      return
    }

    let baseline: ThreatModel
    try {
      baseline = JSON.parse(baselineText) as ThreatModel
      if (!Array.isArray(baseline?.threats)) {
        throw new Error('baseline must be a threat model with a "threats" array')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON'
      setParsingError(msg)
      onToastError(`Could not parse baseline: ${msg}`)
      return
    }

    setLoading(true)
    try {
      const comparison = await api.compareThreatModel(job.id, baseline)
      setResult(comparison)
      onToastSuccess('Comparison complete')
    } catch (err: unknown) {
      onToastError(
        err instanceof Error ? `Comparison failed: ${err.message}` : 'Comparison failed',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Scale className="h-4 w-4" />
        Compare this generated model against a hand-built / vendor baseline to see whether the scan
        "did a good job". Paste a threat model JSON (with a <span className="font-mono">threats</span>{' '}
        array) below.
      </div>
      <Textarea
        data-testid="baseline-json-input"
        className="min-h-[160px] font-mono text-xs"
        placeholder='{"threats": [{"title": "SQL Injection", "stride_category": "Tampering", "affected_components": ["api-server"]}]}'
        value={baselineText}
        onChange={(e) => setBaselineText(e.target.value)}
      />
      {parsingError && (
        <p role="alert" data-testid="baseline-parse-error" className="text-sm text-red-600">
          {parsingError}
        </p>
      )}
      <Button type="button" onClick={() => void handleCompare()} disabled={loading}>
        {loading ? 'Comparing…' : 'Compare against baseline'}
      </Button>

      {result && (
        <div data-testid="comparison-result" className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryCard label="Matched" value={result.matched.length} />
            <SummaryCard label="Missed" value={result.missed.length} />
            <SummaryCard label="Extra" value={result.extra.length} />
            <SummaryCard label="Recall" value={pct(result.recall)} sub={pct(result.precision)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <FindingList
              title="Matched"
              testId="matched-list"
              items={result.matched.map((m) => m.generated)}
              empty="No matched findings."
            />
            <FindingList
              title="Missed (in baseline only)"
              testId="missed-list"
              items={result.missed}
              empty="Nothing missed — great coverage."
            />
            <FindingList
              title="Extra (found only by us)"
              testId="extra-list"
              items={result.extra}
              empty="No extra findings."
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">
        {label}
        {sub ? ` (precision ${sub})` : ''}
      </div>
    </div>
  )
}

function FindingList({
  title,
  testId,
  items,
  empty,
}: {
  title: string
  testId: string
  items: Array<{ title?: string; id?: string; category?: string }>
  empty: string
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <h4 className="mb-2 text-sm font-medium">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul data-testid={testId} className="space-y-1">
          {items.map((item, idx) => (
            <li key={`${item.id ?? item.title ?? idx}-${idx}`} className="text-xs">
              <span className="font-medium">{item.title ?? item.id}</span>
              {item.category && (
                <span className="ml-1 text-muted-foreground">({item.category})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
