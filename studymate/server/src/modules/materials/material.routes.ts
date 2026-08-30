import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { materialUploadRateLimit } from '../../middleware/rate-limit.js';
import { MaterialController } from './material.controller.js';
import type { MaterialService } from './material.service.js';

export function createMaterialRouter(service: MaterialService): Router {
  const router = Router();
  const controller = new MaterialController(service);
  const uploadDirectory = path.join(tmpdir(), 'studymate-uploads');
  mkdirSync(uploadDirectory, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDirectory,
      filename: (_request, _file, callback) => callback(null, randomUUID()),
    }),
    limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
  });

  router.use(authenticate);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', requireCsrf, materialUploadRateLimit, upload.single('file'), controller.upload);
  router.delete('/:id', requireCsrf, controller.remove);

  return router;
}
