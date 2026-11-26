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

/**
 * Body accepted by POST /api/jobs: a single file (sourceCode) or a project (files).
 * In a project every .cu file is compiled together.
 */
export const createJobSchema = z
  .object({
    name: z.string().trim().min(1).max(JOB_LIMITS.nameMaxLength),
    sourceCode: z.string().min(1).max(JOB_LIMITS.sourceCodeMaxLength).optional(),
    files: z.array(projectFileSchema).min(1).max(JOB_LIMITS.maxFiles).optional(),
    timeoutSeconds: z
      .number()
      .int()
      .min(JOB_LIMITS.timeoutSecondsMin)
      .max(JOB_LIMITS.timeoutSecondsMax)
      .optional(),
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

export type CreateJobInput = z.infer<typeof createJobSchema>;

/** Query string accepted by GET /api/jobs, e.g. ?status=RUNNING&limit=20 */
export const listJobsQuerySchema = z.object({
  status: z.enum(JobStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
