import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { DockerImages } from './docker-image.js';
import type { GpuInfo } from './protocol.js';
import type { RunOptions, RunResult } from './runner.js';

/**
 * Simulation mode (AGENT_SIMULATE=1): the agent behaves like a real one
 * (connects, receives jobs, downloads their binary and reports a result),
 * but instead of running the program on a GPU it pretends to.
 * It is used in GitHub Actions, which has no GPU, and to try the platform
 * on any computer.
 */

/** The GPU this agent says it has when simulating. */
export const SIMULATED_GPU: GpuInfo = {
  name: 'Simulated GPU (no hardware)',
  memoryMb: 8192,
  computeCapability: '8.6',
};

/** Same shape as runBinary, so the agent can use one or the other. */
export async function simulateBinary(
  options: RunOptions,
  delayMs = 300 + Math.floor(Math.random() * 400),
): Promise<RunResult> {
  const start = performance.now();
  // The binary was really downloaded from the server: report its size as proof
  const { size } = await stat(path.join(options.binaryDir, options.binaryName));
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, options.timeoutMs)));

  return {
    exitCode: 0,
    stdout:
      `[simulated] Program received (${size} bytes) and run without a GPU.\n` +
      `[simulated] On an agent with an NVIDIA GPU, its output would appear here.\n`,
    stderr: '',
    durationMs: Math.round(performance.now() - start),
    timedOut: false,
  };
}

/**
 * Docker of a simulated agent: published images are not downloaded, an uploaded .tar
 * is received (its size is reported as proof) but not loaded, and nothing is run.
 */
export const simulatedDockerImages: DockerImages = {
  async pull(image) {
    return { ref: image, remove: false };
  },
  async load(tarPath) {
    const { size } = await stat(tarPath);
    return { ref: `uploaded image (${size} bytes)`, remove: false };
  },
  async size() {
    return 0;
  },
  async run(options) {
    const start = performance.now();
    await new Promise((resolve) => setTimeout(resolve, Math.min(300, options.timeoutMs)));
    const command = options.command?.trim() || "the image's default command";
    return {
      exitCode: 0,
      stdout:
        `[simulated] Image ${options.image} run with ${command}, without a GPU.\n` +
        `[simulated] On an agent with an NVIDIA GPU, its output would appear here.\n`,
      stderr: '',
      durationMs: Math.round(performance.now() - start),
      timedOut: false,
    };
  },
  async remove() {},
};
