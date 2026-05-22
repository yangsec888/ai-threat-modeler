/**
 * Resolve path to appsec-agent agent-run CLI.
 */

import * as path from 'path';
import * as fs from 'fs';

export function findAgentRunPath(): string {
  const possiblePaths = [
    path.join(process.cwd(), 'node_modules', 'appsec-agent', 'dist', 'bin', 'agent-run.js'),
    path.join(__dirname, '..', '..', '..', 'appsec-agent', 'dist', 'bin', 'agent-run.js'),
    path.join(__dirname, '..', '..', '..', '..', 'appsec-agent', 'dist', 'bin', 'agent-run.js'),
    path.join(process.cwd(), '..', 'appsec-agent', 'dist', 'bin', 'agent-run.js'),
    path.join(process.cwd(), 'node_modules', 'appsec-agent', 'bin', 'agent-run.js'),
    path.join(__dirname, '..', '..', '..', 'appsec-agent', 'bin', 'agent-run.js'),
    path.join(__dirname, '..', '..', '..', '..', 'appsec-agent', 'bin', 'agent-run.js'),
    path.join(process.cwd(), '..', 'appsec-agent', 'bin', 'agent-run.js'),
  ];

  for (const agentRunPath of possiblePaths) {
    if (fs.existsSync(agentRunPath)) {
      return agentRunPath;
    }
  }

  throw new Error(`agent-run script not found. Tried paths: ${possiblePaths.join(', ')}`);
}
