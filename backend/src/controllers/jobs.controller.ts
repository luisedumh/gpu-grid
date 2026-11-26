import { rm } from 'node:fs/promises';
import type { Request, Response } from 'express';
import type { SessionUser } from '../auth/session.js';
import { HttpError } from '../lib/http-error.js';
import {
  createJobSchema,
  dockerArchiveJobSchema,
  listJobsQuerySchema,
} from '../schemas/jobs.schema.js';
import * as jobsService from '../services/jobs.service.js';

/** What the jobs API needs from the rest of the system. */
export interface JobsDeps {
  /** Called after a CUDA job is stored, e.g. to start compiling it. */
  onJobCreated?: (jobId: string) => void;
  /** Called after a Docker job is stored: it is already QUEUED, waiting for a GPU. */
  onJobQueued?: (jobId: string) => void;
  /** Where uploaded Docker images (.tar) are saved. */
  uploadsDir?: string;
  /** Largest .tar accepted, in bytes. */
  maxArchiveBytes?: number;
}

/** The logged-in user. The jobs routes always require a session (see jobs.routes.ts). */
const viewer = (req: Request) => req.user as SessionUser;

export function createJobsController(deps: JobsDeps) {
  return {
    /** POST /api/jobs — validates the body and creates a CUDA or Docker job. */
    async create(req: Request, res: Response) {
      const input = createJobSchema.parse(req.body);
      const job = await jobsService.createJob(input, viewer(req).id);
      if (input.kind === 'DOCKER') deps.onJobQueued?.(job.id);
      else deps.onJobCreated?.(job.id);
      res.status(201).location(`/api/jobs/${job.id}`).json(job);
    },

    /** POST /api/jobs/docker-archive — a Docker job from an uploaded .tar (multipart). */
    async createFromArchive(req: Request, res: Response) {
      const file = req.file;
      if (!file) {
        throw new HttpError(
          400,
          'Upload the image (.tar made with "docker save") in the "archive" field',
        );
      }
      try {
        const input = dockerArchiveJobSchema.parse(req.body);
        const job = await jobsService.createArchiveJob(
          input,
          { path: file.path, originalName: file.originalname.slice(0, 255) },
          viewer(req).id,
        );
        deps.onJobQueued?.(job.id);
        res.status(201).location(`/api/jobs/${job.id}`).json(job);
      } catch (err) {
        // Without a job, nobody would ever delete the uploaded file
        await rm(file.path, { force: true });
        throw err;
      }
    },

    /** GET /api/jobs — lists jobs, newest first, with optional ?status= and ?limit= */
    async list(req: Request, res: Response) {
      const query = listJobsQuerySchema.parse(req.query);
      res.json(await jobsService.listJobs(query, viewer(req)));
    },

    /** GET /api/jobs/:id — returns the current state of a job. */
    async get(req: Request<{ id: string }>, res: Response) {
      const job = await jobsService.getJob(req.params.id, viewer(req));
      res.json(job);
    },
  };
}
