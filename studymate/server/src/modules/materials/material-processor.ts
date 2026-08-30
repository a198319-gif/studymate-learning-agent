import { readFile } from 'node:fs/promises';

import { AppError } from '../../shared/app-error.js';
import { chunkText, extractDocument, type SupportedExtension } from './document-processing.js';

export type ProcessingJobRecord = {
  id: string;
  lockOwner: string;
  material: {
    id: string;
    userId: string;
    originalName: string;
    storagePath: string;
    extension: string;
  };
};

export interface ProcessingRepository {
  setStage(jobId: string, lockOwner: string, stage: 'CHUNKING' | 'EMBEDDING' | 'INDEXING'): Promise<void>;
  complete(jobId: string, lockOwner: string, materialId: string, chunkCount: number): Promise<void>;
  fail(jobId: string, lockOwner: string, materialId: string, errorCode: string): Promise<void>;
}

export interface EmbeddingProvider {
  readonly dimensions: number;
  embedPassages(passages: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}

export type VectorChunk = {
  userId: string;
  materialId: string;
  sourceName: string;
  chunkIndex: number;
  text: string;
  vector: number[];
};

export interface VectorStore {
  ensureCollection(): Promise<void>;
  replaceMaterial(chunks: VectorChunk[]): Promise<void>;
  deleteMaterial(userId: string, materialId: string): Promise<void>;
  search(input: { userId: string; materialIds: string[]; vector: number[]; limit: number; scoreThreshold: number }): Promise<Array<{ materialId: string; sourceName: string; text: string; score: number }>>;
}

type ProcessorDependencies = {
  readFile?: (path: string) => Promise<Buffer>;
  extract?: (buffer: Buffer, extension: SupportedExtension) => Promise<string>;
};

export class MaterialProcessor {
  private readonly loadFile: (path: string) => Promise<Buffer>;
  private readonly extractText: (buffer: Buffer, extension: SupportedExtension) => Promise<string>;

  constructor(
    private readonly repository: ProcessingRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly vectors: VectorStore,
    dependencies: ProcessorDependencies = {},
  ) {
    this.loadFile = dependencies.readFile ?? readFile;
    this.extractText = dependencies.extract ?? extractDocument;
  }

  async process(job: ProcessingJobRecord): Promise<void> {
    try {
      const buffer = await this.loadFile(job.material.storagePath);
      const text = await this.extractText(buffer, job.material.extension as SupportedExtension);
      await this.repository.setStage(job.id, job.lockOwner, 'CHUNKING');
      const chunks = chunkText(text);
      if (chunks.length === 0) {
        throw new AppError(422, 'MATERIAL_TEXT_EMPTY', 'No readable text was found in this file.');
      }
      await this.repository.setStage(job.id, job.lockOwner, 'EMBEDDING');
      const embeddings = await this.embeddings.embedPassages(chunks);
      if (embeddings.length !== chunks.length) throw new Error('Embedding count mismatch.');
      await this.repository.setStage(job.id, job.lockOwner, 'INDEXING');
      await this.vectors.replaceMaterial(chunks.map((chunk, index) => ({
        userId: job.material.userId,
        materialId: job.material.id,
        sourceName: job.material.originalName,
        chunkIndex: index,
        text: chunk,
        vector: embeddings[index] ?? [],
      })));
      await this.repository.complete(job.id, job.lockOwner, job.material.id, chunks.length);
    } catch (error) {
      if (error instanceof AppError && error.code === 'JOB_LEASE_LOST') return;
      await this.vectors.deleteMaterial(job.material.userId, job.material.id).catch(() => undefined);
      const errorCode = error instanceof AppError ? error.code : 'MATERIAL_PROCESSING_FAILED';
      await this.repository.fail(job.id, job.lockOwner, job.material.id, errorCode);
    }
  }
}
