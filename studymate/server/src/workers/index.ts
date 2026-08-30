import { hostname } from 'node:os';

import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { LocalEmbeddingProvider } from '../modules/materials/local-embedding.js';
import { MaterialProcessor } from '../modules/materials/material-processor.js';
import { PrismaProcessingRepository } from '../modules/materials/processing.repository.js';
import { QdrantVectorStore } from '../modules/materials/qdrant-vector-store.js';

const workerId = `${hostname()}-${process.pid}`;
const repository = new PrismaProcessingRepository();
const embeddings = new LocalEmbeddingProvider();
const vectors = new QdrantVectorStore(env.QDRANT_URL, env.QDRANT_COLLECTION, embeddings.dimensions);
const processor = new MaterialProcessor(repository, embeddings, vectors);
let timer: NodeJS.Timeout | undefined;
let stopping = false;

async function poll(): Promise<void> {
  if (stopping) return;
  try {
    await vectors.ensureCollection();
    const job = await repository.claimNext(workerId);
    if (job) await processor.process(job);
  } catch (error) {
    console.error('[worker] poll failed', error instanceof Error ? error.message : 'Unknown error');
  } finally {
    if (!stopping) timer = setTimeout(() => void poll(), 1_500);
  }
}

async function shutdown(): Promise<void> {
  stopping = true;
  if (timer) clearTimeout(timer);
  await prisma.$disconnect();
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

console.info(`[worker] StudyMate processor ${workerId} is ready.`);
void poll();
