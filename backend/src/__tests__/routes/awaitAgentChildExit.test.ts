/**
 * Unit tests for `awaitAgentChildExit`.
 *
 * Why this test exists
 * --------------------
 * In v1.6.3 a real GitHub-imported job (941dd823-…) sat in 'processing' for
 * >25 minutes despite the agent finishing and writing a complete, valid
 * threat_model_report.json. Diagnosis: the parent awaited
 * `child.on('close', …)`. Node's 'close' event waits for ALL stdio FDs to
 * drain. When the agent forked a grandchild (the Claude Code helper) that
 * inherited stdout/stderr and exited in a way that didn't release the pipes
 * promptly, 'close' never fired and the parent's promise hung forever.
 *
 * v1.6.4 introduces `awaitAgentChildExit` which uses 'exit' as the truth
 * source plus a stdio-drain grace window. These tests cover all four paths:
 *   1. Happy path: 'exit' then 'close' fire normally.
 *   2. Hang path:   'exit' fires, 'close' never fires — must resolve via
 *                   the post-exit grace timer with `forced: true`.
 *   3. Error path:  'error' fires before exit/close — must reject.
 *   4. Signal path: 'exit' with code=null — must reject with a signal msg.
 *
 * Author: Sam Li
 */

// Avoid the 'logger' module pulling in winston/transports during unit tests.
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

// We don't actually want to import the whole route file (which pulls in
// express, multer, archiver, yauzl, the DB layer, etc.) just to test one
// helper. Mock those heavy peers as no-ops so the import is cheap.
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

import { EventEmitter } from 'events';
import { awaitAgentChildExit } from '../../routes/threatModeling';
import type { ChildProcess } from 'child_process';

/** Build a minimal ChildProcess-shaped fake we can drive from tests. */
function makeFakeChild(): {
  child: ChildProcess;
  emitter: EventEmitter;
  stdoutDestroyed: () => boolean;
  stderrDestroyed: () => boolean;
} {
  const emitter = new EventEmitter();
  let stdoutDestroyed = false;
  let stderrDestroyed = false;
  const child: any = emitter;
  child.stdout = {
    setEncoding: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(() => { stdoutDestroyed = true; }),
  };
  child.stderr = {
    setEncoding: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(() => { stderrDestroyed = true; }),
  };
  return {
    child: child as ChildProcess,
    emitter,
    stdoutDestroyed: () => stdoutDestroyed,
    stderrDestroyed: () => stderrDestroyed,
  };
}

describe('awaitAgentChildExit', () => {
  it("happy path: 'exit' then 'close' resolves with the exit code (forced=false)", async () => {
    const { child, emitter } = makeFakeChild();
    const promise = awaitAgentChildExit(child, 'job-happy', { graceMs: 50 });

    // Same-tick: simulate normal Node behavior — exit fires, then close fires.
    setImmediate(() => {
      emitter.emit('exit', 0, null);
      emitter.emit('close', 0, null);
    });

    const result = await promise;
    expect(result).toEqual({ exitCode: 0, signal: null, forced: false });
  });

  it("hang path: 'exit' fires but 'close' never fires — resolves via grace timer with forced=true", async () => {
    const { child, emitter, stdoutDestroyed, stderrDestroyed } = makeFakeChild();
    // Use a short grace so the test stays fast. Production uses 10s.
    const graceMs = 100;
    const start = Date.now();
    const promise = awaitAgentChildExit(child, 'job-hang', { graceMs });

    // Only 'exit' fires; 'close' is intentionally never emitted, exactly
    // mirroring the production hang we observed.
    setImmediate(() => emitter.emit('exit', 0, null));

    const result = await promise;
    const elapsed = Date.now() - start;

    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.forced).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(graceMs);
    // Sanity: streams were forcibly destroyed to unblock libuv.
    expect(stdoutDestroyed()).toBe(true);
    expect(stderrDestroyed()).toBe(true);
  });

  it("hang path with non-zero exit code: still resolves (callers decide based on reports), forced=true", async () => {
    const { child, emitter } = makeFakeChild();
    const promise = awaitAgentChildExit(child, 'job-hang-nonzero', { graceMs: 50 });
    setImmediate(() => emitter.emit('exit', 137, null));

    const result = await promise;
    expect(result).toEqual({ exitCode: 137, signal: null, forced: true });
  });

  it("error path: 'error' before exit rejects with a clear message", async () => {
    const { child, emitter } = makeFakeChild();
    const promise = awaitAgentChildExit(child, 'job-error', { graceMs: 50 });
    setImmediate(() => emitter.emit('error', new Error('ENOENT: agent-run not found')));

    await expect(promise).rejects.toThrow(/Failed to execute agent-run.*ENOENT/);
  });

  it("signal path: 'exit' with code=null after grace rejects with a signal message", async () => {
    const { child, emitter } = makeFakeChild();
    const promise = awaitAgentChildExit(child, 'job-signal', { graceMs: 30 });
    setImmediate(() => emitter.emit('exit', null, 'SIGKILL'));

    await expect(promise).rejects.toThrow(/terminated by signal: SIGKILL/);
  });

  it("close-then-exit ordering: still resolves exactly once with the close-event code", async () => {
    const { child, emitter } = makeFakeChild();
    const promise = awaitAgentChildExit(child, 'job-close-first', { graceMs: 50 });
    // In rare cases Node emits 'close' before 'exit' (e.g. when stdio drains
    // first). Our settlement guard must still resolve exactly once.
    setImmediate(() => {
      emitter.emit('close', 0, null);
      emitter.emit('exit', 0, null);
    });

    const result = await promise;
    expect(result).toEqual({ exitCode: 0, signal: null, forced: false });
  });
});
