import { parseRiskRegistry, normalizeRiskId } from '@/utils/riskRegistryParser'

describe('riskRegistryParser', () => {
  describe('normalizeRiskId', () => {
    it('should normalize risk ID to 3-digit format', () => {
      expect(normalizeRiskId('RISK-1')).toBe('RISK-001')
      expect(normalizeRiskId('RISK-12')).toBe('RISK-012')
      expect(normalizeRiskId('RISK-123')).toBe('RISK-123')
      expect(normalizeRiskId('RISK-5')).toBe('RISK-005')
    })

    it('should handle case-insensitive risk IDs', () => {
      expect(normalizeRiskId('risk-1')).toBe('RISK-001')
      expect(normalizeRiskId('Risk-12')).toBe('RISK-012')
    })

    it('should return original string if not a valid risk ID format', () => {
      expect(normalizeRiskId('INVALID')).toBe('INVALID')
      expect(normalizeRiskId('RISK-ABC')).toBe('RISK-ABC')
    })
  })

  describe('parseRiskRegistry', () => {
    it('should parse full risk entries', () => {
      const content = `
#### RISK-001: Test Risk Title

**Description**: This is a test risk description.
**Severity**: High
**Remediation Plan**: Fix the issue
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(1)
      expect(risks[0]['Risk ID']).toBe('RISK-001')
      expect(risks[0]['Title']).toBe('Test Risk Title')
      expect(risks[0]['Description']).toBe('This is a test risk description.')
      expect(risks[0]['Severity']).toBe('High')
      expect(risks[0]['Remediation Plan']).toBe('Fix the issue')
    })

    it('should parse abbreviated risk entries', () => {
      const content = `
**RISK-002**: Test Abbreviated Risk (S-1)
Cost: $1000 - $5000
- Fix step 1
- Fix step 2
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(1)
      expect(risks[0]['Risk ID']).toBe('RISK-002')
      expect(risks[0]['Title']).toBe('Test Abbreviated Risk')
      expect(risks[0]['STRIDE']).toBe('S-1')
      expect(risks[0]['Cost Estimate']).toBe('$1000 - $5000')
      expect(risks[0]['Remediation Plan']).toContain('Fix step 1')
      expect(risks[0]['Remediation Plan']).toContain('Fix step 2')
    })

    it('should parse range headers and apply severity to abbreviated risks', () => {
      const content = `
#### RISK-012 through RISK-021: Additional Medium Risks

**RISK-012**: Test Risk 1 (S-1)
- Fix step 1

**RISK-013**: Test Risk 2 (T-2)
- Fix step 2
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(2)
      expect(risks[0]['Risk ID']).toBe('RISK-012')
      expect(risks[0]['Severity']).toBe('Medium')
      expect(risks[1]['Risk ID']).toBe('RISK-013')
      expect(risks[1]['Severity']).toBe('Medium')
    })

    it('should parse "Low Priority Risks" range header', () => {
      const content = `
#### RISK-022 through RISK-030: Low Priority Risks

**RISK-022**: Test Low Risk (S-1)
- Fix step
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(1)
      expect(risks[0]['Risk ID']).toBe('RISK-022')
      expect(risks[0]['Severity']).toBe('Low')
    })

    it('should parse multiple risks and sort by Risk ID', () => {
      const content = `
#### RISK-003: Third Risk
**Description**: Description 3

#### RISK-001: First Risk
**Description**: Description 1

#### RISK-002: Second Risk
**Description**: Description 2
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(3)
      expect(risks[0]['Risk ID']).toBe('RISK-001')
      expect(risks[1]['Risk ID']).toBe('RISK-002')
      expect(risks[2]['Risk ID']).toBe('RISK-003')
    })

    it('should handle risks with list items in fields', () => {
      const content = `
#### RISK-001: Test Risk
**Description**: Main description
- List item 1
- List item 2
**Remediation Plan**: 
- Fix 1
- Fix 2
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(1)
      expect(risks[0]['Description']).toContain('Main description')
      expect(risks[0]['Description']).toContain('List item 1')
      expect(risks[0]['Description']).toContain('List item 2')
      expect(risks[0]['Remediation Plan']).toContain('Fix 1')
      expect(risks[0]['Remediation Plan']).toContain('Fix 2')
    })

    it('should handle empty content', () => {
      const risks = parseRiskRegistry('')
      expect(risks).toHaveLength(0)
    })

    it('should handle content with no risks', () => {
      const content = `
# Risk Registry

This is just a header with no risks.
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(0)
    })

    it('should normalize all risk IDs in output', () => {
      const content = `
#### RISK-1: Test Risk 1
**Description**: Description 1

**RISK-2**: Test Risk 2 (S-1)
- Fix step
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(2)
      expect(risks[0]['Risk ID']).toBe('RISK-001')
      expect(risks[1]['Risk ID']).toBe('RISK-002')
    })

    it('should handle risks with STRIDE categories', () => {
      const content = `
**RISK-001**: Authentication Bypass (S-1)
Cost: $5000 - $10000
- Implement MFA
- Add rate limiting
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(1)
      expect(risks[0]['Risk ID']).toBe('RISK-001')
      expect(risks[0]['Title']).toBe('Authentication Bypass')
      expect(risks[0]['STRIDE']).toBe('S-1')
    })

    it('should handle section breaks correctly', () => {
      const content = `
#### RISK-001: First Risk
**Description**: Description 1

---

#### RISK-002: Second Risk
**Description**: Description 2
      `.trim()

      const risks = parseRiskRegistry(content)
      expect(risks).toHaveLength(2)
      expect(risks[0]['Risk ID']).toBe('RISK-001')
      expect(risks[1]['Risk ID']).toBe('RISK-002')
    })
  })
})

