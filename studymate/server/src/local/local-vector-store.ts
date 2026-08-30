import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { VectorChunk, VectorStore } from '../modules/materials/material-processor.js';
import { AppError } from '../shared/app-error.js';

const storedChunkSchema = z.object({
  userId: z.string(), materialId: z.string(), sourceName: z.string(),
  chunkIndex: z.number().int(), text: z.string(), vector: z.array(z.number()),
});

const vectorStateSchema = z.object({
  version: z.literal(1),
  dimensions: z.number().int().positive(),
  chunks: z.array(storedChunkSchema),
});

type VectorState = z.infer<typeof vectorStateSchema>;

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftSquared += leftValue * leftValue;
    rightSquared += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftSquared) * Math.sqrt(rightSquared);
  return denominator === 0 ? 0 : dot / denominator;
}

export class LocalVectorStore implements VectorStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly statePath: string,
    private readonly dimensions: number,
  ) {}

  async ensureCollection(): Promise<void> {
    await this.queue;
    await this.load();
  }

  replaceMaterial(chunks: VectorChunk[]): Promise<void> {
    if (chunks.length === 0) return Promise.resolve();
    return this.mutate((state) => {
      const keys = new Set(chunks.map((chunk) => `${chunk.userId}\0${chunk.materialId}`));
      state.chunks = state.chunks.filter((chunk) => !keys.has(`${chunk.userId}\0${chunk.materialId}`));
      for (const chunk of chunks) {
        this.assertDimensions(chunk.vector);
        state.chunks.push({ ...chunk });
      }
    });
  }

  deleteMaterial(userId: string, materialId: string): Promise<void> {
    return this.mutate((state) => {
      state.chunks = state.chunks.filter((chunk) => chunk.userId !== userId || chunk.materialId !== materialId);
    });
  }

  async search(input: { userId: string; materialIds: string[]; vector: number[]; limit: number; scoreThreshold: number }) {
    if (input.materialIds.length === 0) return [];
    this.assertDimensions(input.vector);
    await this.queue;
    const selected = new Set(input.materialIds);
    const state = await this.load();
    return state.chunks
      .filter((chunk) => chunk.userId === input.userId && selected.has(chunk.materialId))
      .map((chunk) => ({
        materialId: chunk.materialId,
        sourceName: chunk.sourceName,
        text: chunk.text,
        score: cosine(chunk.vector, input.vector),
      }))
      .filter((chunk) => chunk.score >= input.scoreThreshold)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit);
  }

  async flush(): Promise<void> {
    await this.queue;
  }

  private mutate(mutator: (state: VectorState) => void): Promise<void> {
    const operation = this.queue.then(async () => {
      const state = await this.load();
      mutator(state);
      await this.atomicWrite(state);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async load(): Promise<VectorState> {
    let raw: string;
    try {
      raw = await readFile(this.statePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, dimensions: this.dimensions, chunks: [] };
      }
      throw error;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      throw new AppError(500, 'LOCAL_VECTOR_STATE_INVALID', 'The local vector data is invalid.');
    }
    const parsed = vectorStateSchema.safeParse(value);
    if (!parsed.success) throw new AppError(500, 'LOCAL_VECTOR_STATE_INVALID', 'The local vector data is invalid.');
    if (parsed.data.dimensions !== this.dimensions) {
      throw new AppError(500, 'VECTOR_DIMENSION_MISMATCH', 'The vector collection dimensions do not match the embedding provider.');
    }
    for (const chunk of parsed.data.chunks) this.assertDimensions(chunk.vector);
    return parsed.data;
  }

  private assertDimensions(vector: number[]): void {
    if (vector.length !== this.dimensions) {
      throw new AppError(500, 'VECTOR_DIMENSION_MISMATCH', 'The vector collection dimensions do not match the embedding provider.');
    }
  }

  private async atomicWrite(state: VectorState): Promise<void> {
    const directory = path.dirname(this.statePath);
    const temporaryPath = `${this.statePath}.tmp-${process.pid}-${randomUUID()}`;
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(temporaryPath, JSON.stringify(state), { encoding: 'utf8', flag: 'wx' });
      await rename(temporaryPath, this.statePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
