/**
 * Regression coverage for contextExtractorRunner.
 *
 * The original implementation passed absolute paths for --extract-context and -o,
 * which appsec-agent rejects with "Invalid output file path: ... Output file path
 * must be relative to the current working directory". These tests pin the CLI
 * argument shape so that regression cannot return.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface SpawnInvocation {
  command: string;
  args: string[];
  options: { cwd?: string; env?: NodeJS.ProcessEnv };
}

type SpawnHandler = (child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }, opts: { cwd?: string }) => void;

jest.mock('child_process', () => {
  const recorded: SpawnInvocation[] = [];
  const handlers: SpawnHandler[] = [];
  return {
    __recorded: recorded,
    __pushHandler: (h: SpawnHandler) => handlers.push(h),
    spawn: jest.fn((command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
      recorded.push({ command, args, options });

      const stdout = new EventEmitter() as EventEmitter & { setEncoding: (enc: string) => void };
      stdout.setEncoding = () => undefined;
      const stderr = new EventEmitter() as EventEmitter & { setEncoding: (enc: string) => void };
      stderr.setEncoding = () => undefined;

      const child = Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        killed: false,
        kill: () => true,
      });

      const next = handlers.shift();
      if (next) {
        Promise.resolve().then(() => next(child, options));
      }
      return child;
    }),
  };
});

jest.mock('../../services/agentRunPath', () => ({
  findAgentRunPath: () => '/fake/path/to/agent-run.js',
}));

jest.mock('../../services/extractionContextBuilder', () => ({
  buildExtractionContext: () => ({
    owner: 'octocat',
    repo: 'hello-world',
    description: null,
    language: null,
    languages: {},
    files: [],
  }),
}));

jest.mock('../../models/threatModelingStaging', () => ({
  ThreatModelingStagingModel: {
    findByIdRaw: jest.fn(() => ({ git_branch: null, git_commit: null })),
    updateStatus: jest.fn(),
    setDraftFields: jest.fn(),
    markFailed: jest.fn(),
  },
}));

import { runContextExtractor } from '../../services/contextExtractorRunner';
import * as childProcess from 'child_process';
import { ThreatModelingStagingModel } from '../../models/threatModelingStaging';

const cpModule = childProcess as unknown as {
  __recorded: SpawnInvocation[];
  __pushHandler: (h: SpawnHandler) => void;
  spawn: jest.Mock;
};

const stagingMock = ThreatModelingStagingModel as unknown as {
  findByIdRaw: jest.Mock;
  updateStatus: jest.Mock;
  setDraftFields: jest.Mock;
  markFailed: jest.Mock;
};

describe('runContextExtractor argument shape', () => {
  beforeEach(() => {
    cpModule.__recorded.length = 0;
    cpModule.spawn.mockClear();
    stagingMock.findByIdRaw.mockReturnValue({ git_branch: null, git_commit: null });
    stagingMock.updateStatus.mockReset();
    stagingMock.setDraftFields.mockReset();
    stagingMock.markFailed.mockReset();
  });

  it('spawns agent-run with cwd=tempDir and bare relative file names (regression: appsec-agent rejects absolute paths)', async () => {
    cpModule.__pushHandler((child, opts) => {
      // Simulate the agent writing the JSON output relative to its cwd, then exiting cleanly.
      const cwd = opts.cwd as string;
      fs.writeFileSync(
        path.join(cwd, 'extraction-output.json'),
        JSON.stringify({ project_summary: 'A web API for testing' }),
      );
      child.emit('close', 0, null);
    });

    await runContextExtractor(
      'staging-1',
      '/tmp/extracted',
      {
        provider: 'claude',
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.test',
        model: null,
        claudeCodeMaxOutputTokens: null,
      },
      'hello-world',
      'octocat',
    );

    expect(cpModule.__recorded).toHaveLength(1);
    const invocation = cpModule.__recorded[0];

    // Spawn cwd must be a per-invocation sandbox under the OS temp dir.
    // (The runner cleans the dir up in its finally block, so we cannot stat
    // it after the call returns — assert on the path string itself.)
    expect(invocation.options.cwd).toBeDefined();
    const cwd = invocation.options.cwd as string;
    expect(cwd.startsWith(os.tmpdir())).toBe(true);
    expect(path.basename(cwd)).toMatch(/^ctx-extract-/);

    // Capture the values passed to --extract-context and -o.
    const args = invocation.args;
    const ctxIdx = args.indexOf('--extract-context');
    const outIdx = args.indexOf('-o');
    expect(ctxIdx).toBeGreaterThan(-1);
    expect(outIdx).toBeGreaterThan(-1);

    const ctxValue = args[ctxIdx + 1];
    const outValue = args[outIdx + 1];

    // CRITICAL: bare relative filenames only — no separators, no abs paths, no traversal.
    expect(ctxValue).toBe('extraction-context.json');
    expect(outValue).toBe('extraction-output.json');
    expect(path.isAbsolute(ctxValue)).toBe(false);
    expect(path.isAbsolute(outValue)).toBe(false);
    expect(ctxValue).not.toContain(path.sep);
    expect(outValue).not.toContain(path.sep);
    expect(ctxValue).not.toContain('..');
    expect(outValue).not.toContain('..');

    // Cost guardrail: the runner must request Haiku, not Opus, for this
    // tool-less single-turn structured-JSON transform.
    const modelIdx = args.indexOf('-m');
    expect(modelIdx).toBeGreaterThan(-1);
    expect(args[modelIdx + 1]).toBe('haiku');

    // Happy path: draft was persisted; no failure recorded.
    expect(stagingMock.setDraftFields).toHaveBeenCalledWith(
      'staging-1',
      expect.objectContaining({ projectSummary: 'A web API for testing' }),
      expect.any(String),
    );
    expect(stagingMock.markFailed).not.toHaveBeenCalled();
  });

  it('writes the input JSON inside the same cwd it passes to the agent', async () => {
    let observedCwd: string | undefined;
    cpModule.__pushHandler((child, opts) => {
      observedCwd = opts.cwd;
      // Verify the input file the runner created is sitting in the cwd.
      const inputPath = path.join(opts.cwd as string, 'extraction-context.json');
      expect(fs.existsSync(inputPath)).toBe(true);
      // Provide an output file so the runner's happy path completes.
      fs.writeFileSync(
        path.join(opts.cwd as string, 'extraction-output.json'),
        JSON.stringify({ project_summary: 'ok' }),
      );
      child.emit('close', 0, null);
    });

    await runContextExtractor(
      'staging-2',
      '/tmp/extracted',
      {
        provider: 'claude',
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.test',
        model: null,
        claudeCodeMaxOutputTokens: null,
      },
      'hello-world',
    );

    expect(observedCwd).toBeDefined();
  });

  it('marks staging failed when extractor produces no output file', async () => {
    cpModule.__pushHandler((child) => {
      child.emit('close', 1, null);
    });

    await runContextExtractor(
      'staging-3',
      '/tmp/extracted',
      {
        provider: 'claude',
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.test',
        model: null,
        claudeCodeMaxOutputTokens: null,
      },
      'hello-world',
    );

    expect(stagingMock.markFailed).toHaveBeenCalledWith(
      'staging-3',
      expect.stringContaining('Context extractor produced no output file'),
    );
    expect(stagingMock.setDraftFields).not.toHaveBeenCalled();
  });
});
