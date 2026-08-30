import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from '../shared/app-error.js';
import { SESSION_COOKIE } from '../shared/cookies.js';

type SessionPayload = {
  sub: string;
  email: string;
};

export const authenticate: RequestHandler = (request, response, next) => {
  const cookies = request.cookies as unknown as Record<string, string | undefined>;
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string'
    ) {
      throw new Error('Malformed session payload.');
    }
    response.locals.session = { sub: payload.sub, email: payload.email } satisfies SessionPayload;
    next();
  } catch {
    next(new AppError(401, 'AUTH_SESSION_INVALID', 'Your session is invalid or expired.'));
  }
};
