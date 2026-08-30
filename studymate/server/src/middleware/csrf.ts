import { timingSafeEqual } from 'node:crypto';

import type { RequestHandler } from 'express';

import { AppError } from '../shared/app-error.js';
import { CSRF_COOKIE } from '../shared/cookies.js';

function matches(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export const requireCsrf: RequestHandler = (request, _response, next) => {
  const cookies = request.cookies as unknown as Record<string, string | undefined>;
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = request.get('X-CSRF-Token');

  if (!cookieToken || !headerToken || !matches(cookieToken, headerToken)) {
    next(new AppError(403, 'CSRF_INVALID', 'The security token is missing or invalid.'));
    return;
  }

  next();
};
