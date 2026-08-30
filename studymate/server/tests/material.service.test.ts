import { access, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MaterialService,
  type CreateMaterialInput,
  type MaterialRecord,
  type MaterialRepository,
} from '../src/modules/materials/material.service.js';

class MemoryMaterialRepository implements MaterialRepository {
  readonly materials: MaterialRecord[] = [];

  createWithJob(input: CreateMaterialInput): Promise<MaterialRecord> {
    const now = new Date();
    const material: MaterialRecord = {
      id: `material-${this.materials.length + 1}`,
      ...input,
      status: 'PROCESSING',
      chunkCount: 0,
      processingError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.materials.push(material);
    return Promise.resolve(material);
  }

  listByUser(userId: string): Promise<MaterialRecord[]> {
    return Promise.resolve(this.materials.filter((material) => material.userId === userId));
  }

  findByIdForUser(id: string, userId: string): Promise<MaterialRecord | null> {
    return Promise.resolve(this.materials.find((material) => material.id === id && material.userId === userId) ?? null);
  }

  deleteByIdForUser(id: string, userId: string): Promise<MaterialRecord | null> {
    const index = this.materials.findIndex((material) => material.id === id && material.userId === userId);
    if (index < 0) return Promise.resolve(null);
    return Promise.resolve(this.materials.splice(index, 1)[0] ?? null);
  }
}

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('MaterialService', () => {
  it('validates and stores an upload while creating a queued material record', async () => {
    const repository = new MemoryMaterialRepository();
    const storageDirectory = path.join(tmpdir(), `studymate-material-${crypto.randomUUID()}`);
    createdDirectories.push(storageDirectory);
    const service = new MaterialService(repository, storageDirectory);

    const material = await service.upload('user-1', {
      originalName: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('\uFEFFActive recall improves memory.\r\n'),
    });

    expect(material).toMatchObject({
      userId: 'user-1',
      originalName: 'notes.txt',
      extension: 'txt',
      status: 'PROCESSING',
      size: 35,
    });
    expect(material.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(material.storagePath, 'utf8')).toContain('Active recall');
  });

  it('never exposes another user material and removes owned files on delete', async () => {
    const repository = new MemoryMaterialRepository();
    const storageDirectory = path.join(tmpdir(), `studymate-material-${crypto.randomUUID()}`);
    createdDirectories.push(storageDirectory);
    const deletedVectors: string[] = [];
    const service = new MaterialService(repository, storageDirectory, {
      deleteMaterial: (userId, materialId) => {
        deletedVectors.push(`${userId}:${materialId}`);
        return Promise.resolve();
      },
    });
    const material = await service.upload('owner', {
      originalName: 'safe.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Only the owner should see this.'),
    });

    await expect(service.get('other-user', material.id)).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
    await service.remove('owner', material.id);

    expect(deletedVectors).toEqual([`owner:${material.id}`]);
    await expect(access(material.storagePath)).rejects.toBeDefined();
    expect(await service.list('owner')).toEqual([]);
  });
});
