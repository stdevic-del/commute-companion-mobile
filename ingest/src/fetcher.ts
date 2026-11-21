import type { NewsDatabase } from './db.ts';
import { DomainRateLimiter } from './rateLimiter.ts';
import { RobotsGuard } from './robots.ts';
import {
  computeNextFetchState,
  parseRetryAfterMs,
  type FetchOutcome,
} from './scheduler.ts';
import {
  USER_AGENT,
  type FetchStateRow,
  type SourceWithState,
} from './types.ts';

export interface PoliteFetcherOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  minDomainGapMs?: number;
  maxConcurrent?: number;
  robotsTtlMs?: number;
  respectRobots?: boolean;
}

export interface FetchUrlOptions {
  etag?: string | null;
  lastModified?: string | null;
  accept?: string;
  skipRobots?: boolean;
}

export type FetchUrlResult =
  | {
      kind: 'fetched';
      url: string;
      finalUrl: string;
      status: number;
      contentType: string;
      etag: string | null;
      lastModified: string | null;
      body: string;
      bytes: number;
    }
  | {
      kind: 'not_modified';
      url: string;
      finalUrl: string;
      status: 304;
      etag: string | null;
      lastModified: string | null;
    }
  | {
      kind: 'rate_limited';
      url: string;
      finalUrl: string;
      status: number;
      retryAfterMs: number | null;
      error: string;
    }
  | {
      kind: 'blocked_robots';
      url: string;
      finalUrl: string;
      status: null;
      error: string;
    }
  | {
      kind: 'error';
      url: string;
      finalUrl: string;
      status: number | null;
      error: string;
    };

export interface SourceFetchReport {
  sourceId: string;
  sourceName: string;
  result: FetchUrlResult;
  nextState: FetchStateRow;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const DEFAULT_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.1';

class ResponseTooLargeError extends Error {
  public readonly maxBytes: number;
  constructor(maxBytes: number) {
    super(`Odgovor prelazi dozvoljeni limit od ${maxBytes} bajtova.`);
    this.name = 'ResponseTooLargeError';
    this.maxBytes = maxBytes;
  }
}

export class PoliteFetcher {
  public readonly limiter: DomainRateLimiter;
  public readonly robots: RobotsGuard;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly respectRobots: boolean;

  constructor(db: NewsDatabase, options: PoliteFetcherOptions = {}) {
    this.userAgent = options.userAgent ?? USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.respectRobots = options.respectRobots ?? true;

    this.limiter = new DomainRateLimiter({
      maxConcurrent: options.maxConcurrent ?? 6,
      minDomainGapMs: options.minDomainGapMs ?? 3_000,
    });
    this.robots = new RobotsGuard(db, this.limiter, {
      userAgent: this.userAgent,
      ttlMs: options.robotsTtlMs,
    });
  }

  public async fetchUrl(url: string, opts: FetchUrlOptions = {}): Promise<FetchUrlResult> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return {
        kind: 'error',
        url,
        finalUrl: url,
        status: null,
        error: `Neispravan URL: ${url}`,
      };
    }

    let crawlDelayMs = 0;
    if (this.respectRobots && !opts.skipRobots) {
      const robotsCheck = await this.robots.check(url);
      if (!robotsCheck.allowed) {
        return {
          kind: 'blocked_robots',
          url,
          finalUrl: url,
          status: null,
          error:
            robotsCheck.status === 0 || robotsCheck.status >= 500
              ? `robots.txt nedostupan (HTTP ${robotsCheck.status}) — privremeno preskočeno`
              : 'Zabranjeno u robots.txt',
        };
      }
      crawlDelayMs = robotsCheck.crawlDelayMs;
    }

    const host = parsed.host.toLowerCase();
    return this.limiter.schedule(
      host,
      async () => {
        const headers: Record<string, string> = {
          'User-Agent': this.userAgent,
          Accept: opts.accept ?? DEFAULT_ACCEPT,
          'Accept-Encoding': 'gzip, deflate, br',
        };
        if (opts.etag) {
          headers['If-None-Match'] = opts.etag;
        }
        if (opts.lastModified) {
          headers['If-Modified-Since'] = opts.lastModified;
        }

        try {
          const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers,
            signal: AbortSignal.timeout(this.timeoutMs),
          });

          const finalUrl = res.url || url;
          const etag = res.headers.get('etag');
          const lastModified = res.headers.get('last-modified');

          if (res.status === 304) {
            try {
              await res.body?.cancel();
            } catch {
              // ignore
            }
            return {
              kind: 'not_modified',
              url,
              finalUrl,
              status: 304,
              etag,
              lastModified,
            };
          }

          if (res.status === 429 || res.status === 503) {
            const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
            try {
              await res.body?.cancel();
            } catch {
              // ignore
            }
            return {
              kind: 'rate_limited',
              url,
              finalUrl,
              status: res.status,
              retryAfterMs,
              error: `HTTP ${res.status} (${retryAfterMs ? `Retry-After ${Math.round(retryAfterMs / 1000)}s` : 'backoff'})`,
            };
          }

          if (res.status < 200 || res.status >= 300) {
            try {
              await res.body?.cancel();
            } catch {
              // ignore
            }
            return {
              kind: 'error',
              url,
              finalUrl,
              status: res.status,
              error: `HTTP ${res.status} ${res.statusText || ''}`.trim(),
            };
          }

          const contentLengthHeader = res.headers.get('content-length');
          if (contentLengthHeader) {
            const declaredBytes = Number(contentLengthHeader);
            if (Number.isFinite(declaredBytes) && declaredBytes > this.maxBytes) {
              try {
                await res.body?.cancel();
              } catch {
                // ignore
              }
              throw new ResponseTooLargeError(this.maxBytes);
            }
          }

          const contentType = res.headers.get('content-type') || '';
          const { text, bytes } = await readBodyWithLimit(res, this.maxBytes, contentType);

          return {
            kind: 'fetched',
            url,
            finalUrl,
            status: res.status,
            contentType,
            etag,
            lastModified,
            body: text,
            bytes,
          };
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.name === 'TimeoutError'
                ? `Timeout posle ${this.timeoutMs} ms`
                : err.message
              : String(err);
          return {
            kind: 'error',
            url,
            finalUrl: url,
            status: null,
            error: message,
          };
        }
      },
      crawlDelayMs
    );
  }
}

function toFetchOutcome(result: FetchUrlResult, hasNewContent?: boolean): FetchOutcome {
  switch (result.kind) {
    case 'fetched':
      return {
        kind: 'fetched',
        status: result.status,
        etag: result.etag,
        lastModified: result.lastModified,
        hasNewContent,
      };
    case 'not_modified':
      return {
        kind: 'not_modified',
        status: result.status,
        etag: result.etag,
        lastModified: result.lastModified,
      };
    case 'rate_limited':
      return {
        kind: 'rate_limited',
        status: result.status,
        retryAfterMs: result.retryAfterMs,
        error: result.error,
      };
    case 'blocked_robots':
      return {
        kind: 'blocked_robots',
        error: result.error,
      };
    case 'error':
      return {
        kind: 'error',
        status: result.status,
        error: result.error,
      };
  }
}

/**
 * Preuzima sve zadate izvore poštujući domenski i globalni rate-limit,
 * odmah ažurira `fetch_state` u bazi i vraća izveštaj po izvoru.
 */
export async function fetchSourcesBatch(
  db: NewsDatabase,
  items: SourceWithState[],
  fetcher: PoliteFetcher,
  nowProvider: () => Date = () => new Date()
): Promise<SourceFetchReport[]> {
  const reports = await Promise.all(
    items.map(async ({ source, state }) => {
      const result = await fetcher.fetchUrl(source.feedUrl, {
        etag: state.etag,
        lastModified: state.last_modified,
      });

      const outcome = toFetchOutcome(result);
      const nextState = computeNextFetchState(source, state, outcome, nowProvider());
      db.updateFetchState(nextState);

      return {
        sourceId: source.id,
        sourceName: source.name,
        result,
        nextState,
      } satisfies SourceFetchReport;
    })
  );

  return reports;
}

function detectCharset(contentType: string): string {
  const match = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  if (!match) return 'utf-8';
  const raw = match[1].toLowerCase();
  // TextDecoder podržava standardne etikete; fallback na utf-8 ako je nepoznata
  try {
    new TextDecoder(raw);
    return raw;
  } catch {
    return 'utf-8';
  }
}

async function readBodyWithLimit(
  res: Response,
  maxBytes: number,
  contentType: string
): Promise<{ text: string; bytes: number }> {
  if (!res.body) {
    return { text: '', bytes: 0 };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new ResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const charset = detectCharset(contentType);
  const text = new TextDecoder(charset, { fatal: false }).decode(merged);
  return { text, bytes: total };
}
