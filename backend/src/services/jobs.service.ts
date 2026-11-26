import type { SessionUser } from '../auth/session.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/http-error.js';
import { JobStatus } from '../generated/prisma/enums.js';
import type {
  CreateJobInput,
  DockerArchiveJobInput,
  ListJobsQuery,
  ProjectFile,
} from '../schemas/jobs.schema.js';

/**
 * Fields of a job that clients are allowed to see.
 * Internal details (where the binary or the uploaded image are stored) stay private.
 */
const publicJobFields = {
  id: true,
  name: true,
  kind: true,
  image: true,
  imageArchiveName: true,
  command: true,
  status: true,
  timeoutSeconds: true,
  compilerOutput: true,
  attempts: true,
  stdout: true,
  stderr: true,
  exitCode: true,
  durationMs: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  finishedAt: true,
} as const;

/** Lighter view used in lists: no code or outputs, which can be large. */
const jobSummaryFields = {
  id: true,
  name: true,
  kind: true,
  status: true,
  exitCode: true,
  durationMs: true,
  attempts: true,
  createdAt: true,
  finishedAt: true,
} as const;

/** Jobs a user may see: administrators see every job, everyone else only their own. */
function visibleTo(viewer: SessionUser) {
  return viewer.role === 'ADMIN' ? {} : { clientId: viewer.id };
}

/**
 * The files of a job: those of its project, or its single file as main.cu.
 * Projects also keep their main file in sourceCode, for the views that show a single file.
 */
export function jobFiles(job: { sourceCode: string; files: unknown }): ProjectFile[] {
  return (job.files as ProjectFile[] | null) ?? [{ path: 'main.cu', content: job.sourceCode }];
}

/** The file shown as "the code" of a project: main.cu if there is one, otherwise the first .cu. */
function mainFile(files: ProjectFile[]) {
  return (
    files.find((f) => f.path.split('/').pop() === 'main.cu') ??
    files.find((f) => f.path.endsWith('.cu')) ??
    files[0]
  );
}

const createdJobFields = { id: true, status: true, createdAt: true } as const;

/**
 * Stores a new job of the given client.
 * CUDA jobs start as PENDING, waiting to be compiled. Docker jobs have nothing
 * to compile, so they go straight to QUEUED, waiting for a free GPU.
 */
export async function createJob(input: CreateJobInput, clientId: string) {
  if (input.kind === 'DOCKER') {
    const { image, command, ...rest } = input;
    return prisma.job.create({
      data: { ...rest, clientId, sourceCode: '', status: 'QUEUED', image, command },
      select: createdJobFields,
    });
  }

  const { sourceCode, files, ...rest } = input;
  return prisma.job.create({
    data: {
      ...rest,
      clientId,
      sourceCode: sourceCode ?? mainFile(files!).content,
      ...(files ? { files } : {}),
    },
    select: createdJobFields,
  });
}

/** Stores a Docker job whose image was uploaded as a .tar (already saved at archivePath). */
export async function createArchiveJob(
  input: DockerArchiveJobInput,
  archive: { path: string; originalName: string },
  clientId: string,
) {
  return prisma.job.create({
    data: {
      ...input,
      kind: 'DOCKER',
      clientId,
      sourceCode: '',
      status: 'QUEUED',
      archivePath: archive.path,
      imageArchiveName: archive.originalName,
    },
    select: createdJobFields,
  });
}

/**
 * Returns the public view of a job, or throws NotFoundError.
 * Someone else's job is also "not found": we do not even reveal that it exists.
 */
export async function getJob(id: string, viewer: SessionUser) {
  const job = await prisma.job.findFirst({
    where: { id, ...visibleTo(viewer) },
    select: { ...publicJobFields, sourceCode: true, files: true },
  });
  if (!job) throw new NotFoundError(`Job ${id} not found`);
  // The code is returned as the list of files of the project, also for single-file jobs.
  // Docker jobs have no code.
  const { sourceCode, files, ...rest } = job;
  return { ...rest, files: job.kind === 'DOCKER' ? [] : jobFiles({ sourceCode, files }) };
}

/**
 * Most recent jobs first, optionally filtered by status, plus how many jobs
 * there are in each status (over all the viewer's jobs, not just this page).
 */
export async function listJobs({ status, limit }: ListJobsQuery, viewer: SessionUser) {
  const visible = visibleTo(viewer);
  const [jobs, groups] = await Promise.all([
    prisma.job.findMany({
      where: status ? { ...visible, status } : visible,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: jobSummaryFields,
    }),
    prisma.job.groupBy({ by: ['status'], where: visible, _count: { _all: true } }),
  ]);

  // Start every status at 0, so statuses without jobs also appear
  const counts = Object.fromEntries(Object.values(JobStatus).map((s) => [s, 0])) as Record<
    JobStatus,
    number
  >;
  for (const group of groups) counts[group.status] = group._count._all;

  return { jobs, counts };
}
