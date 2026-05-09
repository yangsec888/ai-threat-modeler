/**
 * Tests for parseGitHubUrl
 *
 * Author: Sam Li
 */
import { parseGitHubUrl } from '../../utils/githubUrl';

describe('parseGitHubUrl', () => {
  it.each([
    ['https://github.com/owner/repo', 'owner', 'repo'],
    ['https://github.com/owner/repo.git', 'owner', 'repo'],
    ['https://github.com/Owner/Repo', 'Owner', 'Repo'],
    ['https://github.com/owner/repo/tree/main/src', 'owner', 'repo'],
    ['https://github.com/owner/repo/blob/main/README.md', 'owner', 'repo'],
    ['http://github.com/owner/repo', 'owner', 'repo'],
    ['github.com/owner/repo', 'owner', 'repo'],
    ['git@github.com:owner/repo.git', 'owner', 'repo'],
    ['ssh://git@github.com/owner/repo.git', 'owner', 'repo'],
    ['https://www.github.com/owner/repo', 'owner', 'repo'],
  ])('parses %s as %s/%s', (input, owner, repo) => {
    const parsed = parseGitHubUrl(input);
    expect(parsed).not.toBeNull();
    expect(parsed!.owner).toBe(owner);
    expect(parsed!.repo).toBe(repo);
    expect(parsed!.normalizedUrl).toBe(`https://github.com/${owner}/${repo}`);
  });

  it.each([
    [''],
    ['not a url'],
    ['https://gitlab.com/owner/repo'],
    ['https://github.com/'],
    ['https://github.com/owner'],
    ['https://github.com//repo'],
    ['https://github.com/-bad/repo'],
    ['https://github.com/owner/.'],
    ['https://github.com/owner/..'],
    [`https://github.com/owner/${'r'.repeat(101)}`],
  ])('rejects %s', (input) => {
    expect(parseGitHubUrl(input)).toBeNull();
  });

  it('handles surrounding whitespace', () => {
    expect(parseGitHubUrl('   https://github.com/o/r   ')?.owner).toBe('o');
  });

  it('returns null for non-string', () => {
    // @ts-expect-error testing runtime guard
    expect(parseGitHubUrl(undefined)).toBeNull();
    // @ts-expect-error testing runtime guard
    expect(parseGitHubUrl(null)).toBeNull();
  });
});
