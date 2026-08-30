import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalUserRepository } from '../src/local/local-auth.repository.js';
import { LocalMaterialRepository } from '../src/local/local-material.repository.js';
import { LocalProcessingRepository } from '../src/local/local-processing.repository.js';
import { LocalStore } from '../src/local/local-store.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const directories: string[] = [];
const jwtSecret = 'local-test-jwt-secret-with-at-least-32-characters';

function localStore() {
  const directory = path.join(tmpdir(), `studymate-local-repositories-${crypto.randomUUID()}`);
  directories.push(directory);
  return { directory, store: new LocalStore(path.join(directory, 'state.json')) };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local repositories', () => {
  it('persists an account that can log in after a repository reload', async () => {
    const { directory, store } = localStore();
    const auth = new AuthService(new LocalUserRepository(store), jwtSecret);
    await auth.register({ name: 'Ada', email: 'ADA@example.com', password: 'password123' });
    await store.flush();

    const reloaded = new AuthService(
      new LocalUserRepository(new LocalStore(path.join(directory, 'state.json'))),
      jwtSecret,
    );

    await expect(reloaded.login({ email: 'ada@example.com', password: 'password123' }))
      .resolves.toMatchObject({ user: { name: 'Ada', email: 'ada@example.com' } });
  });

  it('creates a processing job atomically and isolates material ownership', async () => {
    const { store } = localStore();
    const users = new LocalUserRepository(store);
    const owner = await users.create({ name: 'Owner', email: 'owner@example.com', passwordHash: 'hash' });
    const materials = new LocalMaterialRepository(store);

    const created = await materials.createWithJob({
      userId: owner.id,
      originalName: 'notes.txt',
      storedName: 'stored.txt',
      storagePath: 'C:/tmp/stored.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      size: 12,
      checksum: 'checksum',
    });

    expect(created).toMatchObject({ userId: owner.id, status: 'PROCESSING', chunkCount: 0 });
    expect(await materials.listByUser('other-user')).toEqual([]);
    expect((await store.read()).processingJobs).toEqual([
      expect.objectContaining({ materialId: created.id, userId: owner.id, stage: 'QUEUED' }),
    ]);
  });

  it('claims a job with a lease and completes its material only for the lease owner', async () => {
    const { store } = localStore();
    const users = new LocalUserRepository(store);
    const owner = await users.create({ name: 'Owner', email: 'owner@example.com', passwordHash: 'hash' });
    const materials = new LocalMaterialRepository(store);
    const material = await materials.createWithJob({
      userId: owner.id, originalName: 'notes.txt', storedName: 'stored.txt', storagePath: 'C:/tmp/stored.txt',
      mimeType: 'text/plain', extension: 'txt', size: 12, checksum: 'checksum',
    });
    const processing = new LocalProcessingRepository(store);
    const job = await processing.claimNext('worker-1');

    expect(job?.material.id).toBe(material.id);
    expect(job?.lockOwner).toContain('worker-1:');
    await expect(processing.setStage(job?.id ?? '', 'wrong-owner', 'CHUNKING'))
      .rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    await processing.complete(job?.id ?? '', job?.lockOwner ?? '', material.id, 3);
    await expect(materials.findByIdForUser(material.id, owner.id))
      .resolves.toMatchObject({ status: 'READY', chunkCount: 3 });
  });
});
