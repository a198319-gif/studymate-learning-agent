import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalStore } from '../src/local/local-store.js';

const directories: string[] = [];

function temporaryStatePath(): string {
  const directory = path.join(tmpdir(), `studymate-local-store-${crypto.randomUUID()}`);
  directories.push(directory);
  return path.join(directory, 'state.json');
}

function user(id: string) {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    passwordHash: 'hash',
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('LocalStore', () => {
  it('persists a mutation and reloads version 1 state', async () => {
    const statePath = temporaryStatePath();
    const first = new LocalStore(statePath);
    await first.update((state) => { state.users.push(user('user-1')); });
    await first.flush();

    const second = new LocalStore(statePath);
    expect((await second.read()).users).toEqual([user('user-1')]);
  });

  it('serializes concurrent mutations without losing data', async () => {
    const store = new LocalStore(temporaryStatePath());
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      store.update((state) => { state.users.push(user(`user-${index}`)); })));

    expect((await store.read()).users).toHaveLength(20);
  });

  it('returns copies that cannot mutate authoritative state', async () => {
    const store = new LocalStore(temporaryStatePath());
    await store.update((state) => { state.users.push(user('user-1')); });

    const copy = await store.read();
    copy.users.length = 0;

    expect((await store.read()).users).toHaveLength(1);
  });

  it('rejects an unknown state version without overwriting it', async () => {
    const statePath = temporaryStatePath();
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify({ version: 99 }), { encoding: 'utf8', flag: 'wx' });

    await expect(new LocalStore(statePath).read()).rejects.toMatchObject({
      code: 'LOCAL_STATE_VERSION_UNSUPPORTED',
    });
  });
});
