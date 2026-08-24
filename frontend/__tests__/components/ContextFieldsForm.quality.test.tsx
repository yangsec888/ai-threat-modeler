/**
 * @jest-environment jsdom
 *
 * Tests for the context-quality signal: a thin/none context should warn the
 * user before they run a scan on weak input.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ContextFieldsForm } from '@/components/ContextFieldsForm'
import { emptyContextFields } from '@/types/contextFields'
import type { ContextFields } from '@/types/contextFields'

describe('<ContextFieldsForm /> - context quality warning', () => {
  const noop = () => {}

  const LONG = 'a reasonably long value that is meaningfully populated for context'

  it('warns when context is empty (none)', () => {
    render(
      <ContextFieldsForm fields={emptyContextFields()} status="ready" onChange={noop} />,
    )
    expect(screen.getByTestId('context-quality-warning')).toHaveTextContent(
      /Context looks thin/i,
    )
  })

  it('warns when only one field is populated (thin)', () => {
    const fields: ContextFields = { projectSummary: LONG }
    render(<ContextFieldsForm fields={fields} status="ready" onChange={noop} />)
    expect(screen.getByTestId('context-quality-warning')).toBeInTheDocument()
  })

  it('does not warn when context is rich', () => {
    const fields: ContextFields = {
      projectSummary: LONG,
      securityContext: LONG,
      deploymentContext: LONG,
      additionalContext: LONG,
    }
    render(<ContextFieldsForm fields={fields} status="ready" onChange={noop} />)
    expect(screen.queryByTestId('context-quality-warning')).not.toBeInTheDocument()
  })

  it('does not warn while extraction is in progress', () => {
    render(
      <ContextFieldsForm
        fields={emptyContextFields()}
        status="extracting"
        onChange={noop}
      />,
    )
    expect(screen.queryByTestId('context-quality-warning')).not.toBeInTheDocument()
  })
})
