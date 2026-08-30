import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../shared/async-handler.js';
import type { DashboardService } from './dashboard.service.js';

export function createDashboardRouter(service: DashboardService): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', asyncHandler(async (_request, response) => {
    const session = response.locals.session as { sub: string };
    response.json(await service.get(session.sub));
  }));
  return router;
}
