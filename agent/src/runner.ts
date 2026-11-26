import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface RunOptions {
  /** Folder that contains the compiled binary. */
  binaryDir: string;
  /** File name of the binary inside binaryDir. */
  binaryName: string;
  /** Maximum running time before the job is killed. */
  timeoutMs: number;
  /** Image used to run the binary. It does not need CUDA installed. */
  image?: string;
}

export interface RunResult {
  /** Exit code of the program (null if it could not be determined). */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Wall time, including container start-up. */
  durationMs: number;
  timedOut: boolean;
}

/** Output beyond this size is discarded, so a program cannot flood memory. */
const MAX_OUTPUT_CHARS = 1_000_000;

/**
 * Arguments for `docker run`: a short-lived container with GPU access,
 * no network, a read-only mount and resource limits.
 * Kept apart from runBinary so the tests can check them without Docker.
 */
export function dockerRunArgs(options: RunOptions, containerName: string, user: string): string[] {
  return [
    'run',
    '--rm',
    '--name',
    containerName,
    '--gpus',
    'all',
    '--network',
    'none',
    '--user',
    user,
    '--memory',
    '4g',
    '--pids-limit',
    '256',
    '-v',
    `${path.resolve(options.binaryDir)}:/work:ro`,
    options.image ?? 'ubuntu:24.04',
    `/work/${options.binaryName}`,
  ];
}

/** User and group of the agent: containers never run as root. */
export function currentUser() {
  return `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
}

/** Runs a compiled CUDA binary inside a Docker container (see dockerRunArgs). */
export function runBinary(options: RunOptions): Promise<RunResult> {
  const containerName = `gpugrid-job-${randomUUID()}`;
  return runContainer(
    dockerRunArgs(options, containerName, currentUser()),
    containerName,
    options.timeoutMs,
  );
}

/**
 * Runs `docker <args>` for a container called containerName, collecting its output,
 * and kills the container if it goes over timeoutMs.
 */
export function runContainer(
  args: string[],
  containerName: string,
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const child = spawn('docker', args);

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const append = (current: string, chunk: Buffer) =>
      current.length >= MAX_OUTPUT_CHARS ? current : current + chunk.toString();

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    // Killing the `docker` client process would leave the container running,
    // so on timeout we ask Docker to kill the container itself.
    const timer = setTimeout(() => {
      timedOut = true;
      spawn('docker', ['kill', containerName]);
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - start),
        timedOut,
      });
    });
  });
}
