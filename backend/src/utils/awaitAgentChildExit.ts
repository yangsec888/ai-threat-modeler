/**
 * Wait for an agent-run child process to exit (robust against close-never-fires hang).
 */

import { ChildProcess } from 'child_process';
import logger from './logger';

export interface AgentChildExitResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  forced: boolean;
}

export function awaitAgentChildExit(
  childProcess: ChildProcess,
  jobId: string,
  options: { graceMs?: number } = {},
): Promise<AgentChildExitResult> {
  const graceMs = options.graceMs ?? 10_000;
  return new Promise<AgentChildExitResult>((resolve, reject) => {
    let settled = false;
    let exitObserved = false;
    let observedExitCode: number | null = null;
    let observedSignal: NodeJS.Signals | null = null;
    let postExitTimer: NodeJS.Timeout | null = null;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (postExitTimer) {
        clearTimeout(postExitTimer);
        postExitTimer = null;
      }
      action();
    };

    childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      exitObserved = true;
      observedExitCode = code;
      observedSignal = signal;
      logger.info(`🏁 agent-run exited (event=exit) code=${code ?? 'null'} signal=${signal ?? 'none'}`);

      postExitTimer = setTimeout(() => {
        if (settled) return;
        logger.warn(
          `⏱️  'close' did not fire ${graceMs}ms after 'exit'; forcing stdio shutdown to unblock job ${jobId}`,
        );
        try {
          childProcess.stdout?.destroy();
        } catch {
          /* ignore */
        }
        try {
          childProcess.stderr?.destroy();
        } catch {
          /* ignore */
        }
        if (code === null) {
          finish(() =>
            reject(new Error(`agent-run process terminated by signal: ${signal || 'unknown'}`)),
          );
        } else {
          finish(() => resolve({ exitCode: code, signal, forced: true }));
        }
      }, graceMs);
    });

    childProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      const finalCode = exitObserved ? observedExitCode : code;
      const finalSignal = exitObserved ? observedSignal : signal;
      if (finalCode === null) {
        finish(() =>
          reject(
            new Error(`agent-run process terminated by signal: ${finalSignal || 'unknown'}`),
          ),
        );
      } else {
        finish(() => resolve({ exitCode: finalCode, signal: finalSignal, forced: false }));
      }
    });

    childProcess.on('error', (error: Error) => {
      finish(() => reject(new Error(`Failed to execute agent-run: ${error.message}`)));
    });
  });
}
