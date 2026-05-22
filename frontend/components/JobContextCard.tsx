'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ContextFields } from '@/types/contextFields'

const CONTEXT_FIELD_ROWS: ReadonlyArray<readonly [keyof ContextFields, string]> = [
  ['projectSummary', 'Project summary'],
  ['securityContext', 'Security'],
  ['deploymentContext', 'Deployment'],
  ['developerContext', 'Developer guidance'],
  ['suggestedExclusions', 'Exclusions'],
  ['additionalContext', 'Additional notes'],
]

export interface JobContextCardProps {
  contextFields?: ContextFields | null
  context?: string | null
}

export const JobContextCard = ({ contextFields, context }: JobContextCardProps) => {
  const hasFields = contextFields && CONTEXT_FIELD_ROWS.some(([key]) => contextFields[key]?.trim())
  const hasContext = Boolean(context?.trim())

  if (!hasFields && !hasContext) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Context used</CardTitle>
        <CardDescription>Deployment and environment context passed to the threat modeler</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {hasFields ? (
          <>
            {CONTEXT_FIELD_ROWS.map(([key, label]) => {
              const val = contextFields?.[key]
              if (!val?.trim()) return null
              return (
                <details key={key} className="rounded border px-3 py-2">
                  <summary className="cursor-pointer font-medium">{label}</summary>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{val}</p>
                </details>
              )
            })}
          </>
        ) : (
          <p className="whitespace-pre-wrap text-muted-foreground">{context}</p>
        )}
      </CardContent>
    </Card>
  )
}
