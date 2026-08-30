import { createHash } from 'node:crypto';

import { QdrantClient } from '@qdrant/js-client-rest';
import { z } from 'zod';

import type { VectorChunk, VectorStore } from './material-processor.js';
import { AppError } from '../../shared/app-error.js';

const pointSchema = z.object({
  score: z.number(),
  payload: z.object({
    materialId: z.string(),
    sourceName: z.string(),
    text: z.string(),
  }),
});

const collectionSchema = z.object({
  config: z.object({ params: z.object({ vectors: z.object({ size: z.number() }) }) }),
});

function stablePointId(materialId: string, chunkIndex: number): string {
  const value = createHash('sha256').update(`${materialId}:${chunkIndex}`).digest('hex').slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20)}`;
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

export class QdrantVectorStore implements VectorStore {
  private readonly client: QdrantClient;

  constructor(
    url: string,
    private readonly collection: string,
    private readonly dimensions: number,
  ) {
    this.client = new QdrantClient({ url, checkCompatibility: false });
  }

  async ensureCollection(): Promise<void> {
    let exists = false;
    try {
      const collection = collectionSchema.safeParse(await this.client.getCollection(this.collection));
      if (collection.success && collection.data.config.params.vectors.size !== this.dimensions) {
        throw new AppError(503, 'VECTOR_DIMENSION_MISMATCH', 'The vector collection dimensions do not match the embedding provider.');
      }
      exists = true;
    } catch (error) {
      if (statusCode(error) !== 404) throw error;
    }
    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: { size: this.dimensions, distance: 'Cosine' },
        on_disk_payload: true,
      });
    }
    for (const fieldName of ['userId', 'materialId', 'chunkId']) {
      await this.client.createPayloadIndex(this.collection, {
        field_name: fieldName, field_schema: 'keyword', wait: true,
      }).catch((error: unknown) => {
        if (statusCode(error) !== 409) throw error;
      });
    }
  }

  async replaceMaterial(chunks: VectorChunk[]): Promise<void> {
    const first = chunks[0];
    if (!first) return;
    await this.deleteMaterial(first.userId, first.materialId);
    await this.client.upsert(this.collection, {
      wait: true,
      points: chunks.map((chunk) => ({
        id: stablePointId(chunk.materialId, chunk.chunkIndex),
        vector: chunk.vector,
        payload: {
          userId: chunk.userId,
          materialId: chunk.materialId,
          chunkId: stablePointId(chunk.materialId, chunk.chunkIndex),
          sourceName: chunk.sourceName,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
        },
      })),
    });
  }

  async deleteMaterial(userId: string, materialId: string): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: [
        { key: 'userId', match: { value: userId } },
        { key: 'materialId', match: { value: materialId } },
      ] },
    });
  }

  async search(input: { userId: string; materialIds: string[]; vector: number[]; limit: number; scoreThreshold: number }) {
    if (input.materialIds.length === 0) return [];
    const result = await this.client.query(this.collection, {
      query: input.vector,
      filter: { must: [
        { key: 'userId', match: { value: input.userId } },
        { key: 'materialId', match: { any: input.materialIds } },
      ] },
      limit: input.limit,
      score_threshold: input.scoreThreshold,
      with_payload: true,
      with_vector: false,
    });
    return result.points.flatMap((point) => {
      const parsed = pointSchema.safeParse(point);
      return parsed.success ? [{ ...parsed.data.payload, score: parsed.data.score }] : [];
    });
  }
}
