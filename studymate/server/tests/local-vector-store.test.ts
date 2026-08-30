import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalVectorStore } from '../src/local/local-vector-store.js';

const directories: string[] = [];

function vectorPath(): string {
  const directory = path.join(tmpdir(), `studymate-local-vectors-${crypto.randomUUID()}`);
  directories.push(directory);
  return path.join(directory, 'vectors.json');
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('LocalVectorStore', () => {
  it('filters search by user and selected material before ranking', async () => {
    const vectors = new LocalVectorStore(vectorPath(), 2);
    await vectors.replaceMaterial([
      { userId: 'user-a', materialId: 'material-a', sourceName: 'a.txt', chunkIndex: 0, text: 'owned', vector: [1, 0] },
      { userId: 'user-b', materialId: 'material-b', sourceName: 'b.txt', chunkIndex: 0, text: 'foreign', vector: [1, 0] },
    ]);

    const result = await vectors.search({
      userId: 'user-a', materialIds: ['material-a', 'material-b'], vector: [1, 0], limit: 8, scoreThreshold: 0.3,
    });

    expect(result).toEqual([{ materialId: 'material-a', sourceName: 'a.txt', text: 'owned', score: 1 }]);
  });

  it('reloads vectors and removes only the requested owned material', async () => {
    const statePath = vectorPath();
    const first = new LocalVectorStore(statePath, 2);
    await first.replaceMaterial([
      { userId: 'user-a', materialId: 'material-a', sourceName: 'a.txt', chunkIndex: 0, text: 'owned', vector: [0, 1] },
    ]);
    await first.flush();

    const reloaded = new LocalVectorStore(statePath, 2);
    expect(await reloaded.search({ userId: 'user-a', materialIds: ['material-a'], vector: [0, 1], limit: 1, scoreThreshold: 0 }))
      .toHaveLength(1);
    await reloaded.deleteMaterial('user-b', 'material-a');
    expect(await reloaded.search({ userId: 'user-a', materialIds: ['material-a'], vector: [0, 1], limit: 1, scoreThreshold: 0 }))
      .toHaveLength(1);
    await reloaded.deleteMaterial('user-a', 'material-a');
    expect(await reloaded.search({ userId: 'user-a', materialIds: ['material-a'], vector: [0, 1], limit: 1, scoreThreshold: 0 }))
      .toEqual([]);
  });
});
