'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FileText,
  Image as ImageIcon,
  Copy,
  PanelLeft,
  PanelRight,
  LayoutGrid,
  Maximize2,
} from 'lucide-react'
import type { LayoutDirection } from '@/utils/dfdLayout'
import type { NodeTypeKey, SeverityVisibility } from '@/utils/dfdVisualFilters'

export type { NodeTypeKey, SeverityVisibility } from '@/utils/dfdVisualFilters'

interface DfdToolbarProps {
  search: string
  onSearchChange: (v: string) => void
  direction: LayoutDirection
  onDirectionChange: (d: LayoutDirection) => void
  typeFilters: Record<NodeTypeKey, boolean>
  onTypeFilterChange: (k: NodeTypeKey, v: boolean) => void
  severityVisible: SeverityVisibility
  onSeverityVisibleChange: (s: keyof SeverityVisibility, v: boolean) => void
  onFitView: () => void
  onExportPdf: () => void
  onExportPng: () => void
  onExportSvg: () => void
  onCopyMermaid: () => void
  exportDisabled: boolean
  showLeftRail: boolean
  onToggleLeftRail: () => void
  showContextPanel: boolean
  onToggleContextPanel: () => void
  layoutLoading: boolean
  onWideView?: () => void
}

export function DfdToolbar({
  search,
  onSearchChange,
  direction,
  onDirectionChange,
  typeFilters,
  onTypeFilterChange,
  severityVisible,
  onSeverityVisibleChange,
  onFitView,
  onExportPdf,
  onExportPng,
  onExportSvg,
  onCopyMermaid,
  exportDisabled,
  showLeftRail,
  onToggleLeftRail,
  showContextPanel,
  onToggleContextPanel,
  layoutLoading,
  onWideView,
}: DfdToolbarProps) {
  return (
    <div className="flex flex-col gap-2 border-b pb-2 mb-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExportPdf}
          disabled={exportDisabled}
          className="gap-1"
          data-testid="dfd-export-pdf"
        >
          <FileText className="h-4 w-4" />
          Export PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExportPng}
          disabled={exportDisabled}
          className="gap-1"
          data-testid="dfd-export-png"
        >
          <ImageIcon className="h-4 w-4" />
          PNG
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExportSvg}
          disabled={exportDisabled}
          data-testid="dfd-export-svg"
        >
          SVG
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCopyMermaid} className="gap-1" data-testid="dfd-copy-mermaid">
          <Copy className="h-4 w-4" />
          Copy Mermaid
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onFitView} data-testid="dfd-fit-view">
          Fit view
        </Button>
        {onWideView && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onWideView}
            className="gap-1"
            title="Hide legend rail, details panel, and data tables so the diagram uses the full width"
            data-testid="dfd-wide-view"
          >
            <Maximize2 className="h-4 w-4" />
            Wide view
          </Button>
        )}
        <div className="flex items-center gap-1 border rounded-md px-1">
          <Button
            type="button"
            variant={direction === 'LR' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onDirectionChange('LR')}
            data-testid="dfd-layout-lr"
          >
            LR
          </Button>
          <Button
            type="button"
            variant={direction === 'TB' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onDirectionChange('TB')}
            data-testid="dfd-layout-tb"
          >
            TB
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onToggleLeftRail} className="gap-1 md:hidden">
          <PanelLeft className="h-4 w-4" />
          {showLeftRail ? 'Hide' : 'Show'} info
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onToggleContextPanel} className="gap-1 md:hidden">
          <PanelRight className="h-4 w-4" />
          {showContextPanel ? 'Hide' : 'Show'} details
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onToggleLeftRail} className="gap-1 hidden md:inline-flex" title="Show or hide legend, description, and trust boundaries">
          <LayoutGrid className="h-4 w-4" />
          Rail
        </Button>
        <Button
          type="button"
          variant={showContextPanel ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleContextPanel}
          className="gap-1 hidden md:inline-flex"
          title="Show or hide the right-hand details panel"
          data-testid="dfd-toggle-details-desktop"
        >
          <PanelRight className="h-4 w-4" />
          Details
        </Button>
        {layoutLoading && <span className="text-xs text-muted-foreground">Layout…</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search nodes & flows…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-xs"
          data-testid="dfd-search"
        />
        <span className="text-xs text-muted-foreground">Types:</span>
        {(['external_entity', 'process', 'data_store'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={typeFilters[k]}
              onChange={(e) => onTypeFilterChange(k, e.target.checked)}
              data-testid={`dfd-type-${k}`}
            />
            {k.replace('_', ' ')}
          </label>
        ))}
        <span className="text-xs text-muted-foreground ml-2">Show max severity:</span>
        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((s) => (
          <label key={s} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={severityVisible[s]}
              onChange={(e) => onSeverityVisibleChange(s, e.target.checked)}
              data-testid={`dfd-severity-${s}`}
            />
            {s}
          </label>
        ))}
      </div>
    </div>
  )
}
