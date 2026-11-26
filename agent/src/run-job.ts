import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentMessage, ServerMessage } from './protocol.js';
import type { RunOptions, RunResult } from './runner.js';

export type JobMessage = Extract<ServerMessage, { type: 'job' }>;
export type ResultMessage = Extract<AgentMessage, { type: 'result' }>;

/** What running a job needs; the tests pass fake versions of each part. */
export interface JobDeps {
  serverUrl: string;
  token: string;
  /** Runs the downloaded binary: on a GPU (runBinary) or simulated (simulateBinary). */
  runBinary: (options: RunOptions) => Promise<RunResult>;
  fetch?: typeof fetch;
}

/**
 * Runs one job: downloads its binary from the server, runs it and
 * returns the result message for the server. Never throws: any problem
 * becomes a result with the error in stderr, so the job never stays RUNNING.
 */
export async function runJob(job: JobMessage, deps: JobDeps): Promise<ResultMessage> {
  const download = deps.fetch ?? fetch;
  const workDir = await mkdtemp(path.join(tmpdir(), 'gpugrid-agent-'));

  try {
    const response = await download(new URL(job.binaryPath, deps.serverUrl), {
      headers: { Authorization: `Bearer ${deps.token}` },
    });
    if (!response.ok) throw new Error(`Binary download failed with HTTP ${response.status}`);
    await writeFile(path.join(workDir, 'program'), Buffer.from(await response.arrayBuffer()), {
      mode: 0o755,
    });

    const result = await deps.runBinary({
      binaryDir: workDir,
      binaryName: 'program',
      timeoutMs: job.timeoutSeconds * 1000,
    });
    return { type: 'result', jobId: job.jobId, ...result };
  } catch (err) {
    return {
      type: 'result',
      jobId: job.jobId,
      exitCode: null,
      stdout: '',
      stderr: `Agent error: ${(err as Error).message}`,
      durationMs: 0,
      timedOut: false,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
