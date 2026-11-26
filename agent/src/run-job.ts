import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import type { DockerImages } from './docker-image.js';
import type { AgentMessage, JobMessage } from './protocol.js';
import type { RunOptions, RunResult } from './runner.js';

export type { JobMessage };
export type ResultMessage = Extract<AgentMessage, { type: 'result' }>;

/** What running a job needs; the tests pass fake versions of each part. */
export interface JobDeps {
  serverUrl: string;
  token: string;
  /** Runs the downloaded binary: on a GPU (runBinary) or simulated (simulateBinary). */
  runBinary: (options: RunOptions) => Promise<RunResult>;
  /** Docker of this machine (or the simulated one), for Docker image jobs. */
  docker: DockerImages;
  /** Largest image accepted, in bytes. */
  maxImageBytes: number;
  /** Longest time to download a published image. */
  pullTimeoutMs: number;
  fetch?: typeof fetch;
}

/**
 * Runs one job and returns the result message for the server.
 * Never throws: any problem becomes a result with the error in stderr,
 * so the job never stays RUNNING.
 */
export async function runJob(job: JobMessage, deps: JobDeps): Promise<ResultMessage> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'gpugrid-agent-'));
  try {
    const result =
      job.kind === 'DOCKER'
        ? await runImageJob(job, deps, workDir)
        : await runCudaJob(job, deps, workDir);
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

/** Downloads a file of the job from the server, with the agent token. */
async function download(urlPath: string, deps: JobDeps, what: string) {
  const response = await (deps.fetch ?? fetch)(new URL(urlPath, deps.serverUrl), {
    headers: { Authorization: `Bearer ${deps.token}` },
  });
  if (!response.ok || !response.body) {
    throw new Error(`${what} download failed with HTTP ${response.status}`);
  }
  return response;
}

/** CUDA job: download the compiled binary and run it. */
async function runCudaJob(job: JobMessage, deps: JobDeps, workDir: string) {
  if (!job.binaryPath) throw new Error('The job has no binary');
  const response = await download(job.binaryPath, deps, 'Binary');
  await writeFile(path.join(workDir, 'program'), Buffer.from(await response.arrayBuffer()), {
    mode: 0o755,
  });
  return deps.runBinary({
    binaryDir: workDir,
    binaryName: 'program',
    timeoutMs: job.timeoutSeconds * 1000,
  });
}

/**
 * Docker job: get the image (pull it by name, or download the .tar and load it),
 * check its size, run it isolated, and delete it afterwards so the provider's
 * disk does not fill up.
 */
async function runImageJob(job: JobMessage, deps: JobDeps, workDir: string) {
  let image: { ref: string; remove: boolean };

  if (job.archivePath) {
    const response = await download(job.archivePath, deps, 'Image');
    const tarPath = path.join(workDir, 'image.tar');
    // Streamed to disk: a .tar can weigh gigabytes and must not be kept in memory
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createWriteStream(tarPath),
    );
    image = await deps.docker.load(tarPath);
  } else if (job.image) {
    image = await deps.docker.pull(job.image, deps.pullTimeoutMs);
  } else {
    throw new Error('The job has no image');
  }

  try {
    const size = await deps.docker.size(image.ref);
    if (size > deps.maxImageBytes) {
      const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
      throw new Error(
        `The image is too big (${gb(size)} GB; this machine accepts up to ${gb(deps.maxImageBytes)} GB)`,
      );
    }
    return await deps.docker.run({
      image: image.ref,
      command: job.command,
      timeoutMs: job.timeoutSeconds * 1000,
    });
  } finally {
    if (image.remove) await deps.docker.remove(image.ref).catch(() => {});
  }
}
