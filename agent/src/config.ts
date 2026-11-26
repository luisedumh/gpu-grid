import os from 'node:os';

/** Agent settings, read from environment variables (or agent/.env). */
export const config = {
  /** Base URL of the GPU Grid backend. */
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  /** Secret shared with the backend (AGENT_TOKEN in backend/.env). */
  token: process.env.AGENT_TOKEN ?? '',
  /** Name shown in the platform for this machine. */
  name: process.env.AGENT_NAME ?? os.hostname(),
  /** AGENT_SIMULATE=1: pretend to run the jobs, for machines without a GPU (see simulator.ts). */
  simulate: ['1', 'true', 'yes'].includes((process.env.AGENT_SIMULATE ?? '').toLowerCase()),
  /** Docker jobs: largest image this machine accepts (MAX_IMAGE_GB, 10 GB by default). */
  maxImageBytes: Number(process.env.MAX_IMAGE_GB || 10) * 1024 ** 3,
  /** Docker jobs: longest time to download an image (PULL_TIMEOUT_SECONDS, 10 minutes by default). */
  pullTimeoutMs: Number(process.env.PULL_TIMEOUT_SECONDS || 600) * 1000,
};
