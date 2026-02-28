/**
 * @jest-environment jsdom
 * 
 * Tests for CSV export logic with structured JSON risk data.
 */

import type { Risk } from '@/types/threatModel'

describe('ThreatModeling Excel Export Logic', () => {
  const columns: Array<keyof Risk> = [
    'id', 'title', 'category', 'stride_category', 'severity',
    'current_risk_score', 'residual_risk_score', 'description',
    'affected_components', 'business_impact', 'remediation_plan',
    'effort_estimate', 'cost_estimate', 'timeline', 'related_threats'
  ]

  const escapeCSV = (val: unknown): string => {
    const str = Array.isArray(val) ? val.join(', ') : String(val ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  it('should export a single risk to CSV correctly', () => {
    const risks: Risk[] = [{
      id: 'RISK-001',
      title: 'Test Risk',
      category: 'Authentication',
      severity: 'HIGH',
      description: 'Test description',
      remediation_plan: 'Fix the issue',
    }]

    const header = columns.map(c => escapeCSV(c.replace(/_/g, ' ').toUpperCase())).join(',')
    const rows = risks.map(risk =>
      columns.map(col => escapeCSV(risk[col])).join(',')
    )
    const csv = [header, ...rows].join('\n')

    expect(csv).toContain('ID')
    expect(csv).toContain('RISK-001')
    expect(csv).toContain('Test Risk')
    expect(csv).toContain('HIGH')
  })

  it('should escape commas and quotes in CSV fields', () => {
    const risks: Risk[] = [{
      id: 'RISK-001',
      title: 'Risk with, comma',
      category: 'Data "Exposure"',
      severity: 'CRITICAL',
      description: 'Desc',
      remediation_plan: 'Plan',
    }]

    const rows = risks.map(risk =>
      columns.map(col => escapeCSV(risk[col])).join(',')
    )
    const csvRow = rows[0]

    expect(csvRow).toContain('"Risk with, comma"')
    expect(csvRow).toContain('"Data ""Exposure"""')
  })

  it('should handle array fields (affected_components, related_threats)', () => {
    const risks: Risk[] = [{
      id: 'RISK-001',
      title: 'Test',
      category: 'Auth',
      severity: 'MEDIUM',
      description: 'Desc',
      remediation_plan: 'Plan',
      affected_components: ['node-001', 'node-002'],
      related_threats: ['THREAT-001', 'THREAT-003'],
    }]

    const rows = risks.map(risk =>
      columns.map(col => escapeCSV(risk[col])).join(',')
    )
    const csvRow = rows[0]

    expect(csvRow).toContain('"node-001, node-002"')
    expect(csvRow).toContain('"THREAT-001, THREAT-003"')
  })

  it('should add BOM for UTF-8 encoding', () => {
    const csvContent = 'ID,TITLE\nRISK-001,Test Risk'
    const BOM = '\uFEFF'
    const blobContent = BOM + csvContent

    expect(blobContent.charCodeAt(0)).toBe(0xFEFF)
    expect(blobContent).toContain('ID')
  })

  it('should handle multiple risks correctly', () => {
    const risks: Risk[] = [
      { id: 'RISK-001', title: 'First', category: 'Auth', severity: 'HIGH', description: 'D1', remediation_plan: 'P1' },
      { id: 'RISK-002', title: 'Second', category: 'Data', severity: 'MEDIUM', description: 'D2', remediation_plan: 'P2' },
    ]

    const header = columns.map(c => escapeCSV(c.replace(/_/g, ' ').toUpperCase())).join(',')
    const rows = risks.map(risk =>
      columns.map(col => escapeCSV(risk[col])).join(',')
    )
    const allRows = [header, ...rows]

    expect(allRows.length).toBe(3)
    expect(allRows[1]).toContain('RISK-001')
    expect(allRows[2]).toContain('RISK-002')
  })
})
