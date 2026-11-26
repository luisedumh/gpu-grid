/**
 * Typed access to the backend's jobs API.
 * Mirrors what backend/src/services/jobs.service.ts returns.
 */

export type JobStatus =
  | 'PENDING'
  | 'COMPILING'
  | 'COMPILE_FAILED'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT';

/** States after which a job never changes again. */
export const FINAL_STATUSES: readonly JobStatus[] = [
  'COMPILE_FAILED',
  'COMPLETED',
  'FAILED',
  'TIMED_OUT',
];

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  timeoutSeconds: number;
  compilerOutput: string | null;
  attempts: number;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Files of the project (CUDA jobs). Old jobs of a single file have just one. */
  files?: ProjectFile[];
}

/** One file of a CUDA project, as sent to and returned by the API. */
export interface ProjectFile {
  /** Relative path inside the project, e.g. "src/kernels.cu". */
  path: string;
  content: string;
}

/** Lighter version of a job returned by the list endpoint (no code or outputs). */
export type JobSummary = Pick<
  Job,
  'id' | 'name' | 'status' | 'exitCode' | 'durationMs' | 'attempts' | 'createdAt' | 'finishedAt'
>;

/** Answer of GET /api/jobs. */
export interface JobList {
  jobs: JobSummary[];
  /** Number of jobs in each status, over all jobs (not only the ones listed). */
  counts: Record<JobStatus, number>;
}

/** Every status, in the order a job goes through them. */
export const JOB_STATUSES: readonly JobStatus[] = [
  'PENDING',
  'COMPILING',
  'COMPILE_FAILED',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMED_OUT',
];

/**
 * A new CUDA job: either a single file (sourceCode) or a project of several files.
 * A project of one file is sent as sourceCode, as the API always accepted.
 */
export interface NewJob {
  name: string;
  timeoutSeconds: number;
  sourceCode?: string;
  files?: ProjectFile[];
}

/** An error answered by the API, with the per-field details of validation errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: { field: string; message: string }[];

  constructor(message: string, status: number, details: { field: string; message: string }[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** Turns an error of the API into text for the user, listing the invalid fields if any. */
export function describeError(err: unknown): string {
  const details = err instanceof ApiError && err.details.length > 0 ? err.details : null;
  return details
    ? details.map((d) => `${d.field}: ${d.message}`).join('\n')
    : (err as Error).message;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
      body?.details,
    );
  }
  return body as T;
}

export function createJob(job: NewJob) {
  return request<Pick<Job, 'id' | 'status' | 'createdAt'>>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(job),
  });
}

export function getJob(id: string) {
  return request<Job>(`/api/jobs/${id}`);
}
