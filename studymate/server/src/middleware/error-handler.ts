import type { ErrorRequestHandler } from 'express';
import multer from 'multer';

import { env } from '../config/env.js';
import { AppError } from '../shared/app-error.js';

function isMalformedJson(error: unknown): boolean {
  if (!(error instanceof SyntaxError) || typeof error !== 'object') {
    return false;
  }
  const details = error as SyntaxError & { status?: unknown; type?: unknown };
  return details.status === 400 && details.type === 'entity.parse.failed';
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;
  const requestId = response.locals.requestId as string;

  if (isMalformedJson(error)) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request body contains invalid JSON.',
        requestId,
      },
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    response.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'MATERIAL_FILE_TOO_LARGE' : 'MATERIAL_UPLOAD_INVALID',
        message: tooLarge ? 'The uploaded file is too large.' : 'The upload could not be accepted.',
        requestId,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    });
    return;
  }

  if (env.NODE_ENV !== 'test') {
    console.error(`[${requestId}]`, error);
  }

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong.',
      requestId,
    },
  });
};
