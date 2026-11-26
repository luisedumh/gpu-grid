import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { currentUser, runContainer, type RunResult } from './runner.js';

const execFileAsync = promisify(execFile);

/** Docker jobs: the client brings their own image instead of CUDA code. */

export interface ImageRunOptions {
  /** Image reference: a name ("ubuntu:24.04") or an id ("sha256:..."). */
  image: string;
  /** Command run with `sh -c` inside the container; null or empty runs the image's default. */
  command?: string | null;
  timeoutMs: number;
}

/**
 * Arguments for `docker run` of a client's image. Same isolation as the CUDA jobs,
 * and more, because we did not build this image: no network, read-only file system
 * (only a small /tmp where nothing can be executed), no capabilities, no way to gain
 * privileges, an unprivileged user, and limits of memory and processes.
 */
export function imageRunArgs(options: ImageRunOptions, containerName: string, user: string) {
  const args = [
    'run',
    '--rm',
    '--name',
    containerName,
    '--gpus',
    'all',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=256m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    user,
    '--memory',
    '4g',
    '--pids-limit',
    '256',
  ];
  const command = options.command?.trim();
  // With a command, it replaces whatever the image would run (its entrypoint included)
  return command
    ? [...args, '--entrypoint', 'sh', options.image, '-c', command]
    : [...args, options.image];
}

/**
 * Reads the image reference from the output of `docker load`:
 * "Loaded image: my-model:1.0" or, for images without a name, "Loaded image ID: sha256:...".
 */
export function parseLoadOutput(output: string): string {
  const match = output.match(/Loaded image(?: ID)?: (\S+)/);
  if (!match) throw new Error('docker load did not report any image');
  return match[1];
}

/** Runs a docker command and returns its output; on failure, throws with Docker's message. */
async function docker(args: string[], timeoutMs = 60_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync('docker', args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const { stderr, killed, message } = err as {
      stderr?: string;
      killed?: boolean;
      message: string;
    };
    if (killed) throw new Error(`docker ${args[0]} took too long`, { cause: err });
    // Docker's last line of error is the useful one, e.g. "pull access denied for x"
    throw new Error((stderr || message).trim().split('\n').pop() ?? message, { cause: err });
  }
}

/** What the agent needs from Docker for image jobs; the simulator and the tests replace it. */
export interface DockerImages {
  /** Makes a published image available; `remove` says whether to delete it afterwards. */
  pull(image: string, timeoutMs: number): Promise<{ ref: string; remove: boolean }>;
  /** Loads a .tar created with `docker save`; it is always deleted afterwards. */
  load(tarPath: string): Promise<{ ref: string; remove: boolean }>;
  /** Size of an image in bytes. */
  size(ref: string): Promise<number>;
  run(options: ImageRunOptions): Promise<RunResult>;
  remove(ref: string): Promise<void>;
}

/** The real Docker of the provider's machine. */
export const realDockerImages: DockerImages = {
  async pull(image, timeoutMs) {
    // An image the provider already had is used as it is, and never deleted
    const existed = await docker(['image', 'inspect', image]).then(
      () => true,
      () => false,
    );
    if (!existed) await docker(['pull', image], timeoutMs);
    return { ref: image, remove: !existed };
  },

  async load(tarPath) {
    const output = await docker(['load', '--input', tarPath], 10 * 60_000);
    return { ref: parseLoadOutput(output), remove: true };
  },

  async size(ref) {
    return Number(await docker(['image', 'inspect', '--format', '{{.Size}}', ref]));
  },

  run(options) {
    const containerName = `gpugrid-job-${randomUUID()}`;
    return runContainer(
      imageRunArgs(options, containerName, currentUser()),
      containerName,
      options.timeoutMs,
    );
  },

  async remove(ref) {
    await docker(['image', 'rm', '--force', ref]);
  },
};
