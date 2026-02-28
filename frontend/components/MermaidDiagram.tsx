'use client'

import { useEffect, useRef, useState } from 'react'

interface MermaidDiagramProps {
  chart: string
  className?: string
}

export default function MermaidDiagram({ chart, className = '' }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svgContent, setSvgContent] = useState<string>('')

  useEffect(() => {
    if (!chart) return

    let cancelled = false

    async function renderDiagram() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          flowchart: { curve: 'basis', htmlLabels: true },
        })

        const id = `mermaid-${Date.now()}`
        const { svg } = await mermaid.render(id, chart)
        if (!cancelled) {
          setSvgContent(svg)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
        }
      }
    }

    renderDiagram()
    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return (
      <div className="bg-destructive/10 text-destructive p-4 rounded-md">
        <p className="text-sm font-medium">Failed to render diagram</p>
        <pre className="text-xs mt-2 whitespace-pre-wrap">{error}</pre>
      </div>
    )
  }

  if (!svgContent) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <p>Rendering diagram...</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto bg-white rounded-md p-4 ${className}`}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}
