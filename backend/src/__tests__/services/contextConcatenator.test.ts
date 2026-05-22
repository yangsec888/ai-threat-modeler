import { concatContextFields } from '../../services/contextConcatenator';
import { emptyContextFields } from '../../types/contextFields';

describe('contextConcatenator', () => {
  it('returns empty string when all fields empty', () => {
    expect(concatContextFields(emptyContextFields())).toBe('');
  });

  it('joins populated fields in fixed order with labels', () => {
    const result = concatContextFields({
      projectSummary: 'A web app',
      securityContext: null,
      deploymentContext: 'AWS ECS',
      developerContext: null,
      suggestedExclusions: null,
      additionalContext: 'HIPAA scope',
    });
    expect(result).toContain('Project: A web app');
    expect(result).toContain('Deployment: AWS ECS');
    expect(result).toContain('Additional notes: HIPAA scope');
    expect(result.indexOf('Project:')).toBeLessThan(result.indexOf('Deployment:'));
    expect(result.indexOf('Deployment:')).toBeLessThan(result.indexOf('Additional notes:'));
  });

  it('hard-caps at 8000 characters', () => {
    const long = 'x'.repeat(5000);
    const result = concatContextFields({
      projectSummary: long,
      developerContext: long,
      additionalContext: long,
    });
    expect(result.length).toBeLessThanOrEqual(8000);
    expect(result).toContain('[truncated]');
  });
});
