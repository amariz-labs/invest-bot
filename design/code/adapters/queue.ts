// Tiny serial queue. We don't want a hard dep on `p-queue` in the interface
// layer; the user is free to npm i p-queue and swap this for the real thing.
// Concurrency=1 is the right default for broker REST endpoints because most
// have per-second order-rate caps.

export class SerialQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private minSpacingMs: number;
  private lastRun = 0;

  constructor(opts: { minSpacingMs?: number } = {}) {
    this.minSpacingMs = opts.minSpacingMs ?? 0;
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      if (this.minSpacingMs > 0) {
        const wait = this.minSpacingMs - (Date.now() - this.lastRun);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
      }
      try {
        return await fn();
      } finally {
        this.lastRun = Date.now();
      }
    };
    const next = this.chain.then(run, run);
    // Keep the chain alive even on rejection so later tasks still run.
    this.chain = next.catch(() => undefined);
    return next as Promise<T>;
  }
}
