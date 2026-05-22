/**
 * Concatenate six context fields into a single string for agent-run -c.
 */

import type { ContextFields } from '../types/contextFields';

const FINAL_CAP = 8000;

const SECTIONS: Array<{ key: keyof ContextFields; label: string }> = [
  { key: 'projectSummary', label: 'Project' },
  { key: 'securityContext', label: 'Security' },
  { key: 'deploymentContext', label: 'Deployment' },
  { key: 'developerContext', label: 'Developer guidance' },
  { key: 'suggestedExclusions', label: 'Exclusions' },
  { key: 'additionalContext', label: 'Additional notes' },
];

export function concatContextFields(fields: ContextFields): string {
  const parts: string[] = [];

  for (const { key, label } of SECTIONS) {
    const value = fields[key];
    if (value == null) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    parts.push(`${label}: ${trimmed}`);
  }

  if (parts.length === 0) {
    return '';
  }

  let result = parts.join('\n\n');
  if (result.length > FINAL_CAP) {
    result = result.slice(0, FINAL_CAP - 12) + '\n[truncated]';
  }
  return result;
}
