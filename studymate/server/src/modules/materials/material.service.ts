import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../../shared/app-error.js';
import { validateUpload } from './document-processing.js';

export type MaterialStatusValue = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';

export type MaterialRecord = {
  id: string;
  userId: string;
  originalName: string;
  storedName: string;
  storagePath: string;
  mimeType: string;
  extension: string;
  size: number;
  checksum: string;
  status: MaterialStatusValue;
  chunkCount: number;
  processingError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMaterialInput = Pick<
  MaterialRecord,
  'userId' | 'originalName' | 'storedName' | 'storagePath' | 'mimeType' | 'extension' | 'size' | 'checksum'
>;

export interface MaterialRepository {
  createWithJob(input: CreateMaterialInput): Promise<MaterialRecord>;
  listByUser(userId: string): Promise<MaterialRecord[]>;
  findByIdForUser(id: string, userId: string): Promise<MaterialRecord | null>;
  deleteByIdForUser(id: string, userId: string): Promise<MaterialRecord | null>;
}

export interface MaterialVectorCleaner {
  deleteMaterial(userId: string, materialId: string): Promise<void>;
}

export type MaterialUpload = {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
};

export class MaterialService {
  constructor(
    private readonly repository: MaterialRepository,
    private readonly storageDirectory: string,
    private readonly vectorCleaner?: MaterialVectorCleaner,
  ) {}

  async upload(userId: string, upload: MaterialUpload): Promise<MaterialRecord> {
    const { extension } = await validateUpload({
      originalName: upload.originalName,
      mimeType: upload.mimeType,
      buffer: upload.buffer,
    });
    const storedName = `${randomUUID()}.${extension}`;
    const userDirectory = path.resolve(this.storageDirectory, userId);
    const storagePath = path.join(userDirectory, storedName);
    const checksum = createHash('sha256').update(upload.buffer).digest('hex');

    await mkdir(userDirectory, { recursive: true });
    await writeFile(storagePath, upload.buffer, { flag: 'wx' });
    try {
      return await this.repository.createWithJob({
        userId,
        originalName: path.basename(upload.originalName),
        storedName,
        storagePath,
        mimeType: upload.mimeType,
        extension,
        size: upload.buffer.byteLength,
        checksum,
      });
    } catch (error) {
      await unlink(storagePath).catch(() => undefined);
      throw error;
    }
  }

  list(userId: string): Promise<MaterialRecord[]> {
    return this.repository.listByUser(userId);
  }

  async get(userId: string, materialId: string): Promise<MaterialRecord> {
    const material = await this.repository.findByIdForUser(materialId, userId);
    if (!material) throw new AppError(404, 'MATERIAL_NOT_FOUND', 'Material not found.');
    return material;
  }

  async remove(userId: string, materialId: string): Promise<void> {
    const ownedMaterial = await this.get(userId, materialId);
    await this.vectorCleaner?.deleteMaterial(userId, materialId);
    await unlink(ownedMaterial.storagePath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
    const material = await this.repository.deleteByIdForUser(materialId, userId);
    if (!material) throw new AppError(404, 'MATERIAL_NOT_FOUND', 'Material not found.');
  }
}
