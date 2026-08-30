import type { CookieOptions } from 'express';

import { env } from '../config/env.js';

export const SESSION_COOKIE = 'studymate_session';
export const CSRF_COOKIE = 'studymate_csrf';

const sharedCookieOptions: CookieOptions = {
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

export const sessionCookieOptions: CookieOptions = {
  ...sharedCookieOptions,
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const csrfCookieOptions: CookieOptions = {
  ...sharedCookieOptions,
  httpOnly: false,
  maxAge: 24 * 60 * 60 * 1000,
};

export const clearSessionCookieOptions: CookieOptions = {
  ...sharedCookieOptions,
  httpOnly: true,
};
