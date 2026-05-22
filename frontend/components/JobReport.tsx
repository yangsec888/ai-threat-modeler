'use client'

import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { DfdTabContent } from '@/components/dfd/DfdTabContent'
import type { DfdCanvasHandle } from '@/components/dfd/DfdCanvas'
import type { ThreatModelingJob } from '@/types/threatModelingJob'
import type { Risk, Threat } from '@/types/threatModel'

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-green-100 text-green-800',
}

const STRIDE_COLORS: Record<string, string> = {
  Spoofing: 'bg-purple-100 text-purple-800',
  Tampering: 'bg-rose-100 text-rose-800',
  Repudiation: 'bg-amber-100 text-amber-800',
  'Information Disclosure': 'bg-cyan-100 text-cyan-800',
  'Denial of Service': 'bg-red-100 text-red-800',
  'Elevation of Privilege': 'bg-indigo-100 text-indigo-800',
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[severity] || 'bg-gray-100 text-gray-800'}`}
    >
      {severity}
    </span>
  )
}

function StrideBadge({ category }: { category: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${STRIDE_COLORS[category] || 'bg-gray-100 text-gray-800'}`}
    >
      {category}
    </span>
  )
}

export interface JobReportProps {
  job: ThreatModelingJob
  onToastSuccess: (message: string) => void
  onToastError: (message: string) => void
}

export const JobReport = ({ job, onToastSuccess, onToastError }: JobReportProps) => {
  const [reportTab, setReportTab] = useState('data_flow_diagram')
  const [threatHighlightNodeId, setThreatHighlightNodeId] = useState<string | null>(null)
  const dfdCanvasRef = useRef<DfdCanvasHandle | null>(null)

  const filteredThreats = useMemo(() => {
    const threats = job.threatModel?.threats
    if (!threats) return []
    if (!threatHighlightNodeId || !job.dataFlowDiagram) return threats
    const node = job.dataFlowDiagram.nodes.find((n) => n.id === threatHighlightNodeId)
    return threats.filter((th: Threat) =>
      th.affected_components.some(
        (c) =>
          c === threatHighlightNodeId ||
          (node && c.trim().toLowerCase() === node.name.trim().toLowerCase()),
      ),
    )
  }, [job, threatHighlightNodeId])

  const handleExcelExport = () => {
    const risks = job.riskRegistry?.risks
    if (!risks?.length) {
      onToastError('No risks found in the Risk Registry')
      return
    }

    try {
      const columns: Array<keyof Risk> = [
        'id',
        'title',
        'category',
        'stride_category',
        'severity',
        'current_risk_score',
        'residual_risk_score',
        'description',
        'affected_components',
        'business_impact',
        'remediation_plan',
        'effort_estimate',
        'cost_estimate',
        'timeline',
        'related_threats',
      ]

      const escapeCSV = (val: unknown): string => {
        const str = Array.isArray(val) ? val.join(', ') : String(val ?? '')
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const header = columns.map((c) => escapeCSV(c.replace(/_/g, ' ').toUpperCase())).join(',')
      const rows = risks.map((risk) => columns.map((col) => escapeCSV(risk[col])).join(','))

      const BOM = '\uFEFF'
      const csvContent = BOM + [header, ...rows].join('\n')
      const fileName = `Risk Registry - ${job.repoPath} - ${job.id.substring(0, 8)}.csv`

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', fileName)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      onToastSuccess('Risk Registry exported to Excel successfully!')
    } catch (err: unknown) {
      onToastError(
        err instanceof Error ? `Failed to export: ${err.message}` : 'Failed to export Risk Registry',
      )
    }
  }

  const handlePdfExport = async (section: 'dfd' | 'threats') => {
    try {
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF({ orientation: 'landscape' })
      const projectName = job.metadata?.project_name || job.repoPath
      const scanDate = job.metadata?.scan_date || ''
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()

      doc.setFontSize(16)
      doc.text(`Threat Model Report - ${projectName}`, 14, 15)
      doc.setFontSize(10)
      doc.text(`Generated: ${scanDate}`, 14, 22)

      if (section === 'dfd' && job.dataFlowDiagram) {
        const dfd = job.dataFlowDiagram
        doc.setFontSize(12)
        doc.text('Data Flow Diagram', 14, 32)
        doc.setFontSize(9)
        const descLines = doc.splitTextToSize(dfd.description || '', 270)
        doc.text(descLines, 14, 39)

        let startY = 39 + descLines.length * 4 + 6

        const exportEl = dfdCanvasRef.current?.getExportElement()
        if (exportEl && reportTab === 'data_flow_diagram') {
          try {
            const { toSvg } = await import('html-to-image')
            const { svg2pdf } = (await import('svg2pdf.js')) as typeof import('svg2pdf.js')
            const svgString = await toSvg(exportEl, {
              cacheBust: true,
              backgroundColor: '#f8fafc',
            })
            const wrap = document.createElement('div')
            wrap.innerHTML = svgString
            const svgEl = wrap.querySelector('svg')
            if (svgEl) {
              const diagramW = pageW - 28
              const diagramH = Math.min(pageH * 0.45, 160)
              await svg2pdf(svgEl, doc, {
                x: 14,
                y: startY,
                width: diagramW,
                height: diagramH,
              })
              startY += diagramH + 10
            }
          } catch (svgErr) {
            console.warn('DFD diagram SVG embed failed:', svgErr)
          }
        }

        autoTable(doc, {
          startY,
          head: [['ID', 'Name', 'Type', 'Description']],
          body: dfd.nodes.map((n) => [n.id, n.name, n.type, n.description || '']),
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 8 },
        })

        autoTable(doc, {
          startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
          head: [['ID', 'Source', 'Destination', 'Description', 'Protocol', 'Classification']],
          body: dfd.data_flows.map((f) => [
            f.id,
            f.source,
            f.destination,
            f.description,
            f.protocol || '',
            f.data_classification || '',
          ]),
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 8 },
        })
      } else if (section === 'threats' && job.threatModel) {
        const tm = job.threatModel
        doc.setFontSize(12)
        doc.text('STRIDE Threat Analysis', 14, 32)
        doc.setFontSize(9)
        const summaryLines = doc.splitTextToSize(tm.executive_summary || '', 270)
        doc.text(summaryLines, 14, 39)

        const startY = 39 + summaryLines.length * 4 + 6

        autoTable(doc, {
          startY,
          head: [['ID', 'Title', 'STRIDE', 'Severity', 'Likelihood', 'Impact', 'Mitigation']],
          body: tm.threats.map((t) => [
            t.id,
            t.title,
            t.stride_category,
            t.severity,
            t.likelihood,
            t.impact,
            t.mitigation,
          ]),
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 7, cellWidth: 'wrap' },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 35 },
            2: { cellWidth: 30 },
            3: { cellWidth: 18 },
            4: { cellWidth: 18 },
          },
        })
      }

      const fileName =
        section === 'dfd'
          ? `DFD - ${projectName} - ${job.id.substring(0, 8)}.pdf`
          : `Threat Model - ${projectName} - ${job.id.substring(0, 8)}.pdf`
      doc.save(fileName)
      onToastSuccess('PDF exported successfully!')
    } catch (err: unknown) {
      onToastError(
        err instanceof Error ? `Failed to export PDF: ${err.message}` : 'Failed to export PDF',
      )
    }
  }

  return (
    <Tabs
      value={reportTab}
      onValueChange={(v) => {
        setReportTab(v)
        if (v !== 'threat_model') setThreatHighlightNodeId(null)
      }}
      className="w-full"
    >
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="data_flow_diagram">Data Flow Diagram</TabsTrigger>
        <TabsTrigger value="threat_model">
          Threat Model{' '}
          {job.metadata?.total_threats_identified != null &&
            `(${job.metadata.total_threats_identified})`}
        </TabsTrigger>
        <TabsTrigger value="risk_registry">
          Risk Registry{' '}
          {job.metadata?.total_risks_identified != null &&
            `(${job.metadata.total_risks_identified})`}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="data_flow_diagram" className="space-y-4 mt-4">
        {job.dataFlowDiagram ? (
          <DfdTabContent
            job={{ ...job, dataFlowDiagram: job.dataFlowDiagram }}
            dfdTabActive={reportTab === 'data_flow_diagram'}
            canvasRef={dfdCanvasRef}
            onRequestDfdPdf={() => void handlePdfExport('dfd')}
            onOpenThreatsForComponent={(id) => {
              setThreatHighlightNodeId(id)
              setReportTab('threat_model')
            }}
            onToastSuccess={onToastSuccess}
            onToastError={onToastError}
          />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>Data Flow Diagram not available.</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="threat_model" className="space-y-4 mt-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void handlePdfExport('threats')}
            disabled={!job.threatModel}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
        {job.threatModel ? (
          <>
            {threatHighlightNodeId && (
              <div className="rounded-md border border-blue-200 bg-blue-50/80 px-3 py-2 text-sm text-blue-900 flex items-center justify-between gap-2">
                <span>
                  Showing threats for component{' '}
                  <span className="font-mono">{threatHighlightNodeId}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setThreatHighlightNodeId(null)}
                >
                  Clear filter
                </Button>
              </div>
            )}
            {job.threatModel.executive_summary && (
              <div className="bg-muted/50 p-4 rounded-md">
                <h4 className="text-sm font-medium mb-2">Executive Summary</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {job.threatModel.executive_summary}
                </p>
              </div>
            )}
            <div className="overflow-auto max-h-[calc(100vh-280px)] rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">ID</th>
                    <th className="text-left p-2 font-medium">Title</th>
                    <th className="text-left p-2 font-medium">STRIDE</th>
                    <th className="text-left p-2 font-medium">Severity</th>
                    <th className="text-left p-2 font-medium">Likelihood</th>
                    <th className="text-left p-2 font-medium">Impact</th>
                    <th className="text-left p-2 font-medium">Mitigation</th>
                    <th className="text-left p-2 font-medium">References</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredThreats.map((threat) => (
                    <tr key={threat.id} className="border-t align-top">
                      <td className="p-2 font-mono text-xs whitespace-nowrap">{threat.id}</td>
                      <td className="p-2 font-medium">{threat.title}</td>
                      <td className="p-2">
                        <StrideBadge category={threat.stride_category} />
                      </td>
                      <td className="p-2">
                        <SeverityBadge severity={threat.severity} />
                      </td>
                      <td className="p-2">
                        <SeverityBadge severity={threat.likelihood} />
                      </td>
                      <td className="p-2 max-w-[200px]">
                        <span className="line-clamp-3">{threat.impact}</span>
                      </td>
                      <td className="p-2 max-w-[250px]">
                        <span className="line-clamp-3">{threat.mitigation}</span>
                      </td>
                      <td className="p-2">
                        {threat.references?.map((ref, i) => (
                          <span
                            key={i}
                            className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs mr-1 mb-1"
                          >
                            {ref}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>Threat Model not available.</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="risk_registry" className="space-y-4 mt-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExcelExport}
            disabled={!job.riskRegistry?.risks?.length}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export to Excel
          </Button>
        </div>
        {job.riskRegistry ? (
          <>
            {job.riskRegistry.summary && (
              <div className="bg-muted/50 p-4 rounded-md">
                <h4 className="text-sm font-medium mb-2">Summary</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {job.riskRegistry.summary}
                </p>
              </div>
            )}
            <div className="overflow-auto max-h-[calc(100vh-280px)] rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">ID</th>
                    <th className="text-left p-2 font-medium">Title</th>
                    <th className="text-left p-2 font-medium">Category</th>
                    <th className="text-left p-2 font-medium">Severity</th>
                    <th className="text-left p-2 font-medium">Description</th>
                    <th className="text-left p-2 font-medium">Remediation Plan</th>
                    <th className="text-left p-2 font-medium">Effort</th>
                    <th className="text-left p-2 font-medium">Timeline</th>
                    <th className="text-left p-2 font-medium">Related Threats</th>
                  </tr>
                </thead>
                <tbody>
                  {job.riskRegistry.risks.map((risk) => (
                    <tr key={risk.id} className="border-t align-top">
                      <td className="p-2 font-mono text-xs whitespace-nowrap">{risk.id}</td>
                      <td className="p-2 font-medium">{risk.title}</td>
                      <td className="p-2">{risk.category}</td>
                      <td className="p-2">
                        <SeverityBadge severity={risk.severity} />
                      </td>
                      <td className="p-2 max-w-[200px]">
                        <span className="line-clamp-3">{risk.description}</span>
                      </td>
                      <td className="p-2 max-w-[250px]">
                        <span className="line-clamp-3">{risk.remediation_plan}</span>
                      </td>
                      <td className="p-2 whitespace-nowrap">{risk.effort_estimate || '—'}</td>
                      <td className="p-2 whitespace-nowrap">{risk.timeline || '—'}</td>
                      <td className="p-2">
                        {risk.related_threats?.map((tid, i) => (
                          <span
                            key={i}
                            className="inline-block px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-xs mr-1 mb-1"
                          >
                            {tid}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>Risk Registry not available.</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
