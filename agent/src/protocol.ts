/**
 * Messages exchanged with the backend over WebSocket, as JSON.
 * Must match backend/src/agents/protocol.ts.
 */

export interface GpuInfo {
  name: string;
  memoryMb: number;
  computeCapability: string;
}

/** Messages this agent sends. */
export type AgentMessage =
  | { type: 'hello'; name: string; gpus: GpuInfo[] }
  | {
      type: 'result';
      jobId: string;
      exitCode: number | null;
      stdout: string;
      stderr: string;
      durationMs: number;
      timedOut: boolean;
    };

/**
 * A job to run. CUDA jobs bring the path to download their compiled binary;
 * Docker jobs bring the image, by name or as a .tar to download.
 */
export interface JobMessage {
  type: 'job';
  jobId: string;
  timeoutSeconds: number;
  /** Missing in messages of servers older than the Docker jobs: then it is CUDA. */
  kind?: 'CUDA' | 'DOCKER';
  /** CUDA: where to download the binary, e.g. /api/agent/jobs/<id>/binary */
  binaryPath?: string;
  /** DOCKER: image published in a registry, e.g. nvidia/cuda:12.4.1-base-ubuntu22.04 */
  image?: string | null;
  /** DOCKER: where to download the uploaded .tar, e.g. /api/agent/jobs/<id>/archive */
  archivePath?: string | null;
  /** DOCKER: command to run inside the container; null runs the image's default one. */
  command?: string | null;
}

/** Messages the backend sends. */
export type ServerMessage = { type: 'welcome'; agentId: string } | JobMessage;
