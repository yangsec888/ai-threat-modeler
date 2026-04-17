import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DfdToolbar } from '@/components/dfd/DfdToolbar'
import type { LayoutDirection } from '@/utils/dfdLayout'

const baseProps = {
  search: '',
  onSearchChange: jest.fn(),
  direction: 'LR' as LayoutDirection,
  onDirectionChange: jest.fn(),
  typeFilters: { external_entity: true, process: true, data_store: true },
  onTypeFilterChange: jest.fn(),
  severityVisible: { CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true },
  onSeverityVisibleChange: jest.fn(),
  onFitView: jest.fn(),
  onExportPdf: jest.fn(),
  onExportPng: jest.fn(),
  onExportSvg: jest.fn(),
  onCopyMermaid: jest.fn(),
  exportDisabled: false,
  showLeftRail: true,
  onToggleLeftRail: jest.fn(),
  showContextPanel: true,
  onToggleContextPanel: jest.fn(),
  layoutLoading: false,
}

describe('DfdToolbar', () => {
  it('fires search handler', async () => {
    const user = userEvent.setup()
    const onSearchChange = jest.fn()
    render(<DfdToolbar {...baseProps} onSearchChange={onSearchChange} />)
    await user.type(screen.getByTestId('dfd-search'), 'api')
    expect(onSearchChange).toHaveBeenCalled()
  })

  it('layout toggle calls onDirectionChange', async () => {
    const user = userEvent.setup()
    const onDirectionChange = jest.fn()
    render(<DfdToolbar {...baseProps} onDirectionChange={onDirectionChange} />)
    await user.click(screen.getByTestId('dfd-layout-tb'))
    expect(onDirectionChange).toHaveBeenCalledWith('TB')
  })

  it('disables export buttons when exportDisabled', () => {
    render(<DfdToolbar {...baseProps} exportDisabled />)
    expect(screen.getByTestId('dfd-export-pdf')).toBeDisabled()
    expect(screen.getByTestId('dfd-export-png')).toBeDisabled()
    expect(screen.getByTestId('dfd-export-svg')).toBeDisabled()
  })

  it('Wide view button calls onWideView when provided', async () => {
    const user = userEvent.setup()
    const onWideView = jest.fn()
    render(<DfdToolbar {...baseProps} onWideView={onWideView} />)
    await user.click(screen.getByTestId('dfd-wide-view'))
    expect(onWideView).toHaveBeenCalledTimes(1)
  })

  it('does not render Wide view when onWideView is omitted', () => {
    render(<DfdToolbar {...baseProps} />)
    expect(screen.queryByTestId('dfd-wide-view')).not.toBeInTheDocument()
  })

  it('desktop Details toggle calls onToggleContextPanel', async () => {
    const user = userEvent.setup()
    const onToggleContextPanel = jest.fn()
    render(<DfdToolbar {...baseProps} onToggleContextPanel={onToggleContextPanel} />)
    await user.click(screen.getByTestId('dfd-toggle-details-desktop'))
    expect(onToggleContextPanel).toHaveBeenCalled()
  })
})
