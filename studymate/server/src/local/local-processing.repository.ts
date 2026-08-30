import { randomUUID } from 'node:crypto';

import type { ProcessingJobRecord, ProcessingRepository } from '../modules/materials/material-processor.js';
import { AppError } from '../shared/app-error.js';
import type { LocalStore } from './local-store.js';

export interface ClaimableProcessingRepository extends ProcessingRepository {
  claimNext(workerId: string): Promise<ProcessingJobRecord | null>;
}

function leaseLost(): AppError {
  return new AppError(409, 'JOB_LEASE_LOST', 'The processing lease is no longer owned.');
}

export class LocalProcessingRepository implements ClaimableProcessingRepository {
  constructor(private readonly store: LocalStore) {}

  claimNext(workerId: string): Promise<ProcessingJobRecord | null> {
    return this.store.update((state) => {
      const staleBefore = Date.now() - 30 * 60_000;
      const job = state.processingJobs
        .filter((candidate) => candidate.attempts < candidate.maxAttempts)
        .filter((candidate) => candidate.stage === 'QUEUED' || (
          ['EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING'].includes(candidate.stage) &&
          candidate.lockedAt !== null && new Date(candidate.lockedAt).getTime() < staleBefore
        ))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
      if (!job) return null;
      const material = state.materials.find((candidate) => candidate.id === job.materialId && candidate.userId === job.userId);
      if (!material) return null;
      const now = new Date().toISOString();
      job.stage = 'EXTRACTING';
      job.lockedAt = now;
      job.lockedBy = `${workerId}:${randomUUID()}`;
      job.updatedAt = now;
      return {
        id: job.id,
        lockOwner: job.lockedBy,
        material: {
          id: material.id,
          userId: material.userId,
          originalName: material.originalName,
          storagePath: material.storagePath,
          extension: material.extension,
        },
      };
    });
  }

  setStage(jobId: string, lockOwner: string, stage: 'CHUNKING' | 'EMBEDDING' | 'INDEXING'): Promise<void> {
    return this.store.update((state) => {
      const job = state.processingJobs.find((candidate) => candidate.id === jobId && candidate.lockedBy === lockOwner);
      if (!job) throw leaseLost();
      const now = new Date().toISOString();
      job.stage = stage;
      job.lockedAt = now;
      job.updatedAt = now;
    });
  }

  complete(jobId: string, lockOwner: string, materialId: string, chunkCount: number): Promise<void> {
    return this.store.update((state) => {
      const job = state.processingJobs.find((candidate) => candidate.id === jobId && candidate.lockedBy === lockOwner);
      if (!job) throw leaseLost();
      const material = state.materials.find((candidate) => candidate.id === materialId);
      if (!material) throw new AppError(404, 'MATERIAL_NOT_FOUND', 'Material not found.');
      const now = new Date().toISOString();
      job.stage = 'COMPLETE';
      job.lockedAt = null;
      job.lockedBy = null;
      job.errorCode = null;
      job.updatedAt = now;
      material.status = 'READY';
      material.chunkCount = chunkCount;
      material.processingError = null;
      material.updatedAt = now;
    });
  }

  fail(jobId: string, lockOwner: string, materialId: string, errorCode: string): Promise<void> {
    return this.store.update((state) => {
      const job = state.processingJobs.find((candidate) => candidate.id === jobId && candidate.lockedBy === lockOwner);
      if (!job) return;
      const material = state.materials.find((candidate) => candidate.id === materialId);
      if (!material) return;
      const now = new Date().toISOString();
      job.attempts += 1;
      const terminal = job.attempts >= job.maxAttempts;
      job.stage = terminal ? 'FAILED' : 'QUEUED';
      job.lockedAt = null;
      job.lockedBy = null;
      job.errorCode = errorCode;
      job.updatedAt = now;
      material.status = terminal ? 'FAILED' : 'PROCESSING';
      material.processingError = terminal ? errorCode : null;
      material.updatedAt = now;
    });
  }
}
