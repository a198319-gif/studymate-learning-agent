import type { Material } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import type {
  CreateMaterialInput,
  MaterialRecord,
  MaterialRepository,
} from './material.service.js';

function toRecord(material: Material): MaterialRecord {
  return {
    ...material,
    status: material.status,
  };
}

export class PrismaMaterialRepository implements MaterialRepository {
  async createWithJob(input: CreateMaterialInput): Promise<MaterialRecord> {
    const material = await prisma.$transaction(async (transaction) => {
      const created = await transaction.material.create({ data: input });
      await transaction.processingJob.create({
        data: { materialId: created.id, userId: created.userId },
      });
      return created;
    });
    return toRecord(material);
  }

  async listByUser(userId: string): Promise<MaterialRecord[]> {
    const materials = await prisma.material.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return materials.map(toRecord);
  }

  async findByIdForUser(id: string, userId: string): Promise<MaterialRecord | null> {
    const material = await prisma.material.findFirst({ where: { id, userId } });
    return material ? toRecord(material) : null;
  }

  async deleteByIdForUser(id: string, userId: string): Promise<MaterialRecord | null> {
    return prisma.$transaction(async (transaction) => {
      const material = await transaction.material.findFirst({ where: { id, userId } });
      if (!material) return null;
      await transaction.material.delete({ where: { id: material.id } });
      return toRecord(material);
    });
  }
}
