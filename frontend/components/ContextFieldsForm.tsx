'use client';

import { CONTEXT_FIELD_CAPS, type ContextFields } from '@/types/contextFields';

interface FieldConfig {
  key: keyof ContextFields;
  label: string;
  helper: string;
  fromExtractor: boolean;
  privacyNotice?: boolean;
}

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: 'projectSummary',
    label: 'Project summary',
    helper: 'What the project does, tech stack, architecture.',
    fromExtractor: true,
  },
  {
    key: 'securityContext',
    label: 'Security context',
    helper: 'Security defenses and libraries detected (auth, encryption, validation, ORM).',
    fromExtractor: true,
  },
  {
    key: 'deploymentContext',
    label: 'Deployment context',
    helper: 'How the project is deployed (CI/CD, cloud, container, environments).',
    fromExtractor: true,
  },
  {
    key: 'developerContext',
    label: 'Developer / compliance guidance',
    helper: 'Security-relevant rules from CLAUDE.md, .cursor/rules, SECURITY.md.',
    fromExtractor: true,
  },
  {
    key: 'suggestedExclusions',
    label: 'Suggested exclusions',
    helper: 'Non-production paths (tests, docs, vendor) so analysis can scope correctly.',
    fromExtractor: true,
  },
  {
    key: 'additionalContext',
    label: 'Additional notes',
    helper:
      "Anything the analyzer can't infer from code: compliance scope (PCI-DSS / HIPAA / SOC 2), trust boundaries, network topology, in/out-of-scope notes.",
    fromExtractor: false,
    privacyNotice: true,
  },
];

interface ContextFieldsFormProps {
  fields: ContextFields;
  status: 'extracting' | 'ready' | 'failed';
  onChange: (name: keyof ContextFields, value: string) => void;
  disabled?: boolean;
  /** Specific extraction error to surface on the failed banner (falls back to a generic message). */
  error?: string | null;
}

export const ContextFieldsForm = ({
  fields,
  status,
  onChange,
  disabled = false,
  error = null,
}: ContextFieldsFormProps) => {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {status === 'failed' && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          role="alert"
          data-testid="context-extraction-error"
        >
          <span className="font-medium">
            {error ?? "Couldn't auto-generate context."}
          </span>{' '}
          Fill in any combination of fields below, or leave them all blank to run without context.
        </div>
      )}

      {FIELD_CONFIGS.map(({ key, label, helper, fromExtractor, privacyNotice }) => {
        const value = fields[key] ?? '';
        const max = CONTEXT_FIELD_CAPS[key];
        const showSkeleton = status === 'extracting' && fromExtractor;

        return (
          <div key={key}>
            <label htmlFor={`ctx-${key}`} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              {label}
            </label>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
            {privacyNotice && (
              <p className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">
                Do not paste secrets, API keys, or PHI.
              </p>
            )}
            {showSkeleton ? (
              <div
                className="h-20 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800"
                aria-hidden
              />
            ) : (
              <>
                <textarea
                  id={`ctx-${key}`}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  rows={key === 'developerContext' || key === 'additionalContext' ? 4 : 2}
                  maxLength={max}
                  value={value}
                  disabled={disabled}
                  onChange={(e) => onChange(key, e.target.value)}
                />
                <p className="mt-0.5 text-right text-xs text-gray-400">
                  {value.length} / {max}
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
