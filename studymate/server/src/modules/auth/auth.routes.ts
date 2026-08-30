import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { loginRateLimit, registerRateLimit } from '../../middleware/rate-limit.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();
  const controller = new AuthController(authService);

  router.get('/csrf', controller.csrf);
  router.post('/register', requireCsrf, registerRateLimit, controller.register);
  router.post('/login', requireCsrf, loginRateLimit, controller.login);
  router.post('/logout', requireCsrf, controller.logout);
  router.get('/me', authenticate, controller.me);

  return router;
}
