import { Router } from 'express';
import { createJobsController, type JobsDeps } from '../controllers/jobs.controller.js';
import { requireAuth } from '../middleware/auth.js';

export function createJobsRouter(deps: JobsDeps) {
  const controller = createJobsController(deps);
  const router = Router();

  // Only clients (and administrators) submit jobs; any logged-in user can see them
  router.post('/', requireAuth('CLIENT', 'ADMIN'), controller.create);
  router.get('/', requireAuth(), controller.list);
  router.get('/:id', requireAuth(), controller.get);

  return router;
}
