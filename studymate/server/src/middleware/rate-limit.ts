import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

import { AppError } from '../shared/app-error.js';

function limiter(max: number, windowMs = 15 * 60 * 1000): RequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.'));
    },
  });
}

export const loginRateLimit = limiter(20);
export const registerRateLimit = limiter(10);
export const materialUploadRateLimit = limiter(20, 60 * 60 * 1000);
