import { describe, expect, it, vi } from 'vitest';

import { env } from '../src/config/env.js';
import type { EmbeddingProvider, VectorStore } from '../src/modules/materials/material-processor.js';
import { VectorRetrievalService } from '../src/modules/study/vector-retrieval.service.js';

const embeddings: EmbeddingProvider = {
  dimensions: 2,
  embedPassages: () => Promise.resolve([]),
  embedQuery: () => Promise.resolve([1, 0]),
};

function vectorStore() {
  return {
    ensureCollection: () => Promise.resolve(),
    replaceMaterial: () => Promise.resolve(),
    deleteMaterial: () => Promise.resolve(),
    search: vi.fn<VectorStore['search']>().mockResolvedValue([]),
  } satisfies VectorStore;
}

describe('VectorRetrievalService', () => {
  it('keeps the relevance threshold for questions but includes selected material content for generation', async () => {
    const vectors = vectorStore();
    const service = new VectorRetrievalService(embeddings, vectors);

    await service.search({ userId: 'user-1', materialIds: ['material-1'], query: 'unrelated question' });
    await service.search({ userId: 'user-1', materialIds: ['material-1'], query: 'create a quiz', mode: 'selected' });

    expect(vectors.search.mock.calls[0]?.[0].scoreThreshold).toBe(env.RETRIEVAL_SCORE_THRESHOLD);
    expect(vectors.search.mock.calls[1]?.[0].scoreThreshold).toBe(0);
  });
});
