import { z } from 'zod';
import { JobStatus } from '../generated/prisma/enums.js';

/** Limits shared by validation and documentation. */
export const JOB_LIMITS = {
  nameMaxLength: 100,
  sourceCodeMaxLength: 100_000,
  timeoutSecondsMin: 1,
  timeoutSecondsMax: 300,
  /** Projects of several files */
  maxFiles: 50,
  maxPathLength: 200,
  maxProjectChars: 500_000,
  /** Docker jobs */
  imageMaxLength: 255,
  commandMaxLength: 1000,
  archiveMaxBytes: 2 * 1024 ** 3,
} as const;

/** Text files that make sense in a CUDA project (the frontend accepts the same ones). */
const PROJECT_EXTENSIONS = ['.cu', '.cuh', '.h', '.hpp', '.c', '.cc', '.cpp', '.txt', '.md'];

/** Each part of a path: letters, digits, dots, dashes and underscores, not starting with a dot. */
const PATH_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * Cleans the path of a project file ("src\\kernels.cu" -> "src/kernels.cu") and returns
 * null if it is not acceptable: absolute, with "..", hidden parts or strange characters,
 * an extension that is not source code, or inside "program" (the name of the compiled binary).
 * Whatever passes here can be written safely inside the job folder.
 */
export function cleanProjectPath(raw: string): string | null {
  const parts = raw.replace(/\\/g, '/').split('/');
  if (parts.some((part) => !PATH_SEGMENT.test(part))) return null;
  const clean = parts.join('/');
  if (clean.length > JOB_LIMITS.maxPathLength) return null;
  if (parts[0] === 'program') return null;
  if (!PROJECT_EXTENSIONS.some((ext) => clean.toLowerCase().endsWith(ext))) return null;
  return clean;
}

const projectFileSchema = z.object({
  path: z.string().transform((raw, ctx) => {
    const clean = cleanProjectPath(raw.trim());
    if (!clean) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid file path "${raw}": use a relative path to a .cu, .cuh, .h, .hpp, .c, .cc, .cpp, .txt or .md file`,
      });
      return z.NEVER;
    }
    return clean;
  }),
  content: z.string(),
});

export type ProjectFile = z.infer<typeof projectFileSchema>;

const nameSchema = z.string().trim().min(1).max(JOB_LIMITS.nameMaxLength);
const timeoutSchema = z
  .number()
  .int()
  .min(JOB_LIMITS.timeoutSecondsMin)
  .max(JOB_LIMITS.timeoutSecondsMax);

/**
 * A CUDA job: a single file (sourceCode) or a project (files).
 * In a project every .cu file is compiled together.
 */
const cudaJobSchema = z
  .object({
    kind: z.literal('CUDA'),
    name: nameSchema,
    sourceCode: z.string().min(1).max(JOB_LIMITS.sourceCodeMaxLength).optional(),
    files: z.array(projectFileSchema).min(1).max(JOB_LIMITS.maxFiles).optional(),
    timeoutSeconds: timeoutSchema.optional(),
  })
  .superRefine((job, ctx) => {
    if ((job.sourceCode === undefined) === (job.files === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceCode'],
        message: 'Send either sourceCode (one file) or files (a project)',
      });
      return;
    }
    if (!job.files) return;

    const paths = job.files.map((file) => file.path);
    const repeated = paths.find((p, i) => paths.indexOf(p) !== i);
    if (repeated) {
      ctx.addIssue({ code: 'custom', path: ['files'], message: `${repeated} appears twice` });
    }
    if (!paths.some((p) => p.toLowerCase().endsWith('.cu'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'The project needs at least one .cu file',
      });
    }
    const total = job.files.reduce((sum, file) => sum + file.content.length, 0);
    if (total > JOB_LIMITS.maxProjectChars) {
      ctx.addIssue({
        code: 'custom',
        path: ['files'],
        message: `The project is too big (maximum ${JOB_LIMITS.maxProjectChars} characters)`,
      });
    }
  });

/**
 * Docker image reference: [registry[:port]/]name[/more][:tag][@sha256:digest], in lower case.
 * It cannot start with "-", so it can never be taken as an option of the docker command.
 */
const IMAGE_REFERENCE =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;

/** Command run inside the container. Empty means "the image's default command". */
const commandSchema = z
  .string()
  .trim()
  .max(JOB_LIMITS.commandMaxLength)
  .optional()
  .transform((command) => command || undefined);

/** A Docker job with an image published in a registry (Docker Hub, GHCR...). */
const dockerJobSchema = z.object({
  kind: z.literal('DOCKER'),
  name: nameSchema,
  image: z
    .string()
    .trim()
    .max(JOB_LIMITS.imageMaxLength)
    .regex(IMAGE_REFERENCE, 'Invalid image name, e.g. nvidia/cuda:13.0.1-base-ubuntu24.04'),
  command: commandSchema,
  timeoutSeconds: timeoutSchema.optional(),
});

/**
 * Body accepted by POST /api/jobs. Without "kind" it is a CUDA job,
 * as the API accepted before Docker jobs existed.
 */
export const createJobSchema = z.preprocess(
  (body) =>
    body && typeof body === 'object' && !('kind' in body) ? { ...body, kind: 'CUDA' } : body,
  z.discriminatedUnion('kind', [cudaJobSchema, dockerJobSchema]),
);

export type CreateJobInput = z.infer<typeof createJobSchema>;

/**
 * Text fields of POST /api/jobs/docker-archive (multipart/form-data).
 * Everything arrives as text, so the time limit is converted to a number.
 */
export const dockerArchiveJobSchema = z.object({
  name: nameSchema,
  timeoutSeconds: z.coerce.number().pipe(timeoutSchema).optional(),
  command: commandSchema,
});

export type DockerArchiveJobInput = z.infer<typeof dockerArchiveJobSchema>;

/** Query string accepted by GET /api/jobs, e.g. ?status=RUNNING&limit=20 */
export const listJobsQuerySchema = z.object({
  status: z.enum(JobStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
