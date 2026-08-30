import type { RequestHandler } from 'express';
import { readFile, unlink } from 'node:fs/promises';

import { AppError } from '../../shared/app-error.js';
import { asyncHandler } from '../../shared/async-handler.js';
import type { MaterialRecord, MaterialService } from './material.service.js';

function publicMaterial(material: MaterialRecord) {
  return {
    id: material.id,
    originalName: material.originalName,
    mimeType: material.mimeType,
    extension: material.extension,
    size: material.size,
    status: material.status,
    chunkCount: material.chunkCount,
    processingError: material.processingError,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
  };
}

function userId(response: Parameters<RequestHandler>[1]): string {
  return (response.locals.session as { sub: string }).sub;
}

function routeId(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export class MaterialController {
  constructor(private readonly service: MaterialService) {}

  list: RequestHandler = asyncHandler(async (_request, response) => {
    const materials = await this.service.list(userId(response));
    response.json({ materials: materials.map(publicMaterial) });
  });

  get: RequestHandler = asyncHandler(async (request, response) => {
    const material = await this.service.get(userId(response), routeId(request.params.id));
    response.json({ material: publicMaterial(material) });
  });

  upload: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.file) {
      throw new AppError(400, 'MATERIAL_FILE_REQUIRED', 'Choose a file to upload.');
    }
    try {
      const material = await this.service.upload(userId(response), {
        originalName: request.file.originalname,
        mimeType: request.file.mimetype,
        buffer: await readFile(request.file.path),
      });
      response.status(201).json({ material: publicMaterial(material) });
    } finally {
      await unlink(request.file.path).catch(() => undefined);
    }
  });

  remove: RequestHandler = asyncHandler(async (request, response) => {
    await this.service.remove(userId(response), routeId(request.params.id));
    response.status(204).send();
  });
}
