import { randomUUID } from 'node:crypto';

import type { CreateMaterialInput, MaterialRecord, MaterialRepository } from '../modules/materials/material.service.js';
import type { LocalMaterial, LocalProcessingJob } from './local-state.js';
import type { LocalStore } from './local-store.js';

function toMaterialRecord(material: LocalMaterial): MaterialRecord {
  return { ...material, createdAt: new Date(material.createdAt), updatedAt: new Date(material.updatedAt) };
}

export class LocalMaterialRepository implements MaterialRepository {
  constructor(private readonly store: LocalStore) {}

  createWithJob(input: CreateMaterialInput): Promise<MaterialRecord> {
    return this.store.update((state) => {
      const now = new Date().toISOString();
      const material: LocalMaterial = {
        id: randomUUID(), ...input, status: 'PROCESSING', chunkCount: 0,
        processingError: null, createdAt: now, updatedAt: now,
      };
      const job: LocalProcessingJob = {
        id: randomUUID(), materialId: material.id, userId: input.userId, stage: 'QUEUED',
        attempts: 0, maxAttempts: 3, lockedAt: null, lockedBy: null, errorCode: null,
        createdAt: now, updatedAt: now,
      };
      state.materials.push(material);
      state.processingJobs.push(job);
      return toMaterialRecord(material);
    });
  }

  async listByUser(userId: string): Promise<MaterialRecord[]> {
    return (await this.store.read()).materials
      .filter((material) => material.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(toMaterialRecord);
  }

  async findByIdForUser(id: string, userId: string): Promise<MaterialRecord | null> {
    const material = (await this.store.read()).materials.find((candidate) => candidate.id === id && candidate.userId === userId);
    return material ? toMaterialRecord(material) : null;
  }

  deleteByIdForUser(id: string, userId: string): Promise<MaterialRecord | null> {
    return this.store.update((state) => {
      const index = state.materials.findIndex((material) => material.id === id && material.userId === userId);
      if (index < 0) return null;
      const [material] = state.materials.splice(index, 1);
      state.processingJobs = state.processingJobs.filter((job) => job.materialId !== id);
      return material ? toMaterialRecord(material) : null;
    });
  }
}
