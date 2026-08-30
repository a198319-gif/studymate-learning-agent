import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import type { GeneratedArtifact, GenerationRepository } from './generation.service.js';

const contentSchema = z.object({
  text: z.string(),
  sources: z.array(z.string()),
  groundingStatus: z.enum(['GROUNDED', 'INSUFFICIENT']),
});

const idsSchema = z.array(z.string());

function toArtifact(row: Awaited<ReturnType<typeof prisma.generatedContent.findFirst>>): GeneratedArtifact | null {
  if (!row) return null;
  const content = contentSchema.safeParse(row.content);
  const materialIds = idsSchema.safeParse(row.materialIds);
  if (!content.success || !materialIds.success) return null;
  return {
    id: row.id, userId: row.userId, type: row.type, title: row.title,
    materialIds: materialIds.data, text: content.data.text, sources: content.data.sources,
    groundingStatus: content.data.groundingStatus, createdAt: row.createdAt,
  };
}

export class PrismaGenerationRepository implements GenerationRepository {
  async readyMaterialIds(userId: string, materialIds: string[]): Promise<string[]> {
    const rows = await prisma.material.findMany({
      where: { userId, id: { in: materialIds }, status: 'READY' },
      select: { id: true },
    });
    const owned = new Set(rows.map((row) => row.id));
    return materialIds.filter((id) => owned.has(id));
  }

  async save(artifact: Omit<GeneratedArtifact, 'id' | 'createdAt'>): Promise<GeneratedArtifact> {
    const row = await prisma.generatedContent.create({
      data: {
        userId: artifact.userId,
        type: artifact.type,
        title: artifact.title,
        materialIds: artifact.materialIds,
        content: {
          text: artifact.text,
          sources: artifact.sources,
          groundingStatus: artifact.groundingStatus,
        },
      },
    });
    return { ...artifact, id: row.id, createdAt: row.createdAt };
  }

  async list(userId: string): Promise<GeneratedArtifact[]> {
    const rows = await prisma.generatedContent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.flatMap((row) => toArtifact(row) ?? []);
  }

  async get(id: string, userId: string): Promise<GeneratedArtifact | null> {
    return toArtifact(await prisma.generatedContent.findFirst({ where: { id, userId } }));
  }
}
