import type { MaterialProcessor } from '../modules/materials/material-processor.js';
import type { ClaimableProcessingRepository } from './local-processing.repository.js';
import type { LocalStore } from './local-store.js';

export class LocalWorker {
  private timer: NodeJS.Timeout | undefined;
  private active: Promise<boolean> | undefined;

  constructor(
    private readonly repository: ClaimableProcessingRepository,
    private readonly processor: MaterialProcessor,
    private readonly store: LocalStore,
    private readonly workerId = `local-${process.pid}`,
  ) {}

  tick(): Promise<boolean> {
    if (this.active) return this.active;
    const operation = this.runOnce();
    this.active = operation;
    void operation.finally(() => {
      if (this.active === operation) this.active = undefined;
    });
    return operation;
  }

  start(intervalMs = 500): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.active;
    await this.store.flush();
  }

  private async runOnce(): Promise<boolean> {
    const job = await this.repository.claimNext(this.workerId);
    if (!job) return false;
    await this.processor.process(job);
    return true;
  }
}
