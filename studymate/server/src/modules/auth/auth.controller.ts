import { randomBytes } from 'node:crypto';

import type { RequestHandler } from 'express';

import { AppError } from '../../shared/app-error.js';
import {
  clearSessionCookieOptions,
  csrfCookieOptions,
  CSRF_COOKIE,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '../../shared/cookies.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

function parseInput<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the submitted fields.');
  }
  return result.data;
}

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  csrf: RequestHandler = (_request, response) => {
    const csrfToken = randomBytes(32).toString('base64url');
    response.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions).json({ csrfToken });
  };

  register: RequestHandler = asyncHandler(async (request, response) => {
    const input = parseInput(registerSchema.safeParse(request.body));
    const result = await this.authService.register(input);
    response.cookie(SESSION_COOKIE, result.token, sessionCookieOptions).status(201).json({
      user: result.user,
    });
  });

  login: RequestHandler = asyncHandler(async (request, response) => {
    const input = parseInput(loginSchema.safeParse(request.body));
    const result = await this.authService.login(input);
    response.cookie(SESSION_COOKIE, result.token, sessionCookieOptions).json({
      user: result.user,
    });
  });

  me: RequestHandler = asyncHandler(async (_request, response) => {
    const session = response.locals.session as { sub: string };
    const user = await this.authService.getUser(session.sub);
    response.json({ user });
  });

  logout: RequestHandler = (_request, response) => {
    response.clearCookie(SESSION_COOKIE, clearSessionCookieOptions).status(204).send();
  };
}
