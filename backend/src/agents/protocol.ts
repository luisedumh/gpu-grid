import { z } from 'zod';

/**
 * Messages exchanged with provider agents over WebSocket, as JSON.
 * Everything an agent sends is validated: it runs on someone else's machine.
 */

const gpuSchema = z.object({
  name: z.string().max(200),
  memoryMb: z.number().int().nonnegative(),
  computeCapability: z.string().max(10),
});

/** First message of every agent: who it is and which GPUs it offers. */
const helloSchema = z.object({
  type: z.literal('hello'),
  name: z.string().min(1).max(100),
  gpus: z.array(gpuSchema).max(16),
});

/** Sent by an agent when it finishes a job. */
const resultSchema = z.object({
  type: z.literal('result'),
  jobId: z.string(),
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(1_100_000),
  stderr: z.string().max(1_100_000),
  durationMs: z.number().int().nonnegative(),
  timedOut: z.boolean(),
});

export const agentMessageSchema = z.discriminatedUnion('type', [helloSchema, resultSchema]);

export type GpuInfo = z.infer<typeof gpuSchema>;
export type AgentMessage = z.infer<typeof agentMessageSchema>;
export type JobResult = Omit<z.infer<typeof resultSchema>, 'type' | 'jobId'>;

/**
 * A job for an agent. CUDA jobs bring where to download their compiled binary;
 * Docker jobs bring the image by name, or where to download the uploaded .tar.
 * Must match agent/src/protocol.ts.
 */
export type JobMessage =
  | { type: 'job'; jobId: string; timeoutSeconds: number; kind: 'CUDA'; binaryPath: string }
  | {
      type: 'job';
      jobId: string;
      timeoutSeconds: number;
      kind: 'DOCKER';
      image: string | null;
      archivePath: string | null;
      command: string | null;
    };

/** Messages the server sends to agents. */
export type ServerMessage = { type: 'welcome'; agentId: string } | JobMessage;

/** Parses a raw message; returns null if it is not valid JSON or not a known message. */
export function parseAgentMessage(raw: string): AgentMessage | null {
  try {
    const result = agentMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
