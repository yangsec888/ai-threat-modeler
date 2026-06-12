/**
 * @jest-environment jsdom
 *
 * Tests that the failed-extraction banner surfaces the specific, actionable
 * reason (e.g. archive-too-large) instead of swallowing it behind a generic
 * message.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ContextFieldsForm } from '@/components/ContextFieldsForm'
import { emptyContextFields } from '@/types/contextFields'

describe('<ContextFieldsForm /> - failure banner', () => {
  const noop = () => {}

  it('shows the specific extraction error plus manual-fallback guidance', () => {
    const message =
      'Repository archive exceeds the configured size cap (50 MB). Raise the cap in Settings → GitHub → Max archive size (MB) and re-import.'
    render(
      <ContextFieldsForm
        fields={emptyContextFields()}
        status="failed"
        error={message}
        onChange={noop}
      />,
    )

    const banner = screen.getByTestId('context-extraction-error')
    expect(banner).toHaveTextContent(message)
    expect(banner).toHaveTextContent(/Fill in any combination of fields below/i)
  })

  it('falls back to a generic message when no specific error is provided', () => {
    render(
      <ContextFieldsForm fields={emptyContextFields()} status="failed" onChange={noop} />,
    )

    expect(screen.getByTestId('context-extraction-error')).toHaveTextContent(
      /Couldn't auto-generate context/i,
    )
  })

  it('does not render the failure banner when extraction succeeds', () => {
    render(
      <ContextFieldsForm fields={emptyContextFields()} status="ready" onChange={noop} />,
    )

    expect(screen.queryByTestId('context-extraction-error')).not.toBeInTheDocument()
  })
})
