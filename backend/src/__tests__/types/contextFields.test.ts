import { mapExtractorResultToDraft, normalizeContextFields } from '../../types/contextFields';

describe('contextFields', () => {
  it('maps snake_case extractor output to camelCase draft', () => {
    const draft = mapExtractorResultToDraft({
      project_summary: 'Summary',
      security_context: 'Auth',
      deployment_context: 'K8s',
      developer_context: 'No SQLi',
      suggested_exclusions: 'tests/**',
    });
    expect(draft.projectSummary).toBe('Summary');
    expect(draft.securityContext).toBe('Auth');
    expect(draft.additionalContext).toBeNull();
  });

  it('rejects unknown keys in strict mode', () => {
    expect(() =>
      normalizeContextFields({ projectSummary: 'ok', extra: 'nope' }, { strict: true }),
    ).toThrow(/Unknown context field/);
  });
});
