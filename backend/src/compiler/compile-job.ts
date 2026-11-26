import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { cleanProjectPath } from '../schemas/jobs.schema.js';
import { jobFiles } from '../services/jobs.service.js';
import { BINARY_FILE, type CompileResult, type Compiler } from './docker-compiler.js';

export interface CompileDeps {
  compiler: Compiler;
  jobsDir: string;
}

/**
 * Takes a PENDING job through compilation:
 * PENDING -> COMPILING -> QUEUED (success) or COMPILE_FAILED (errors).
 */
export async function compileJob(jobId: string, deps: CompileDeps): Promise<void> {
  // Claim the job atomically, so it can never be compiled twice
  const claimed = await prisma.job.updateMany({
    where: { id: jobId, status: 'PENDING' },
    data: { status: 'COMPILING' },
  });
  if (claimed.count === 0) return;

  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { sourceCode: true, files: true },
  });

  const workDir = path.join(deps.jobsDir, jobId);
  await mkdir(workDir, { recursive: true });

  const result = await compileProject(jobId, workDir, jobFiles(job), deps.compiler);

  if (result.success) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        compilerOutput: result.output,
        binaryPath: path.join(workDir, BINARY_FILE),
      },
    });
  } else {
    const message = result.timedOut ? 'Compilation exceeded the time limit.' : '';
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPILE_FAILED',
        compilerOutput: [result.output, message].filter(Boolean).join('\n'),
        finishedAt: new Date(),
      },
    });
  }
}

/**
 * After a restart, jobs left half-way through compilation go back to PENDING.
 * Returns every PENDING job id, oldest first, so they can be queued again.
 */
export async function recoverPendingJobs(): Promise<string[]> {
  await prisma.job.updateMany({ where: { status: 'COMPILING' }, data: { status: 'PENDING' } });
  const jobs = await prisma.job.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return jobs.map((job) => job.id);
}

/**
 * Writes every file of the project in the job folder, keeping its folders,
 * and returns the .cu files to compile. The paths were validated when the job was
 * created; they are checked again so nothing can ever be written outside the folder.
 */
async function writeProject(workDir: string, files: { path: string; content: string }[]) {
  for (const file of files) {
    const clean = cleanProjectPath(file.path);
    const target = clean && path.resolve(workDir, clean);
    if (!target || !target.startsWith(path.resolve(workDir) + path.sep)) {
      throw new Error(`Invalid file path: ${file.path}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
  return files.map((f) => f.path).filter((p) => p.endsWith('.cu'));
}

/** Writes the project and compiles it; any problem becomes a failed compilation. */
async function compileProject(
  jobId: string,
  workDir: string,
  files: { path: string; content: string }[],
  compiler: Compiler,
): Promise<CompileResult> {
  let sources: string[];
  try {
    sources = await writeProject(workDir, files);
  } catch (err) {
    return { success: false, output: (err as Error).message, timedOut: false };
  }
  try {
    return await compiler(workDir, sources);
  } catch (err) {
    console.error(`Compiler could not run for job ${jobId}:`, err);
    return {
      success: false,
      output: 'Internal error: the compiler could not be started. Please try again later.',
      timedOut: false,
    };
  }
}
