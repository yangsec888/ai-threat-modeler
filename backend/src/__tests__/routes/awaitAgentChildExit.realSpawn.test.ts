/**
 * Real-spawn coverage for `awaitAgentChildExit`.
 *
 * Why this test exists
 * --------------------
 * Every other test in this repo mocks `child_process.spawn` at the module
 * boundary, which means our test suite has zero coverage of Node's actual
 * stdio inheritance, pipe-close, and SIGCHLD semantics. The v1.6.3 size-cap
 * hang and the v1.6.4 'close'-event hang both lived precisely there — they
 * could not have been caught by any of the EventEmitter-driven tests because
 * those tests verify our model of Node's behavior, not Node's behavior.
 *
 * This file spawns *real* processes via `process.execPath` and asserts that
 * `awaitAgentChildExit` settles correctly under two scenarios:
 *
 *   1. Adversarial: immediate child exits, but a detached grandchild keeps
 *      the inherited stdout/stderr pipes alive past the parent's exit.
 *      This is the exact production failure mode (the Claude Code helper
 *      that appsec-agent forks). With pre-v1.6.4 code (`child.on('close')`
 *      only) this would hang indefinitely. With the fix it must resolve via
 *      the grace timer with `forced: true` within the grace window.
 *
 *   2. Happy path: a real child that exits cleanly with no surviving
 *      descendants. Confirms the helper still returns `forced: false` in the
 *      common case.
 *
 * These tests are slightly slower than EventEmitter-mocked tests (~1–2 s
 * total) and are mildly platform-sensitive (POSIX pipe / detach semantics).
 * That trade is worth it for a single high-value path; we do not generalize
 * the pattern to other modules.
 *
 * Author: Sam Li
 */

// Avoid winston transports during unit tests.
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
}));

// Same heavy-peer no-op mocks as awaitAgentChildExit.test.ts so importing
// `routes/threatModeling` doesn't pull in express/multer/archiver/etc.
jest.mock('express', () => {
  const mockRouter: any = () => ({
    get: jest.fn().mockReturnThis(),
    post: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    put: jest.fn().mockReturnThis(),
    use: jest.fn().mockReturnThis(),
  });
  return { Router: mockRouter, default: mockRouter };
});
jest.mock('multer', () => () => ({ single: () => (_req: any, _res: any, next: any) => next() }));
jest.mock('archiver', () => () => ({}));
jest.mock('yauzl', () => ({ open: jest.fn() }));
jest.mock('better-sqlite3', () => jest.fn(() => ({ prepare: () => ({ run: jest.fn(), get: jest.fn(), all: () => [] }), exec: jest.fn(), pragma: jest.fn() })));
jest.mock('../../db/database', () => ({ __esModule: true, default: { prepare: () => ({ run: jest.fn(), get: jest.fn(), all: () => [] }), exec: jest.fn(), pragma: jest.fn() } }));
jest.mock('../../models/threatModelingJob', () => ({ ThreatModelingJobModel: {} }));
jest.mock('../../models/settings', () => ({ SettingsModel: {} }));
jest.mock('../../middleware/auth', () => ({ authenticateToken: jest.fn() }));
jest.mock('../../middleware/permissions', () => ({ requireJobScheduling: jest.fn(), requireAdmin: jest.fn() }));

import { spawn } from 'child_process';
import { awaitAgentChildExit } from '../../routes/threatModeling';

/**
 * Spawn a real Node process running `script`, with stdio shape matching the
 * production agent-run spawn (`['ignore', 'pipe', 'pipe']`).
 */
function spawnRealNode(script: string) {
  return spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('awaitAgentChildExit — real child_process.spawn coverage', () => {
  it('happy path: real child exits cleanly → resolves with forced=false in <500ms', async () => {
    // Smallest possible "agent": print one line and exit 0.
    const child = spawnRealNode(`process.stdout.write('Cost: $0.00\\n'); process.exit(0);`);
    const start = Date.now();
    const result = await awaitAgentChildExit(child, 'real-happy', { graceMs: 5_000 });
    const elapsed = Date.now() - start;

    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.forced).toBe(false);
    expect(elapsed).toBeLessThan(500);
  }, 10_000);

  it('adversarial: immediate child exits but a detached grandchild keeps stdio open → resolves via grace timer with forced=true (no hang)', async () => {
    // This script reproduces the production failure mode:
    //   - Forks a grandchild that inherits stdout/stderr.
    //   - Detaches it (setsid + unref) so it survives the parent's exit.
    //   - The grandchild lingers for 1500ms holding the pipes open.
    //   - The parent exits 50ms after spawning the grandchild.
    //
    // With the pre-v1.6.4 code (await child.on('close')), the parent's
    // 'close' event would not fire until the grandchild exits 1500ms later
    // — and in true production the grandchild may linger indefinitely. The
    // fix must resolve via the post-exit grace timer well before the
    // grandchild releases the pipes, returning forced=true.
    const script = `
      const { spawn } = require('child_process');
      const grand = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500);'], {
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: true,
      });
      grand.unref();
      setTimeout(() => process.exit(0), 50);
    `;
    const child = spawnRealNode(script);

    // Use a generous-but-bounded grace so this test stays fast and
    // platform-resilient. The KEY assertion is "did not wait for the
    // 1500ms grandchild" — i.e. elapsed < 1400ms.
    const graceMs = 400;
    const start = Date.now();
    const result = await awaitAgentChildExit(child, 'real-adversarial', { graceMs });
    const elapsed = Date.now() - start;

    expect(result.exitCode).toBe(0);
    expect(result.forced).toBe(true);
    // We resolved via the post-exit grace, not via 'close' (which would
    // have waited ≥1500ms for the grandchild to release the pipes).
    expect(elapsed).toBeLessThan(1_400);
    // And we did wait at least the grace window after the immediate
    // child's exit (50ms script + ~graceMs wait).
    expect(elapsed).toBeGreaterThanOrEqual(graceMs);
  }, 10_000);
});
