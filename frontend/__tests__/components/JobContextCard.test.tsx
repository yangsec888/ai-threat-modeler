/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { JobContextCard } from '@/components/JobContextCard'
import type { ContextFields } from '@/types/contextFields'

describe('<JobContextCard />', () => {
  it('renders only populated contextFields in canonical order', () => {
    const contextFields: ContextFields = {
      projectSummary: 'Project A',
      securityContext: null,
      deploymentContext: 'AWS',
      developerContext: null,
      suggestedExclusions: null,
      additionalContext: 'Notes',
    }
    render(<JobContextCard contextFields={contextFields} />)

    expect(screen.getByText('Project summary')).toBeInTheDocument()
    expect(screen.getByText('Deployment')).toBeInTheDocument()
    expect(screen.getByText('Additional notes')).toBeInTheDocument()
    expect(screen.queryByText('Security')).not.toBeInTheDocument()
  })

  it('skips whitespace-only fields', () => {
    const contextFields: ContextFields = {
      projectSummary: '   ',
      securityContext: 'Real',
      deploymentContext: null,
      developerContext: null,
      suggestedExclusions: null,
      additionalContext: null,
    }
    render(<JobContextCard contextFields={contextFields} />)

    expect(screen.queryByText('Project summary')).not.toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
  })

  it('falls back to free-form context when contextFields is absent', () => {
    render(<JobContextCard context="Legacy context blob" />)
    expect(screen.getByText('Legacy context blob')).toBeInTheDocument()
  })

  it('renders nothing when both contextFields and context are absent', () => {
    const { container } = render(<JobContextCard />)
    expect(container.firstChild).toBeNull()
  })
})
