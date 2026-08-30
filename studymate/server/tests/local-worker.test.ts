import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalUserRepository } from '../src/local/local-auth.repository.js';
import { LocalMaterialRepository } from '../src/local/local-material.repository.js';
import { LocalProcessingRepository } from '../src/local/local-processing.repository.js';
import { LocalStore } from '../src/local/local-store.js';
import { LocalVectorStore } from '../src/local/local-vector-store.js';
import { LocalWorker } from '../src/local/local-worker.js';
import { LocalEmbeddingProvider } from '../src/modules/materials/local-embedding.js';
import { MaterialProcessor } from '../src/modules/materials/material-processor.js';

const directories: string[] = [];

async function fixture(content: string) {
  const directory = path.join(tmpdir(), `studymate-local-worker-${crypto.randomUUID()}`);
  directories.push(directory);
  await mkdir(directory, { recursive: true });
  const storagePath = path.join(directory, 'notes.txt');
  await writeFile(storagePath, content, 'utf8');
  const store = new LocalStore(path.join(directory, 'state.json'));
  const users = new LocalUserRepository(store);
  const owner = await users.create({ name: 'Owner', email: 'owner@example.com', passwordHash: 'hash' });
  const materials = new LocalMaterialRepository(store);
  const material = await materials.createWithJob({
    userId: owner.id, originalName: 'notes.txt', storedName: 'notes.txt', storagePath,
    mimeType: 'text/plain', extension: 'txt', size: Buffer.byteLength(content), checksum: 'checksum',
  });
  const processing = new LocalProcessingRepository(store);
  const embeddings = new LocalEmbeddingProvider();
  const vectors = new LocalVectorStore(path.join(directory, 'vectors.json'), embeddings.dimensions);
  const processor = new MaterialProcessor(processing, embeddings, vectors);
  const worker = new LocalWorker(processing, processor, store);
  return { owner, material, materials, vectors, embeddings, worker };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('LocalWorker', () => {
  it('processes a queued TXT material into searchable READY content', async () => {
    const { owner, material, materials, vectors, embeddings, worker } = await fixture('Spaced practice improves long-term retention.');

    expect(await worker.tick()).toBe(true);
    await expect(materials.findByIdForUser(material.id, owner.id)).resolves.toMatchObject({ status: 'READY', chunkCount: 1 });
    const matches = await vectors.search({
      userId: owner.id, materialIds: [material.id], vector: await embeddings.embedQuery('retention'), limit: 8, scoreThreshold: 0,
    });
    expect(matches[0]).toMatchObject({ materialId: material.id, sourceName: 'notes.txt' });
  });

  it('marks an unreadable material FAILED after the bounded attempts', async () => {
    const { owner, material, materials, worker } = await fixture('');

    expect(await worker.tick()).toBe(true);
    expect(await worker.tick()).toBe(true);
    expect(await worker.tick()).toBe(true);

    await expect(materials.findByIdForUser(material.id, owner.id)).resolves.toMatchObject({
      status: 'FAILED', processingError: 'MATERIAL_TEXT_EMPTY',
    });
  });
});
