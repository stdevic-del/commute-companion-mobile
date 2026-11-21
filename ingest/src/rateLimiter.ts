function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RateLimiterOptions {
  /** Maksimalan ukupan broj istovremenih HTTP zahteva (podrazumevano 6). */
  maxConcurrent?: number;
  /** Minimalan razmak između dva zahteva ka istom domenu u ms (podrazumevano 3000). */
  minDomainGapMs?: number;
}

/**
 * Pristojan rate-limiter:
 * - najviše 1 istovremeni zahtev po domenu
 * - minimalan razmak >= minDomainGapMs između zahteva ka istom domenu (poštuje i veći Crawl-delay)
 * - globalno ograničenje istovremenih zahteva (maxConcurrent)
 */
export class DomainRateLimiter {
  private readonly maxConcurrent: number;
  private readonly minDomainGapMs: number;
  private activeGlobal = 0;
  private readonly globalWaiters: Array<() => void> = [];
  private readonly domainQueues = new Map<string, Promise<void>>();
  private readonly domainLastFinishedAt = new Map<string, number>();

  constructor(options: RateLimiterOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 6);
    this.minDomainGapMs = Math.max(0, options.minDomainGapMs ?? 3_000);
  }

  private async acquireGlobal(): Promise<void> {
    if (this.activeGlobal < this.maxConcurrent) {
      this.activeGlobal += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.globalWaiters.push(resolve);
    });
    this.activeGlobal += 1;
  }

  private releaseGlobal(): void {
    this.activeGlobal = Math.max(0, this.activeGlobal - 1);
    const next = this.globalWaiters.shift();
    if (next) next();
  }

  public async schedule<T>(
    domain: string,
    task: () => Promise<T>,
    extraGapMs: number = 0
  ): Promise<T> {
    const key = domain.toLowerCase();
    const prevChain = this.domainQueues.get(key) ?? Promise.resolve();
    const requiredGapMs = Math.max(this.minDomainGapMs, extraGapMs);

    let releaseDomain!: () => void;
    const myTurnDone = new Promise<void>((resolve) => {
      releaseDomain = resolve;
    });
    this.domainQueues.set(key, prevChain.then(() => myTurnDone));

    await prevChain;

    try {
      const lastDone = this.domainLastFinishedAt.get(key);
      if (lastDone !== undefined && requiredGapMs > 0) {
        const elapsed = Date.now() - lastDone;
        if (elapsed < requiredGapMs) {
          await sleep(requiredGapMs - elapsed);
        }
      }

      await this.acquireGlobal();
      try {
        return await task();
      } finally {
        this.domainLastFinishedAt.set(key, Date.now());
        this.releaseGlobal();
      }
    } finally {
      releaseDomain();
      if (this.domainQueues.get(key) === myTurnDone) {
        this.domainQueues.delete(key);
      }
    }
  }
}
