import { Router } from 'express';
import { config } from '../config.js';
import { createJobsController, type JobsDeps } from '../controllers/jobs.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { receiveImageArchive } from '../middleware/upload.js';
import { JOB_LIMITS } from '../schemas/jobs.schema.js';

export function createJobsRouter(deps: JobsDeps) {
  const controller = createJobsController(deps);
  const router = Router();

  // Only clients (and administrators) submit jobs; any logged-in user can see them
  router.post('/', requireAuth('CLIENT', 'ADMIN'), controller.create);
  router.post(
    '/docker-archive',
    // The session is checked before receiving the file: nobody uploads gigabytes without one
    requireAuth('CLIENT', 'ADMIN'),
    receiveImageArchive({
      uploadsDir: deps.uploadsDir ?? config.uploadsDir,
      maxBytes: deps.maxArchiveBytes ?? JOB_LIMITS.archiveMaxBytes,
    }),
    controller.createFromArchive,
  );
  router.get('/', requireAuth(), controller.list);
  router.get('/:id', requireAuth(), controller.get);

  return router;
}
