/**
 * Context field types and validation for threat modeling staging.
 */

import type { ContextFields } from '../db/database';

export type { ContextFields };

export const CONTEXT_FIELD_CAPS = {
  projectSummary: 500,
  securityContext: 500,
  deploymentContext: 500,
  suggestedExclusions: 500,
  developerContext: 2000,
  additionalContext: 2000,
} as const;

export const CONTEXT_FIELD_KEYS = [
  'projectSummary',
  'securityContext',
  'deploymentContext',
  'developerContext',
  'suggestedExclusions',
  'additionalContext',
] as const;

export type ContextFieldKey = (typeof CONTEXT_FIELD_KEYS)[number];

const EXTRACTOR_DRAFT_KEYS = [
  'projectSummary',
  'securityContext',
  'deploymentContext',
  'developerContext',
  'suggestedExclusions',
] as const;

export function emptyContextFields(): ContextFields {
  return {
    projectSummary: null,
    securityContext: null,
    deploymentContext: null,
    developerContext: null,
    suggestedExclusions: null,
    additionalContext: null,
  };
}

export function parseContextFieldsJson(json: string | null | undefined): ContextFields | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeContextFields(parsed as Record<string, unknown>, { strict: false });
  } catch {
    return null;
  }
}

export function serializeContextFields(fields: ContextFields | null | undefined): string | null {
  if (!fields) return null;
  return JSON.stringify(fields);
}

/** Rename snake_case extractor output to camelCase draft fields. */
export function mapExtractorResultToDraft(raw: Record<string, unknown>): ContextFields {
  const truncate = (value: unknown, cap: number): string | null => {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;
    if (s.length <= cap) return s;
    return s.slice(0, cap - 1) + '…';
  };

  return {
    projectSummary: truncate(raw.project_summary, CONTEXT_FIELD_CAPS.projectSummary),
    securityContext: truncate(raw.security_context, CONTEXT_FIELD_CAPS.securityContext),
    deploymentContext: truncate(raw.deployment_context, CONTEXT_FIELD_CAPS.deploymentContext),
    developerContext: truncate(raw.developer_context, CONTEXT_FIELD_CAPS.developerContext),
    suggestedExclusions: truncate(raw.suggested_exclusions, CONTEXT_FIELD_CAPS.suggestedExclusions),
    additionalContext: null,
  };
}

export function normalizeContextFields(
  input: Record<string, unknown>,
  options: { strict?: boolean } = {},
): ContextFields {
  const strict = options.strict ?? true;
  const keys = Object.keys(input);
  for (const key of keys) {
    if (!CONTEXT_FIELD_KEYS.includes(key as ContextFieldKey)) {
      if (strict) {
        throw new Error(`Unknown context field: ${key}`);
      }
    }
  }

  const read = (key: ContextFieldKey): string | null => {
    const v = input[key];
    if (v == null) return null;
    if (typeof v !== 'string') {
      if (strict) throw new Error(`${key} must be a string`);
      return null;
    }
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const result: ContextFields = {
    projectSummary: read('projectSummary'),
    securityContext: read('securityContext'),
    deploymentContext: read('deploymentContext'),
    developerContext: read('developerContext'),
    suggestedExclusions: read('suggestedExclusions'),
    additionalContext: read('additionalContext'),
  };

  for (const key of CONTEXT_FIELD_KEYS) {
    const val = result[key];
    if (val && val.length > CONTEXT_FIELD_CAPS[key]) {
      if (strict) {
        throw new Error(`${key} exceeds maximum length of ${CONTEXT_FIELD_CAPS[key]}`);
      }
      result[key] = val.slice(0, CONTEXT_FIELD_CAPS[key]);
    }
  }

  return result;
}

export function listPopulatedContextFieldNames(fields: ContextFields): string[] {
  return CONTEXT_FIELD_KEYS.filter((k) => {
    const v = fields[k];
    return v != null && v.trim().length > 0;
  });
}

export function draftFieldsFromStagingRow(
  draftJson: string | null,
): ContextFields | null {
  return parseContextFieldsJson(draftJson);
}

export { EXTRACTOR_DRAFT_KEYS };
