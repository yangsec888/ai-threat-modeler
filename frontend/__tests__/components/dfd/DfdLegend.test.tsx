import { render, screen } from '@testing-library/react'
import { DfdLegend } from '@/components/dfd/DfdLegend'

describe('DfdLegend', () => {
  it('renders shape, classification, and severity legend rows', () => {
    render(<DfdLegend />)
    expect(screen.getByText('External entity')).toBeInTheDocument()
    expect(screen.getByText('Process')).toBeInTheDocument()
    expect(screen.getByText('Data store')).toBeInTheDocument()
    expect(screen.getByText('Trust boundary')).toBeInTheDocument()
    expect(screen.getByText('Edge classification')).toBeInTheDocument()
    expect(screen.getByText(/PII \/ sensitive/)).toBeInTheDocument()
    expect(screen.getByText('Node severity (max threat)')).toBeInTheDocument()
  })
})
