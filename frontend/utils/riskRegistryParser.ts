/**
 * Risk Registry Parser Utilities
 * 
 * Parses Risk Registry markdown content and extracts structured risk data
 * for export to CSV/Excel format.
 * 
 * Author: Sam Li
 */

export interface ParsedRisk {
  [key: string]: string;
}

/**
 * Normalize risk ID to consistent format RISK-XXX (3 digits, zero-padded)
 */
export function normalizeRiskId(riskId: string): string {
  // Extract number from RISK-XXX format
  const match = riskId.match(/RISK-(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    // Format as RISK-XXX with 3 digits, zero-padded
    return `RISK-${num.toString().padStart(3, '0')}`;
  }
  return riskId;
}

/**
 * Parse Risk Registry markdown content and extract structured risk data
 * 
 * Handles both full risk entries (#### RISK-XXX: Title) and abbreviated entries (**RISK-XXX**: Title)
 * 
 * @param content - The Risk Registry markdown content
 * @returns Array of parsed risk objects with normalized Risk IDs
 */
export function parseRiskRegistry(content: string): Array<ParsedRisk> {
  const risks: Array<ParsedRisk> = [];
  const lines = content.split('\n');
  
  let currentRisk: ParsedRisk | null = null;
  let currentField = '';
  let currentValue: string[] = [];
  let isAbbreviatedRisk = false;
  let abbreviatedRemediation: string[] = [];
  let currentSectionSeverity: string | null = null; // Track severity from section headers
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect range header: #### RISK-XXX through RISK-YYY: Additional [Severity] Risks
    // Examples: "#### RISK-012 through RISK-021: Additional Medium Risks"
    //          "#### RISK-022 through RISK-030: Low Priority Risks"
    const rangeHeaderMatch = line.match(/^####\s+RISK-(\d+)\s+through\s+RISK-(\d+):\s*(.+)$/i);
    if (rangeHeaderMatch) {
      // Extract severity from title
      // Matches: "Additional Medium Risks", "Low Priority Risks", "Critical Risks", "High Risks"
      const title = rangeHeaderMatch[3];
      const severityMatch = title.match(/(Critical|High|Medium|Low)(?:\s+Priority)?\s+Risks?/i);
      if (severityMatch) {
        currentSectionSeverity = severityMatch[1].charAt(0).toUpperCase() + severityMatch[1].slice(1).toLowerCase();
      }
      // Don't create a risk from this line, just set the section severity
      continue;
    }
    
    // Detect full risk header: #### RISK-XXX: Title (case-insensitive)
    const riskHeaderMatch = line.match(/^####\s+(RISK-\d+):\s*(.+)$/i);
    if (riskHeaderMatch) {
      // Save previous risk if exists
      if (currentRisk) {
        if (currentField && currentValue.length > 0) {
          currentRisk[currentField] = currentValue.join(' ').trim();
        }
        // Add abbreviated remediation if we were processing one
        if (isAbbreviatedRisk && abbreviatedRemediation.length > 0) {
          currentRisk['Remediation Plan'] = abbreviatedRemediation.join('\n').trim();
        }
        risks.push(currentRisk);
      }
      
      // Normalize risk ID to RISK-XXX format (3 digits, zero-padded)
      const normalizedRiskId = normalizeRiskId(riskHeaderMatch[1]);
      
      // Start new risk (full format)
      currentRisk = {
        'Risk ID': normalizedRiskId,
        'Title': riskHeaderMatch[2],
      };
      currentField = '';
      currentValue = [];
      isAbbreviatedRisk = false;
      abbreviatedRemediation = [];
      continue;
    }
    
    // Detect abbreviated risk header: **RISK-XXX**: Title (STRIDE)
    const abbreviatedRiskMatch = line.match(/^\*\*(RISK-\d+)\*\*:\s*(.+)$/i);
    if (abbreviatedRiskMatch) {
      // Save previous risk if exists
      if (currentRisk) {
        if (currentField && currentValue.length > 0) {
          currentRisk[currentField] = currentValue.join(' ').trim();
        }
        // Add abbreviated remediation if we were processing one
        if (isAbbreviatedRisk && abbreviatedRemediation.length > 0) {
          currentRisk['Remediation Plan'] = abbreviatedRemediation.join('\n').trim();
        }
        risks.push(currentRisk);
      }
      
      // Normalize risk ID
      const normalizedRiskId = normalizeRiskId(abbreviatedRiskMatch[1]);
      
      // Extract title and STRIDE category
      const titleWithStride = abbreviatedRiskMatch[2];
      const strideMatch = titleWithStride.match(/^(.+?)\s*\(([STRIED]-\d+)\)\s*$/);
      const title = strideMatch ? strideMatch[1].trim() : titleWithStride;
      const stride = strideMatch ? strideMatch[2] : '';
      
      // Start new risk (abbreviated format)
      currentRisk = {
        'Risk ID': normalizedRiskId,
        'Title': title,
      };
      if (stride) {
        currentRisk['STRIDE'] = stride;
      }
      // Apply section severity if available
      if (currentSectionSeverity) {
        currentRisk['Severity'] = currentSectionSeverity;
      }
      currentField = '';
      currentValue = [];
      isAbbreviatedRisk = true;
      abbreviatedRemediation = [];
      continue;
    }
    
    // Skip if no current risk
    if (!currentRisk) continue;
    
    // For abbreviated risks, collect bullet points as remediation
    if (isAbbreviatedRisk) {
      // Check for cost line: "Cost: $X - $Y"
      const costMatch = line.match(/^Cost:\s*(.+)$/i);
      if (costMatch) {
        currentRisk['Cost Estimate'] = costMatch[1].trim();
        continue;
      }
      
      // Collect bullet points as remediation plan
      if (line.startsWith('-') || line.startsWith('*')) {
        const bulletContent = line.replace(/^[-*]\s*/, '').trim();
        if (bulletContent && !bulletContent.match(/^Cost:/i)) {
          abbreviatedRemediation.push(bulletContent);
        }
        continue;
      }
      
      // Stop collecting if we hit a section break or another risk
      if (line === '---' || line.startsWith('###') || line.startsWith('####') || line.match(/^\*\*RISK-/i)) {
        // Save this abbreviated risk
        if (abbreviatedRemediation.length > 0) {
          currentRisk['Remediation Plan'] = abbreviatedRemediation.join('\n').trim();
        }
        risks.push(currentRisk);
        currentRisk = null;
        isAbbreviatedRisk = false;
        abbreviatedRemediation = [];
        // Reset section severity when we hit a new section
        if (line.startsWith('###') || line.startsWith('####')) {
          currentSectionSeverity = null;
        }
        // Continue to process the new section/risk
        i--; // Re-process this line
        continue;
      }
      
      // Skip empty lines for abbreviated risks
      if (line === '') {
        continue;
      }
    }
    
    // For full risks, process normally
    if (!isAbbreviatedRisk) {
      // Detect section headers that might indicate a new risk section (but not a new risk)
      // Skip section headers like "### CRITICAL RISKS" or "---"
      if (line.startsWith('###') && !line.match(/RISK-\d+/i)) {
        continue;
      }
      if (line === '---' || line === '') {
        continue;
      }
      
      // Detect field headers: **Field Name**:
      const fieldMatch = line.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
      if (fieldMatch) {
        // Don't treat risk IDs as field headers
        if (fieldMatch[1].match(/^RISK-\d+$/i)) {
          continue;
        }
        
        // Save previous field
        if (currentField && currentValue.length > 0) {
          currentRisk[currentField] = currentValue.join(' ').trim();
        }
        
        // Start new field
        currentField = fieldMatch[1].trim();
        currentValue = [fieldMatch[2].trim()].filter(v => v);
        continue;
      }
      
      // Detect list items or continuation lines
      if (line.startsWith('-') || line.startsWith('*')) {
        if (currentField) {
          currentValue.push(line.replace(/^[-*]\s*/, ''));
        }
        continue;
      }
      
      // Regular content line (only add if we're in a field context)
      if (line && currentField) {
        currentValue.push(line);
      }
    }
  }
  
  // Save last risk
  if (currentRisk) {
    if (currentField && currentValue.length > 0) {
      currentRisk[currentField] = currentValue.join(' ').trim();
    }
    // Add abbreviated remediation if we were processing one
    if (isAbbreviatedRisk && abbreviatedRemediation.length > 0) {
      currentRisk['Remediation Plan'] = abbreviatedRemediation.join('\n').trim();
    }
    risks.push(currentRisk);
  }
  
  // Ensure each risk has a normalized Risk ID
  risks.forEach(risk => {
    if (risk['Risk ID']) {
      risk['Risk ID'] = normalizeRiskId(risk['Risk ID']);
    }
  });
  
  // Sort risks by Risk ID to ensure consistent ordering
  risks.sort((a, b) => {
    const idA = a['Risk ID'] || '';
    const idB = b['Risk ID'] || '';
    const numA = parseInt(idA.replace(/RISK-/i, '') || '0', 10);
    const numB = parseInt(idB.replace(/RISK-/i, '') || '0', 10);
    return numA - numB;
  });
  
  return risks;
}

