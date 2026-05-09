/**
 * Unit tests for the stuck-job watchdog (`runStuckJobSweep`).
 *
 * Coverage matrix:
 *   1. No stuck jobs                              → no-op, scanned=0
 *   2. Stuck job with valid report on disk        → auto-recovered to 'completed'
 *   3. Stuck job with invalid JSON on disk        → auto-failed
 *   4. Stuck job with no report file              → auto-failed
 *   5. Mixed batch (recovered + failed)           → both outcomes recorded
 *   6. Per-row exception                          → does not abort the sweep
 *   7. DB query failure                           → returns empty result, does not throw
 *
 * Author: Sam Li
 */

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn() },
}));

const mockPrepare = jest.fn();
const mockRun = jest.fn();
const mockAll = jest.fn();
jest.mock('../../db/database', () => {
  return {
    __esModule: true,
    default: {
      prepare: (sql: string) => mockPrepare(sql),
    },
  };
});

const mockUpdateReports = jest.fn();
const mockUpdateStatus = jest.fn();
jest.mock('../../models/threatModelingJob', () => ({
  ThreatModelingJobModel: {
    updateReports: (...args: unknown[]) => mockUpdateReports(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  copyFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

import * as fs from 'fs';
import { runStuckJobSweep } from '../../init/stuckJobWatchdog';

const VALID_REPORT_JSON = JSON.stringify({
  threat_model_report: { metadata: { project_name: 't' }, threats: [] },
});

/** Helper: configure the SELECT prepare() to return the given rows, and the
 *  annotation UPDATE prepare() to no-op. */
function setupDb(rows: Array<{ id: string; updated_at: string }>) {
  mockPrepare.mockReset();
  mockAll.mockReset();
  mockRun.mockReset();
  mockAll.mockReturnValue(rows);

  mockPrepare.mockImplementation((sql: string) => {
    if (/^\s*SELECT/i.test(sql)) {
      return { all: mockAll };
    }
    // The annotation UPDATE statement.
    return { run: mockRun };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (fs.existsSync as jest.Mock).mockReset();
  (fs.readFileSync as jest.Mock).mockReset();
  (fs.copyFileSync as jest.Mock).mockReset();
  (fs.mkdirSync as jest.Mock).mockReset();
});

describe('runStuckJobSweep', () => {
  it('no stuck jobs → no-op summary, no model writes', () => {
    setupDb([]);

    const result = runStuckJobSweep(60);

    expect(result).toEqual({ scanned: 0, recovered: 0, failed: 0, outcomes: [] });
    expect(mockUpdateReports).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it('stuck job with a valid report on disk → recovered (copy + updateReports + annotation)', () => {
    setupDb([{ id: 'job-recover', updated_at: '2026-05-09 13:00:00' }]);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(VALID_REPORT_JSON);

    const result = runStuckJobSweep(60);

    expect(result.scanned).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.outcomes).toEqual([
      { jobId: 'job-recover', action: 'recovered', reason: 'valid report in work_dir' },
    ]);

    // Report directory was created and the file was copied to threat-modeling-reports/.
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('threat-modeling-reports'),
      { recursive: true },
    );
    expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
    const [src, dst] = (fs.copyFileSync as jest.Mock).mock.calls[0] as [string, string];
    expect(src).toContain('work_dir/job-recover/threat_model_report.json');
    expect(dst).toContain('threat-modeling-reports/job-recover/threat_model_report.json');

    // Job was promoted to 'completed' via updateReports (all three report path
    // columns point at the same JSON file, mirroring processThreatModelingJob).
    expect(mockUpdateReports).toHaveBeenCalledTimes(1);
    expect(mockUpdateReports).toHaveBeenCalledWith('job-recover', dst, dst, dst);

    // The recovery annotation was written via the secondary UPDATE.
    expect(mockRun).toHaveBeenCalledTimes(1);
    const annotationArgs = mockRun.mock.calls[0];
    expect(annotationArgs[0]).toMatch(/Watchdog auto-recovery/i);
    expect(annotationArgs[1]).toBe('job-recover');

    // updateStatus was NOT called for recovered rows (updateReports handles it).
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('stuck job with invalid JSON on disk → auto-failed (no copy, no updateReports)', () => {
    setupDb([{ id: 'job-bad-json', updated_at: '2026-05-09 12:00:00' }]);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('not valid json');

    const result = runStuckJobSweep(60);

    expect(result.scanned).toBe(1);
    expect(result.recovered).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.outcomes[0].action).toBe('failed');
    expect(result.outcomes[0].reason).toMatch(/no valid report/i);

    expect(fs.copyFileSync).not.toHaveBeenCalled();
    expect(mockUpdateReports).not.toHaveBeenCalled();
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'job-bad-json',
      'failed',
      null,
      expect.stringMatching(/Watchdog auto-fail/i),
    );
  });

  it('stuck job with JSON missing the threat_model_report root key → auto-failed', () => {
    setupDb([{ id: 'job-wrong-shape', updated_at: '2026-05-09 12:00:00' }]);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ some_other_key: true }));

    const result = runStuckJobSweep(60);

    expect(result.failed).toBe(1);
    expect(result.recovered).toBe(0);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'job-wrong-shape',
      'failed',
      null,
      expect.stringMatching(/Watchdog auto-fail/i),
    );
  });

  it('stuck job with no report file → auto-failed', () => {
    setupDb([{ id: 'job-no-file', updated_at: '2026-05-09 12:00:00' }]);
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const result = runStuckJobSweep(60);

    expect(result.failed).toBe(1);
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'job-no-file',
      'failed',
      null,
      expect.stringMatching(/Watchdog auto-fail/i),
    );
  });

  it('mixed batch: one recovered, one failed → both outcomes recorded', () => {
    setupDb([
      { id: 'job-good', updated_at: '2026-05-09 12:00:00' },
      { id: 'job-bad',  updated_at: '2026-05-09 12:00:00' },
    ]);
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => p.includes('job-good'));
    (fs.readFileSync as jest.Mock).mockReturnValue(VALID_REPORT_JSON);

    const result = runStuckJobSweep(60);

    expect(result.scanned).toBe(2);
    expect(result.recovered).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.outcomes.map((o) => o.action).sort()).toEqual(['failed', 'recovered']);
    expect(mockUpdateReports).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
  });

  it('per-row exception does not abort the sweep', () => {
    setupDb([
      { id: 'job-throw', updated_at: '2026-05-09 12:00:00' },
      { id: 'job-ok',    updated_at: '2026-05-09 12:00:00' },
    ]);
    // First job: copy throws. Second job: no file → auto-fail (must still run).
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => p.includes('job-throw'));
    (fs.readFileSync as jest.Mock).mockReturnValue(VALID_REPORT_JSON);
    (fs.copyFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('disk full');
    });

    const result = runStuckJobSweep(60);

    expect(result.scanned).toBe(2);
    // job-throw threw before incrementing recovered/failed; it leaves no outcome.
    // job-ok's branch ran cleanly to auto-fail.
    expect(result.failed).toBe(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'job-ok',
      'failed',
      null,
      expect.any(String),
    );
  });

  it('DB query failure → returns empty result, does not throw', () => {
    mockPrepare.mockReset();
    mockPrepare.mockImplementation(() => {
      throw new Error('database is locked');
    });

    expect(() => runStuckJobSweep(60)).not.toThrow();
    const result = runStuckJobSweep(60);
    expect(result).toEqual({ scanned: 0, recovered: 0, failed: 0, outcomes: [] });
    expect(mockUpdateReports).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });
});
