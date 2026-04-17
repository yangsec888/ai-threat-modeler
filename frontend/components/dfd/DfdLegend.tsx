'use client'

export function DfdLegend() {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2 font-sans">
      <div className="font-semibold text-foreground">Legend</div>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-8 rounded border-2 border-slate-400 bg-white" />
          <span>External entity</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-8 rounded-full border-2 border-slate-400 bg-white" />
          <span>Process</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-8 rounded border-2 border-slate-500 bg-slate-50" />
          <span>Data store</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-12 border-2 border-dashed border-amber-500 bg-amber-50/50 rounded" />
          <span>Trust boundary</span>
        </div>
      </div>
      <div className="border-t pt-2 mt-2 space-y-1">
        <div className="font-medium text-foreground">Edge classification</div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 bg-red-700" /> PII / sensitive
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 bg-violet-600" /> Confidential
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 bg-amber-600" /> Internal
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 bg-green-700" /> Public
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 bg-slate-500" /> Other
        </div>
      </div>
      <div className="border-t pt-2 space-y-1">
        <div className="font-medium text-foreground">Node severity (max threat)</div>
        <div>Border highlight = highest severity affecting that component.</div>
      </div>
    </div>
  )
}
