import { describe, expect, it } from 'vitest';

import {
  MaterialProcessor,
  type EmbeddingProvider,
  type ProcessingJobRecord,
  type ProcessingRepository,
  type VectorChunk,
  type VectorStore,
} from '../src/modules/materials/material-processor.js';

class FakeProcessingRepository implements ProcessingRepository {
  readonly stages: string[] = [];
  completed: { jobId: string; materialId: string; chunkCount: number } | null = null;
  failed: { jobId: string; materialId: string; errorCode: string } | null = null;
  setStage(jobId: string, lockOwner: string, stage: string) { void jobId; void lockOwner; this.stages.push(stage); return Promise.resolve(); }
  complete(jobId: string, lockOwner: string, materialId: string, chunkCount: number) { void lockOwner; this.completed = { jobId, materialId, chunkCount }; return Promise.resolve(); }
  fail(jobId: string, lockOwner: string, materialId: string, errorCode: string) { void lockOwner; this.failed = { jobId, materialId, errorCode }; return Promise.resolve(); }
}

class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 3;
  embedPassages(passages: string[]) { return Promise.resolve(passages.map((_passage, index) => [index + 1, 0, 0])); }
  embedQuery(query: string) { void query; return Promise.resolve([1, 0, 0]); }
}

class FakeVectorStore implements VectorStore {
  chunks: VectorChunk[] = [];
  deleted: string[] = [];
  ensureCollection() { return Promise.resolve(); }
  replaceMaterial(chunks: VectorChunk[]) { this.chunks = chunks; return Promise.resolve(); }
  deleteMaterial(_userId: string, materialId: string) { this.deleted.push(materialId); return Promise.resolve(); }
  search() { return Promise.resolve([]); }
}

const job: ProcessingJobRecord = {
  id: 'job-1',
  lockOwner: 'worker:test-lock',
  material: {
    id: 'material-1', userId: 'user-1', originalName: 'notes.txt', storagePath: '/unused/notes.txt', extension: 'txt',
  },
};

describe('MaterialProcessor', () => {
  it('extracts, chunks, embeds, indexes, and completes a material', async () => {
    const repository = new FakeProcessingRepository();
    const vectors = new FakeVectorStore();
    const processor = new MaterialProcessor(repository, new FakeEmbeddingProvider(), vectors, {
      readFile: () => Promise.resolve(Buffer.from('unused')),
      extract: () => Promise.resolve(Array.from({ length: 500 }, (_, index) => `word${index}`).join(' ')),
    });

    await processor.process(job);

    expect(repository.stages).toEqual(['CHUNKING', 'EMBEDDING', 'INDEXING']);
    expect(vectors.chunks).toHaveLength(2);
    expect(vectors.chunks[0]).toMatchObject({ userId: 'user-1', materialId: 'material-1', sourceName: 'notes.txt', chunkIndex: 0 });
    expect(repository.completed).toEqual({ jobId: 'job-1', materialId: 'material-1', chunkCount: 2 });
  });

  it('cleans partial vectors and records a stable error code on failure', async () => {
    const repository = new FakeProcessingRepository();
    const vectors = new FakeVectorStore();
    const processor = new MaterialProcessor(repository, new FakeEmbeddingProvider(), vectors, {
      readFile: () => Promise.reject(new Error('private filesystem details')),
    });

    await processor.process(job);

    expect(vectors.deleted).toEqual(['material-1']);
    expect(repository.failed).toEqual({ jobId: 'job-1', materialId: 'material-1', errorCode: 'MATERIAL_PROCESSING_FAILED' });
  });
});
