import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SOURCES_PATH, loadSourcesConfig, validateSourceConfig } from '../src/config.ts';
import { NewsDatabase } from '../src/db.ts';
import { USER_AGENT } from '../src/types.ts';

describe('F0: Konfiguracija izvora (sources.json)', () => {
  it('učitava i validira podrazumevani ingest/sources.json', () => {
    const cfg = loadSourcesConfig(DEFAULT_SOURCES_PATH);
    assert.ok(cfg.sources.length >= 10, 'Treba da postoji barem 10 konfigurisanih izvora');

    const enabledPublishers = cfg.sources.filter((s) => s.enabled && s.role === 'publisher');
    const configuredSignals = cfg.sources.filter((s) => s.role === 'signal');
    assert.ok(enabledPublishers.length >= 10, 'Treba da postoji barem 10 aktivnih publisher izvora');
    assert.ok(configuredSignals.length >= 1, 'Treba da postoje konfigurisani Google News signali');

    for (const s of cfg.sources) {
      if (s.domain === 'news.google.com') {
        assert.equal(
          s.role,
          'signal',
          `Google News izvor "${s.id}" mora imati role="signal" (nikad publisher)`
        );
      }
    }
  });

  it('odbija neispravnu težinu i neispravan URL', () => {
    assert.throws(() =>
      validateSourceConfig(
        {
          id: 'bad-weight',
          name: 'Test',
          domain: 'example.com',
          feedUrl: 'https://example.com/rss',
          kind: 'rss',
          role: 'publisher',
          categoryHint: 'Društvo',
          weight: 15,
          baseIntervalMin: 10,
          maxIntervalMin: 60,
          paywall: 'none',
          maxItems: 10,
          enabled: true,
        },
        0
      )
    );

    assert.throws(() =>
      validateSourceConfig(
        {
          id: 'bad-url',
          name: 'Test',
          domain: 'example.com',
          feedUrl: 'ftp://example.com/rss',
          kind: 'rss',
          role: 'publisher',
          categoryHint: 'Društvo',
          weight: 5,
          baseIntervalMin: 10,
          maxIntervalMin: 60,
          paywall: 'none',
          maxItems: 10,
          enabled: true,
        },
        1
      )
    );
  });

  it('User-Agent je generički i ne sadrži email ili lične podatke', () => {
    assert.equal(USER_AGENT, 'Mozilla/5.0 (compatible; NewsAggregatorTest/1.0)');
    assert.ok(!USER_AGENT.includes('@'));
  });
});

describe('F0: SQLite šema, migracije i sinhronizacija izvora', () => {
  it('migracije su idempotentne i tabela articles nema full_text kolonu (Sloj 5)', () => {
    const db = new NewsDatabase(':memory:');
    try {
      const first = db.migrate();
      const second = db.migrate();
      assert.ok(first.includes(1), 'Početna migracija 1 mora biti primenjena');
      assert.deepEqual(second, []);

      const cols = db.db
        .prepare('PRAGMA table_info(articles)')
        .all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      assert.ok(colNames.includes('canonical_url'));
      assert.ok(colNames.includes('title_hash'));
      assert.ok(colNames.includes('snippet'));
      assert.ok(!colNames.includes('full_text'), 'articles ne sme sadržati full_text kolonu');
    } finally {
      db.close();
    }
  });

  it('sinhronizuje izvore, gasi uklonjene i filtrira due izvore po next_check_at', () => {
    const cfg = loadSourcesConfig(DEFAULT_SOURCES_PATH);
    const db = new NewsDatabase(':memory:');
    try {
      db.migrate();
      const sync1 = db.syncSources(cfg.sources);
      assert.equal(sync1.upserted, cfg.sources.length);
      assert.equal(sync1.statesInitialized, cfg.sources.length);
      assert.equal(sync1.disabledRemoved, 0);

      const now = '2026-11-21T20:00:00.000Z';
      const dueBefore = db.getDueSources(now);
      const activeCount = cfg.sources.filter((s) => s.enabled).length;
      assert.equal(dueBefore.length, activeCount);

      // Pomeri RTS u budućnost — ne sme biti due
      db.db
        .prepare('UPDATE fetch_state SET next_check_at = ? WHERE source_id = ?')
        .run('2026-11-21T20:30:00.000Z', 'rts');

      const dueAfter = db.getDueSources(now);
      assert.equal(dueAfter.length, activeCount - 1);
      assert.ok(!dueAfter.some((d) => d.source.id === 'rts'));

      // Uklanjanje jednog aktivnog izvora iz konfiguracije ga isključuje u bazi
      const subset = cfg.sources.filter((s) => s.id !== 'danas');
      const sync2 = db.syncSources(subset);
      assert.equal(sync2.disabledRemoved, 1);
      const danasState = db.getAllSourcesWithState().find((x) => x.source.id === 'danas');
      assert.equal(danasState?.source.enabled, false);
    } finally {
      db.close();
    }
  });
});
