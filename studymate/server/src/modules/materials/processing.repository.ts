import type { ProcessingStage } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { prisma } from '../../config/prisma.js';
import { AppError } from '../../shared/app-error.js';
import type { ProcessingJobRecord, ProcessingRepository } from './material-processor.js';

export class PrismaProcessingRepository implements ProcessingRepository {
  async claimNext(workerId: string): Promise<ProcessingJobRecord | null> {
    const leaseExpiredBefore = new Date(Date.now() - 30 * 60_000);
    const lockOwner = `${workerId}:${randomUUID()}`;
    const candidate = await prisma.processingJob.findFirst({
      where: {
        OR: [
          { stage: 'QUEUED', lockedAt: null },
          {
            stage: { in: ['EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING'] },
            lockedAt: { lt: leaseExpiredBefore },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: { material: true },
    });
    if (!candidate || candidate.attempts >= candidate.maxAttempts) return null;
    const claimed = await prisma.processingJob.updateMany({
      where: { id: candidate.id, stage: candidate.stage, lockedAt: candidate.lockedAt },
      data: { stage: 'EXTRACTING', lockedAt: new Date(), lockedBy: lockOwner },
    });
    if (claimed.count !== 1) return null;
    return {
      id: candidate.id,
      lockOwner,
      material: {
        id: candidate.material.id,
        userId: candidate.material.userId,
        originalName: candidate.material.originalName,
        storagePath: candidate.material.storagePath,
        extension: candidate.material.extension,
      },
    };
  }

  async setStage(jobId: string, lockOwner: string, stage: 'CHUNKING' | 'EMBEDDING' | 'INDEXING'): Promise<void> {
    const updated = await prisma.processingJob.updateMany({
      where: { id: jobId, lockedBy: lockOwner }, data: { stage, lockedAt: new Date() },
    });
    if (updated.count !== 1) throw new AppError(409, 'JOB_LEASE_LOST', 'The processing lease is no longer owned.');
  }

  async complete(jobId: string, lockOwner: string, materialId: string, chunkCount: number): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.processingJob.updateMany({
        where: { id: jobId, lockedBy: lockOwner }, data: { stage: 'COMPLETE', lockedAt: null, lockedBy: null },
      });
      if (updated.count !== 1) throw new AppError(409, 'JOB_LEASE_LOST', 'The processing lease is no longer owned.');
      await transaction.material.update({
        where: { id: materialId },
        data: { status: 'READY', chunkCount, processingError: null },
      });
    });
  }

  async fail(jobId: string, lockOwner: string, materialId: string, errorCode: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      const job = await transaction.processingJob.findFirst({ where: { id: jobId, lockedBy: lockOwner } });
      if (!job) return;
      const attempts = job.attempts + 1;
      const terminal = attempts >= job.maxAttempts;
      const stage: ProcessingStage = terminal ? 'FAILED' : 'QUEUED';
      await transaction.processingJob.update({
        where: { id: jobId },
        data: { attempts, stage, lockedAt: null, lockedBy: null, errorCode },
      });
      await transaction.material.update({
        where: { id: materialId },
        data: {
          status: terminal ? 'FAILED' : 'PROCESSING',
          processingError: terminal ? errorCode : null,
        },
      });
    });
  }
}
