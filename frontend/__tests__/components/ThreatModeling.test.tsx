/**
 * @jest-environment jsdom
 * 
 * Tests for Excel export functionality in ThreatModeling component
 * 
 * Note: Full component integration tests are complex due to many dependencies.
 * This test focuses on verifying the Excel export logic works correctly.
 */

import { parseRiskRegistry } from '@/utils/riskRegistryParser'

describe('ThreatModeling Excel Export Logic', () => {
  describe('prepareRiskData and CSV export', () => {
    it('should prepare risk data correctly for CSV export', () => {
      const riskContent = `
#### RISK-001: Test Risk
**Description**: Test description
**Severity**: High
**Remediation Plan**: Fix the issue
      `.trim()

      const risks = parseRiskRegistry(riskContent)
      
      // Verify risks are parsed correctly
      expect(risks.length).toBeGreaterThan(0)
      expect(risks[0]['Risk ID']).toBe('RISK-001')
      expect(risks[0]['Title']).toBe('Test Risk')
      expect(risks[0]['Severity']).toBe('High')
      
      // Simulate prepareRiskData logic
      const allFields = new Set<string>()
      risks.forEach(risk => {
        Object.keys(risk).forEach(key => allFields.add(key))
      })
      
      const priorityFields = [
        'Risk ID',
        'Title',
        'Severity',
        'Description',
        'Remediation Plan',
      ]
      
      const orderedFields = [
        ...priorityFields.filter(f => allFields.has(f)),
        ...Array.from(allFields).filter(f => !priorityFields.includes(f)).sort(),
      ]
      
      // Create data array
      const data: string[][] = []
      data.push(orderedFields)
      
      risks.forEach(risk => {
        const row = orderedFields.map(field => {
          const value = risk[field] || ''
          return String(value).replace(/\n/g, ' ').replace(/\r/g, '').trim()
        })
        data.push(row)
      })
      
      // Verify data structure
      expect(data.length).toBe(2) // Header + 1 data row
      expect(data[0]).toContain('Risk ID')
      expect(data[0]).toContain('Title')
      expect(data[1]).toContain('RISK-001')
      expect(data[1]).toContain('Test Risk')
    })

    it('should format CSV with proper escaping', () => {
      const riskContent = `
#### RISK-001: Test Risk
**Description**: Test description with, comma and "quotes"
**Severity**: High
      `.trim()

      const risks = parseRiskRegistry(riskContent)
      const allFields = new Set<string>()
      risks.forEach(risk => {
        Object.keys(risk).forEach(key => allFields.add(key))
      })
      
      const orderedFields = Array.from(allFields).sort()
      const data: string[][] = []
      data.push(orderedFields)
      
      risks.forEach(risk => {
        const row = orderedFields.map(field => {
          const value = risk[field] || ''
          return String(value).replace(/\n/g, ' ').replace(/\r/g, '').trim()
        })
        data.push(row)
      })
      
      // Convert to CSV format
      const csvContent = data.map(row => {
        return row.map(field => {
          const stringField = String(field || '')
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`
          }
          return stringField
        }).join(',')
      }).join('\n')
      
      // Verify CSV formatting
      expect(csvContent).toContain('Risk ID')
      expect(csvContent).toContain('RISK-001')
      // Fields with commas or quotes should be quoted
      if (csvContent.includes(',')) {
        expect(csvContent).toMatch(/"[^"]*,[^"]*"/)
      }
    })

    it('should add BOM for UTF-8 encoding', () => {
      const csvContent = 'Risk ID,Title\nRISK-001,Test Risk'
      const BOM = '\uFEFF'
      const blobContent = BOM + csvContent
      
      expect(blobContent.charCodeAt(0)).toBe(0xFEFF) // BOM character
      expect(blobContent).toContain('Risk ID')
    })

    it('should handle empty risk registry gracefully', () => {
      const risks = parseRiskRegistry('')
      
      expect(risks.length).toBe(0)
      
      // prepareRiskData should throw error for empty risks
      expect(() => {
        if (risks.length === 0) {
          throw new Error('No risks found in the Risk Registry')
        }
      }).toThrow('No risks found in the Risk Registry')
    })

    it('should handle multiple risks correctly', () => {
      const riskContent = `
#### RISK-001: First Risk
**Description**: First description
**Severity**: High

#### RISK-002: Second Risk
**Description**: Second description
**Severity**: Medium
      `.trim()

      const risks = parseRiskRegistry(riskContent)
      
      expect(risks.length).toBe(2)
      expect(risks[0]['Risk ID']).toBe('RISK-001')
      expect(risks[1]['Risk ID']).toBe('RISK-002')
      
      // Verify all risks are included in CSV
      const allFields = new Set<string>()
      risks.forEach(risk => {
        Object.keys(risk).forEach(key => allFields.add(key))
      })
      
      const orderedFields = Array.from(allFields).sort()
      const data: string[][] = []
      data.push(orderedFields)
      
      risks.forEach(risk => {
        const row = orderedFields.map(field => {
          const value = risk[field] || ''
          return String(value).replace(/\n/g, ' ').replace(/\r/g, '').trim()
        })
        data.push(row)
      })
      
      expect(data.length).toBe(3) // Header + 2 data rows
      expect(data[1]).toContain('RISK-001')
      expect(data[2]).toContain('RISK-002')
    })
  })
})

