import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { NewsDatabase } from '../src/db.ts';
import { fetchSourcesBatch, PoliteFetcher } from '../src/fetcher.ts';
import { computeNextFetchState, parseRetryAfterMs } from '../src/scheduler.ts';
import { USER_AGENT, type FetchStateRow, type SourceConfig } from '../src/types.ts';

interface MockRequestLog {
  url: string;
  userAgent: string | undefined;
  ifNoneMatch: string | undefined;
  ifModifiedSince: string | undefined;
  startedAt: number;
  finishedAt: number;
}

describe('F1: Pristojan fetcher (mock HTTP server — bez opterećivanja portala)', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = '';
  const logs: MockRequestLog[] = [];
  let inFlightOnBurst = 0;
  let maxObservedBurstConcurrency = 0;

  const ETAG_VALUE = '"feed-v1-etag"';
  const LAST_MOD_VALUE = 'Sat, 21 Nov 2026 18:00:00 GMT';
  const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Mock</title><item><title>Vest 1</title></item></channel></rss>`;

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const startedAt = Date.now();
    const reqUrl = req.url || '/';

    const finishLog = () => {
      logs.push({
        url: reqUrl,
        userAgent: req.headers['user-agent'],
        ifNoneMatch: req.headers['if-none-match'],
        ifModifiedSince: req.headers['if-modified-since'],
        startedAt,
        finishedAt: Date.now(),
      });
    };

    if (reqUrl === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('User-agent: *\nDisallow: /private-feed\nAllow: /\n');
      finishLog();
      return;
    }

    if (reqUrl === '/rss') {
      if (
        req.headers['if-none-match'] === ETAG_VALUE ||
        req.headers['if-modified-since'] === LAST_MOD_VALUE
      ) {
        res.writeHead(304, { ETag: ETAG_VALUE, 'Last-Modified': LAST_MOD_VALUE });
        res.end();
        finishLog();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        ETag: ETAG_VALUE,
        'Last-Modified': LAST_MOD_VALUE,
      });
      res.end(RSS_SAMPLE);
      finishLog();
      return;
    }

    if (reqUrl === '/private-feed') {
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      res.end(RSS_SAMPLE);
      finishLog();
      return;
    }

    if (reqUrl === '/rate-limited') {
      res.writeHead(429, { 'Retry-After': '1800', 'Content-Type': 'text/plain' });
      res.end('Too Many Requests');
      finishLog();
      return;
    }

    if (reqUrl === '/slow') {
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('too late');
          finishLog();
        }
      }, 400);
      return;
    }

    if (reqUrl === '/huge') {
      // Namerno bez Content-Length da proverimo i streaming ograničenje bajtova
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      const chunk = 'x'.repeat(2048);
      for (let i = 0; i < 10; i += 1) {
        res.write(chunk);
      }
      res.end();
      finishLog();
      return;
    }

    if (reqUrl.startsWith('/burst/')) {
      inFlightOnBurst += 1;
      maxObservedBurstConcurrency = Math.max(maxObservedBurstConcurrency, inFlightOnBurst);
      setTimeout(() => {
        inFlightOnBurst -= 1;
        res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
        res.end(RSS_SAMPLE);
        finishLog();
      }, 25);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
    finishLog();
  }

  before(async () => {
    server = createServer(handleRequest);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function makeSource(id: string, path: string): SourceConfig {
    return {
      id,
      name: id,
      domain: '127.0.0.1',
      feedUrl: `${baseUrl}${path}`,
      kind: 'rss',
      role: 'publisher',
      categoryHint: 'Društvo',
      weight: 8,
      baseIntervalMin: 10,
      maxIntervalMin: 60,
      paywall: 'none',
      maxItems: 10,
      enabled: true,
    };
  }

  it('šalje tačan User-Agent, čuva ETag/Last-Modified i na sledećem pozivu dobija 304 Not Modified', async () => {
    logs.length = 0;
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      const src = makeSource('mock-rss', '/rss');
      db.syncSources([src]);

      const fetcher = new PoliteFetcher(db, { minDomainGapMs: 10 });
      const t1 = new Date('2026-11-21T20:00:00.000Z');
      const [r1] = await fetchSourcesBatch(db, db.getDueSources(t1.toISOString()), fetcher, () => t1);

      assert.equal(r1.result.kind, 'fetched');
      assert.equal(r1.result.status, 200);
      assert.equal(r1.nextState.etag, ETAG_VALUE);
      assert.equal(r1.nextState.last_modified, LAST_MOD_VALUE);
      assert.equal(r1.nextState.current_interval_min, 10);
      assert.equal(r1.nextState.consecutive_304, 0);

      // Proveri robots.txt keširanje i User-Agent
      const rssLogs = logs.filter((l) => l.url === '/rss');
      assert.equal(rssLogs.length, 1);
      assert.equal(rssLogs[0].userAgent, USER_AGENT);
      assert.equal(logs.filter((l) => l.url === '/robots.txt').length, 1);

      // Drugi poziv nakon 15 min -> mora poslati If-None-Match i If-Modified-Since i dobiti 304
      const t2 = new Date('2026-11-21T20:15:00.000Z');
      const [r2] = await fetchSourcesBatch(db, db.getDueSources(t2.toISOString()), fetcher, () => t2);

      assert.equal(r2.result.kind, 'not_modified');
      assert.equal(r2.result.status, 304);
      assert.equal(r2.nextState.consecutive_304, 1);
      assert.equal(r2.nextState.current_interval_min, 15); // 10 * 1.5

      // robots.txt se čita iz keša — ne sme biti ponovnog HTTP zahteva za /robots.txt
      assert.equal(logs.filter((l) => l.url === '/robots.txt').length, 1);

      const secondRssLog = logs.filter((l) => l.url === '/rss')[1];
      assert.equal(secondRssLog.ifNoneMatch, ETAG_VALUE);
      assert.equal(secondRssLog.ifModifiedSince, LAST_MOD_VALUE);
    } finally {
      db.close();
    }
  });

  it('poštuje robots.txt i nikada ne šalje HTTP GET ka zabranjenoj putanji', async () => {
    logs.length = 0;
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      const src = makeSource('mock-blocked', '/private-feed');
      db.syncSources([src]);

      const fetcher = new PoliteFetcher(db, { minDomainGapMs: 10 });
      const [rep] = await fetchSourcesBatch(db, db.getDueSources(), fetcher);

      assert.equal(rep.result.kind, 'blocked_robots');
      assert.equal(
        logs.filter((l) => l.url === '/private-feed').length,
        0,
        'Zabranjeni URL ne sme biti pozvan'
      );
      assert.equal(rep.nextState.last_status, 0);
    } finally {
      db.close();
    }
  });

  it('obrađuje 429 Too Many Requests i poštuje Retry-After zaglavlje', async () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      const src = makeSource('mock-429', '/rate-limited');
      db.syncSources([src]);

      const fetcher = new PoliteFetcher(db, { minDomainGapMs: 10 });
      const now = new Date('2026-11-21T20:00:00.000Z');
      const [rep] = await fetchSourcesBatch(db, db.getDueSources(now.toISOString()), fetcher, () => now);

      assert.equal(rep.result.kind, 'rate_limited');
      assert.equal(rep.result.status, 429);
      assert.equal(rep.result.retryAfterMs, 1_800_000);
      // Retry-After je 30 min (1800s), veće od 20 min backoff-a (10*2)
      assert.equal(rep.nextState.next_check_at, '2026-11-21T20:30:00.000Z');
      assert.equal(rep.nextState.consecutive_errors, 1);
    } finally {
      db.close();
    }
  });

  it('prekida zahtev kod timeout-a i kod prekoračenja limita veličine odgovora', async () => {
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      const fetcher = new PoliteFetcher(db, {
        minDomainGapMs: 5,
        timeoutMs: 80,
        maxBytes: 4096,
      });

      const slowRes = await fetcher.fetchUrl(`${baseUrl}/slow`);
      assert.equal(slowRes.kind, 'error');
      assert.match(slowRes.error, /Timeout/i);

      const hugeRes = await fetcher.fetchUrl(`${baseUrl}/huge`);
      assert.equal(hugeRes.kind, 'error');
      assert.match(hugeRes.error, /limit/i);
    } finally {
      db.close();
    }
  });

  it('ograničava domenske zahteve na 1 istovremeno uz minimalan razmak između zahteva', async () => {
    logs.length = 0;
    inFlightOnBurst = 0;
    maxObservedBurstConcurrency = 0;

    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      const minGap = 80;
      const fetcher = new PoliteFetcher(db, { minDomainGapMs: minGap, maxConcurrent: 6 });

      // Prvo keširaj robots.txt da ne ulazi u burst merenje
      await fetcher.robots.check(`${baseUrl}/burst/1`);

      const results = await Promise.all([
        fetcher.fetchUrl(`${baseUrl}/burst/1`),
        fetcher.fetchUrl(`${baseUrl}/burst/2`),
        fetcher.fetchUrl(`${baseUrl}/burst/3`),
      ]);

      for (const r of results) {
        assert.equal(r.kind, 'fetched');
      }
      assert.equal(maxObservedBurstConcurrency, 1, 'Najviše 1 istovremeni zahtev po domenu');

      const burstLogs = logs
        .filter((l) => l.url.startsWith('/burst/'))
        .sort((a, b) => a.startedAt - b.startedAt);
      assert.equal(burstLogs.length, 3);

      // Razmak između završetka prethodnog i početka sledećeg zahteva >= minGap (uz malu toleranciju tajmera)
      assert.ok(
        burstLogs[1].startedAt - burstLogs[0].finishedAt >= minGap - 15,
        `Razmak 1->2 bio je ${burstLogs[1].startedAt - burstLogs[0].finishedAt}ms, očekivano >= ${minGap - 15}ms`
      );
      assert.ok(
        burstLogs[2].startedAt - burstLogs[1].finishedAt >= minGap - 15,
        `Razmak 2->3 bio je ${burstLogs[2].startedAt - burstLogs[1].finishedAt}ms, očekivano >= ${minGap - 15}ms`
      );
    } finally {
      db.close();
    }
  });
});

describe('F1: Adaptivni intervali i Retry-After (jedinični testovi)', () => {
  const sampleSource: SourceConfig = {
    id: 'test-src',
    name: 'Test',
    domain: 'example.com',
    feedUrl: 'https://example.com/rss',
    kind: 'rss',
    role: 'publisher',
    categoryHint: 'Društvo',
    weight: 8,
    baseIntervalMin: 10,
    maxIntervalMin: 60,
    paywall: 'none',
    maxItems: 10,
    enabled: true,
  };

  const initialState: FetchStateRow = {
    source_id: 'test-src',
    etag: '"v1"',
    last_modified: null,
    last_status: 200,
    last_fetched_at: '2026-11-21T19:50:00.000Z',
    next_check_at: '2026-11-21T20:00:00.000Z',
    current_interval_min: 10,
    consecutive_304: 0,
    consecutive_errors: 0,
    last_error: null,
  };

  it('postepeno produžava interval na uzastopne 304 (×1.5 do maksimuma) i resetuje na nove vesti', () => {
    const t = new Date('2026-11-21T20:00:00.000Z');
    const s1 = computeNextFetchState(
      sampleSource,
      initialState,
      { kind: 'not_modified', status: 304, etag: null, lastModified: null },
      t
    );
    assert.equal(s1.current_interval_min, 15);
    assert.equal(s1.etag, '"v1"'); // čuva prethodni ETag

    const s2 = computeNextFetchState(
      sampleSource,
      s1,
      { kind: 'not_modified', status: 304, etag: null, lastModified: null },
      t
    );
    assert.equal(s2.current_interval_min, 23);

    const s3 = computeNextFetchState(
      sampleSource,
      { ...s2, current_interval_min: 50 },
      { kind: 'not_modified', status: 304, etag: null, lastModified: null },
      t
    );
    assert.equal(s3.current_interval_min, 60); // ograničeno na maxIntervalMin

    // Nove vesti vraćaju interval na osnovni
    const sReset = computeNextFetchState(
      sampleSource,
      s3,
      { kind: 'fetched', status: 200, etag: '"v2"', lastModified: null, hasNewContent: true },
      t
    );
    assert.equal(sReset.current_interval_min, 10);
    assert.equal(sReset.consecutive_304, 0);
    assert.equal(sReset.etag, '"v2"');
  });

  it('uvodi eksponencijalni backoff na greške i čuva prethodni ETag', () => {
    const t = new Date('2026-11-21T20:00:00.000Z');
    const e1 = computeNextFetchState(
      sampleSource,
      initialState,
      { kind: 'error', status: 500, error: 'HTTP 500' },
      t
    );
    assert.equal(e1.consecutive_errors, 1);
    assert.equal(e1.current_interval_min, 20);
    assert.equal(e1.etag, '"v1"');

    const e2 = computeNextFetchState(
      sampleSource,
      e1,
      { kind: 'error', status: 500, error: 'HTTP 500' },
      t
    );
    assert.equal(e2.consecutive_errors, 2);
    assert.equal(e2.current_interval_min, 40);
  });

  it('parsira Retry-After u sekundama i HTTP-date formatu', () => {
    const nowMs = Date.parse('2026-11-21T20:00:00.000Z');
    assert.equal(parseRetryAfterMs('120', nowMs), 120_000);
    assert.equal(parseRetryAfterMs('Sat, 21 Nov 2026 20:05:00 GMT', nowMs), 300_000);
    assert.equal(parseRetryAfterMs('invalid', nowMs), null);
  });
});
