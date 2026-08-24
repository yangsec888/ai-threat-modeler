import {
  buildSourceHref,
  formatSourceLocation,
  formatSourceLocations,
  resolveRiskSourceLocations,
} from '@/utils/sourceLocation'
import type { ThreatModelingJob } from '@/types/threatModelingJob'
import type { Threat } from '@/types/threatModel'

/** Minimal threat-with-locations shape the util reads (id + source_locations). */
function threatWithLocations(
  id: string,
  source_locations: Array<{ file: string; line_numbers?: string }>,
): Threat {
  return {
    id,
    title: id,
    stride_category: 'Tampering',
    severity: 'MEDIUM',
    affected_components: [],
    description: '',
    impact: '',
    likelihood: 'MEDIUM',
    mitigation: '',
    source_locations,
  }
}


const githubJob: ThreatModelingJob = {
  id: 'job-1',
  repoPath: 'repo',
  query: null,
  status: 'completed',
  errorMessage: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  completedAt: '2026-01-01',
  sourceType: 'github',
  sourceUrl: 'https://github.com/octocat/Hello-World@main',
  gitRef: 'main',
  gitCommit: 'abc123def',
  gitBranch: 'main',
}

describe('sourceLocation utils', () => {
  it('buildSourceHref strips @ref from sourceUrl and uses commit ref', () => {
    const href = buildSourceHref(githubJob, { file: 'src/api.py', line_numbers: '42' })
    expect(href).toBe('https://github.com/octocat/Hello-World/blob/abc123def/src/api.py#L42')
  })

  it('buildSourceHref supports line ranges', () => {
    const href = buildSourceHref(githubJob, { file: 'src/api.py', line_numbers: '10-15' })
    expect(href).toBe('https://github.com/octocat/Hello-World/blob/abc123def/src/api.py#L10-L15')
  })

  it('buildSourceHref returns null for non-GitHub jobs', () => {
    expect(
      buildSourceHref(
        { ...githubJob, sourceType: 'upload', sourceUrl: null },
        { file: 'a.ts' },
      ),
    ).toBeNull()
  })

  it('resolveRiskSourceLocations merges from related threats', () => {
    const resolved = resolveRiskSourceLocations(
      { related_threats: ['T-001'] },
      [threatWithLocations('T-001', [{ file: 'src/db.py', line_numbers: '7' }])],
    )
    expect(formatSourceLocations(resolved)).toBe('src/db.py:7')
  })

  it('formatSourceLocation formats file-only and file:line', () => {
    expect(formatSourceLocation({ file: 'x.ts' })).toBe('x.ts')
    expect(formatSourceLocation({ file: 'x.ts', line_numbers: '3' })).toBe('x.ts:3')
  })
})
