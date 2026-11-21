import robotsParser from 'robots-parser';
import type { NewsDatabase } from './db.ts';
import type { DomainRateLimiter } from './rateLimiter.ts';
import { USER_AGENT } from './types.ts';

export interface RobotsCheckResult {
  allowed: boolean;
  crawlDelayMs: number;
  fromCache: boolean;
  status: number;
}

export interface RobotsGuardOptions {
  userAgent?: string;
  ttlMs?: number;
  errorTtlMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  maxCrawlDelaySec?: number;
}

const DEFAULT_TTL_MS = 24 * 3600 * 1_000;
const DEFAULT_ERROR_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_CRAWL_DELAY_SEC = 15;

export class RobotsGuard {
  private readonly db: NewsDatabase;
  private readonly limiter: DomainRateLimiter;
  private readonly userAgent: string;
  private readonly ttlMs: number;
  private readonly errorTtlMs: number;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxCrawlDelaySec: number;
  private readonly inflight = new Map<string, Promise<{ body: string; status: number }>>();

  constructor(
    db: NewsDatabase,
    limiter: DomainRateLimiter,
    options: RobotsGuardOptions = {}
  ) {
    this.db = db;
    this.limiter = limiter;
    this.userAgent = options.userAgent ?? USER_AGENT;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.errorTtlMs = options.errorTtlMs ?? DEFAULT_ERROR_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxCrawlDelaySec = options.maxCrawlDelaySec ?? DEFAULT_MAX_CRAWL_DELAY_SEC;
  }

  public async check(targetUrl: string): Promise<RobotsCheckResult> {
    const parsed = new URL(targetUrl);
    const origin = parsed.origin;
    const cacheKey = parsed.host.toLowerCase();
    const robotsUrl = `${origin}/robots.txt`;

    const cached = this.db.getRobotsCache(cacheKey);
    const nowMs = Date.now();

    if (cached) {
      const ageMs = nowMs - Date.parse(cached.fetched_at);
      const isTemporaryFailure = cached.status === 0 || cached.status === 429 || cached.status >= 500;
      const effectiveTtl = isTemporaryFailure ? this.errorTtlMs : this.ttlMs;

      if (!Number.isNaN(ageMs) && ageMs >= 0 && ageMs < effectiveTtl) {
        return this.evaluate(targetUrl, robotsUrl, cached.body, cached.status, true);
      }
    }

    let pending = this.inflight.get(cacheKey);
    if (!pending) {
      pending = this.fetchRobotsTxt(cacheKey, robotsUrl);
      this.inflight.set(cacheKey, pending);
    }

    try {
      const fetched = await pending;
      this.db.upsertRobotsCache({
        domain: cacheKey,
        body: fetched.body,
        status: fetched.status,
        fetched_at: new Date().toISOString(),
      });
      return this.evaluate(targetUrl, robotsUrl, fetched.body, fetched.status, false);
    } finally {
      if (this.inflight.get(cacheKey) === pending) {
        this.inflight.delete(cacheKey);
      }
    }
  }

  private async fetchRobotsTxt(
    host: string,
    robotsUrl: string
  ): Promise<{ body: string; status: number }> {
    return this.limiter.schedule(host, async () => {
      try {
        const res = await fetch(robotsUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'text/plain, */*;q=0.1',
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (res.status >= 200 && res.status < 300) {
          const text = await readTextUpTo(res, this.maxBytes);
          return { body: text, status: res.status };
        }
        // Zbog urednog oslobađanja konekcije otkaži body
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        return { body: '', status: res.status };
      } catch {
        return { body: '', status: 0 };
      }
    });
  }

  private evaluate(
    targetUrl: string,
    robotsUrl: string,
    body: string,
    status: number,
    fromCache: boolean
  ): RobotsCheckResult {
    // RFC 9309: 4xx (osim 429) znači nema restrikcija; 5xx / 429 / mrežna greška -> oprezno pauziraj
    if (status === 0 || status === 429 || status >= 500) {
      return { allowed: false, crawlDelayMs: 0, fromCache, status };
    }
    if (status >= 400 && status < 500) {
      return { allowed: true, crawlDelayMs: 0, fromCache, status };
    }

    const robots = robotsParser(robotsUrl, body);
    const allowed = robots.isAllowed(targetUrl, this.userAgent) !== false;
    const rawDelay = robots.getCrawlDelay(this.userAgent);
    const clampedSec =
      typeof rawDelay === 'number' && Number.isFinite(rawDelay) && rawDelay > 0
        ? Math.min(this.maxCrawlDelaySec, rawDelay)
        : 0;

    return {
      allowed,
      crawlDelayMs: Math.round(clampedSec * 1_000),
      fromCache,
      status,
    };
  }
}

async function readTextUpTo(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    if (total + value.byteLength > maxBytes) {
      const remaining = maxBytes - total;
      if (remaining > 0) {
        chunks.push(value.subarray(0, remaining));
      }
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }

    chunks.push(value);
    total += value.byteLength;
  }

  const merged = new Uint8Array(chunks.reduce((acc, c) => acc + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}
