import { Router } from 'express';
import * as jobsController from '../controllers/jobs.controller.js';

export const jobsRouter = Router();

jobsRouter.post('/', jobsController.createJob);
jobsRouter.get('/', jobsController.listJobs);
jobsRouter.get('/:id', jobsController.getJob);
