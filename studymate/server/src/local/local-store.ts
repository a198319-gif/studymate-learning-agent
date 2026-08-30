import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../shared/app-error.js';
import { emptyLocalState, localStateSchema, type LocalState } from './local-state.js';

export class LocalStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly statePath: string) {}

  async read(): Promise<LocalState> {
    await this.queue;
    return structuredClone(await this.load());
  }

  update<T>(mutator: (draft: LocalState) => T | Promise<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      const draft = structuredClone(await this.load());
      const result = await mutator(draft);
      await this.atomicWrite(draft);
      return result;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async flush(): Promise<void> {
    await this.queue;
  }

  private async load(): Promise<LocalState> {
    let raw: string;
    try {
      raw = await readFile(this.statePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyLocalState();
      throw error;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      throw new AppError(500, 'LOCAL_STATE_INVALID', 'The local application data is invalid.');
    }
    if (value && typeof value === 'object' && 'version' in value && value.version !== 1) {
      throw new AppError(500, 'LOCAL_STATE_VERSION_UNSUPPORTED', 'The local application data version is not supported.');
    }
    const parsed = localStateSchema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(500, 'LOCAL_STATE_INVALID', 'The local application data is invalid.');
    }
    return parsed.data;
  }

  private async atomicWrite(state: LocalState): Promise<void> {
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
