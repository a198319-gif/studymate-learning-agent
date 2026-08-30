import { env } from '../../config/env.js';
import type { EmbeddingProvider, VectorStore } from '../materials/material-processor.js';
import type { RetrievalService } from './grounded-study-agent.js';

export class VectorRetrievalService implements RetrievalService {
  constructor(
    private readonly embeddings: EmbeddingProvider,
    private readonly vectors: VectorStore,
  ) {}

  async search(input: { userId: string; materialIds: string[]; query: string; mode?: 'semantic' | 'selected' }) {
    if (input.materialIds.length === 0) return [];
    const vector = await this.embeddings.embedQuery(input.query);
    return this.vectors.search({
      userId: input.userId,
      materialIds: input.materialIds,
      vector,
      limit: env.RETRIEVAL_TOP_K,
      scoreThreshold: input.mode === 'selected' ? 0 : env.RETRIEVAL_SCORE_THRESHOLD,
    });
  }
}
