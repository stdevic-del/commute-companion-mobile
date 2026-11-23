import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { CANONICAL_CATEGORIES, categoryToSlug } from '../../shared/categories.ts';
import { StoryClusterer } from '../src/cluster/clusterer.ts';
import { INGEST_ROOT } from '../src/config.ts';
import { NewsDatabase } from '../src/db.ts';
import { ArticleDeduplicator } from '../src/dedup/deduplicator.ts';
import {
  buildOptimizedImageUrl,
  exportFeeds,
  type ExportedFeedFile,
  type ExportedMetaFile,
} from '../src/export/exporter.ts';
import { normalizeFeedItem, normalizeSignalItem } from '../src/normalize/index.ts';
import { rankActiveClusters } from '../src/rank/ranker.ts';
import type { SourceConfig } from '../src/types.ts';

function makeSource(id: string, name: string, weight: number): SourceConfig {
  return {
    id,
    name,
    domain: `${id}.rs`,
    feedUrl: `https://${id}.rs/feed`,
    kind: 'rss',
    role: 'publisher',
    categoryHint: 'Društvo',
    weight,
    baseIntervalMin: 10,
    maxIntervalMin: 60,
    paywall: 'none',
    maxItems: 20,
    enabled: true,
  };
}

describe('F8: wsrv.nl WebP slike i slugovi kategorija', () => {
  it('uredno encodeURIComponent-uje URL slike sa w=640&output=webp&q=80&we i vraća null bez slike', () => {
    const orig = 'https://www.rts.rs/upload/slika 1.jpg?size=large&v=2';
    const proxied = buildOptimizedImageUrl(orig);
    assert.equal(
      proxied,
      `https://wsrv.nl/?url=${encodeURIComponent(orig)}&w=640&output=webp&q=80&we`
    );

    // Idempotentnost ako je URL već wsrv.nl
    assert.equal(buildOptimizedImageUrl(proxied), proxied);

    // Čist null za prazne ili nevažeće URL-ove
    assert.equal(buildOptimizedImageUrl(null), null);
    assert.equal(buildOptimizedImageUrl(undefined), null);
    assert.equal(buildOptimizedImageUrl(''), null);
    assert.equal(buildOptimizedImageUrl('javascript:alert(1)'), null);
  });

  it('svih 10 kanonskih kategorija imaju jedinstvene ASCII URL slugove', () => {
    const slugs = CANONICAL_CATEGORIES.map((c) => categoryToSlug(c));
    assert.equal(new Set(slugs).size, CANONICAL_CATEGORIES.length);
    for (const s of slugs) {
      assert.match(s, /^[a-z0-9-]+$/);
    }
  });
});

describe('F8: Statički JSON izvoz (feed.json, 10 kategorija, meta.json) i WAL checkpoint', () => {
  it('generiše sve JSON fajlove, čuva AI brifing, sakriva Google News kao izvor i čuva bazu na disku', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cc-f8-'));
    const dbPath = join(tmpDir, 'news.sqlite');
    const outDir = join(tmpDir, 'out');

    try {
      const db = new NewsDatabase(dbPath);
      const rts = makeSource('rts', 'RTS', 9);
      const danas = makeSource('danas', 'Danas', 8);
      const gn: SourceConfig = {
        ...makeSource('gn-top', 'Google News', 1),
        domain: 'news.google.com',
        role: 'signal',
      };

      db.migrate();
      db.syncSources([rts, danas, gn]);

      const dedup = new ArticleDeduplicator(db);
      const clusterer = new StoryClusterer(db);
      const now = new Date('2026-11-21T20:00:00.000Z');

      const a1 = normalizeFeedItem(
        {
          title: 'Narodna banka Srbije zadržala referentnu kamatnu stopu na 5,75 odsto',
          url: 'https://rts.rs/nbs-kamata',
          publishedAtRaw: '2026-11-21T19:00:00Z',
          descriptionRaw: 'Izvršni odbor NBS zadržao je referentnu kamatnu stopu.',
          imageUrl: 'https://rts.rs/img/nbs.jpg?w=1200',
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        rts,
        now
      )!;
      const a2 = normalizeFeedItem(
        {
          title: 'Otvorena nova izložba u Narodnom muzeju bez fotografije',
          url: 'https://danas.rs/muzej',
          publishedAtRaw: '2026-11-21T18:30:00Z',
          descriptionRaw: 'Postavka traje do kraja meseca.',
          imageUrl: null,
          categories: [],
          sourceNameHint: null,
          paywallHint: null,
          canonicalUrlHint: null,
        },
        danas,
        now
      )!;

      dedup.processOne(a1, rts.weight, now);
      dedup.processOne(a2, danas.weight, now);

      const sig = normalizeSignalItem(
        {
          title: 'Narodna banka Srbije zadržala referentnu kamatnu stopu na 5,75 odsto - Blic',
          url: 'https://news.google.com/rss/articles/123',
          publishedAtRaw: '2026-11-21T19:05:00Z',
          descriptionRaw: '',
          imageUrl: null,
          categories: [],
          sourceNameHint: 'Blic',
          paywallHint: null,
          canonicalUrlHint: null,
        },
        gn,
        1,
        now
      )!;
      db.upsertSignal(sig);

      clusterer.run(now);
      const ranking = rankActiveClusters(db, now);

      // Simuliraj sačuvan AI brifing za prvi klaster
      const topCluster = ranking.globalRanked[0];
      db.saveClusterBriefing({
        clusterId: topCluster.cluster.id,
        text: 'Kako prenosi RTS, Narodna banka Srbije zadržala je referentnu kamatnu stopu na 5,75 odsto.',
        sourceNames: ['RTS'],
        mediaCount: topCluster.cluster.media_count,
        generatedAt: now.toISOString(),
      });
      topCluster.cluster.ai_briefing_text =
        'Kako prenosi RTS, Narodna banka Srbije zadržala je referentnu kamatnu stopu na 5,75 odsto.';
      topCluster.cluster.ai_briefing_sources = JSON.stringify(['RTS']);

      const summary = exportFeeds(db, ranking, outDir, now);
      db.close();

      // 1 feed.json + 10 kategorija + 1 meta.json = 12 fajlova
      assert.equal(summary.filesWritten.length, 12);
      assert.ok(existsSync(join(outDir, 'feed.json')));
      assert.ok(existsSync(join(outDir, 'meta.json')));
      assert.ok(existsSync(join(outDir, 'biznis-i-finansije.json')));
      assert.ok(existsSync(join(outDir, 'kultura.json')));

      const feed = JSON.parse(readFileSync(join(outDir, 'feed.json'), 'utf-8')) as ExportedFeedFile;
      assert.equal(feed.schemaVersion, 1);
      assert.equal(feed.totalItems, 2);

      // Prva vest ima wsrv.nl WebP sliku i AI brifing
      assert.ok(feed.items[0].imageUrl?.startsWith('https://wsrv.nl/?url='));
      assert.ok(feed.items[0].imageUrl?.includes('&w=640&output=webp&q=80&we'));
      assert.ok(feed.items[0].aiBriefing?.includes('Narodna banka Srbije'));
      assert.deepEqual(feed.items[0].aiBriefingSources, ['RTS']);

      // Druga vest bez slike ima čist null (nikad polomljen wsrv URL)
      assert.equal(feed.items[1].imageUrl, null);
      assert.equal(feed.items[1].aiBriefing, null);

      // Google News nikad ne sme da se pojavi kao izvor u feedu
      for (const item of feed.items) {
        assert.notEqual(item.sourceId, 'gn-top');
        assert.ok(item.sources.every((s) => s.id !== 'gn-top'));
      }

      const meta = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf-8')) as ExportedMetaFile;
      assert.equal(meta.counts.globalItems, 2);
      assert.equal(meta.counts.briefedClusters, 1);
      assert.equal(meta.categories.length, 10);
      assert.equal(meta.sources.length, 3);

      // WAL checkpoint provera: baza se ponovo otvara čisto iz jednog fajla
      const reopened = new NewsDatabase(dbPath);
      try {
        assert.equal(reopened.getStats().clusters, 2);
      } finally {
        reopened.close();
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GitHub Actions workflow osvezi-vesti.yml sadrži svih 5 tehničkih zahteva', () => {
    const workflowPath = resolve(INGEST_ROOT, '..', '.github', 'workflows', 'osvezi-vesti.yml');
    const yml = readFileSync(workflowPath, 'utf-8');

    assert.match(yml, /node-version:\s*['"]?(22|24)['"]?/);
    assert.match(yml, /actions\/cache@v4/);
    assert.match(yml, /key:\s*news-db-\$\{\{\s*github\.run_id\s*\}\}/);
    assert.match(yml, /restore-keys:\s*\|?[\r\n]+\s*news-db-/);
    assert.match(yml, /workflow_dispatch:/);
    assert.match(yml, /contents:\s*write/);
    assert.match(yml, /concurrency:/);
    assert.match(yml, /GEMINI_API_KEY:\s*\$\{\{\s*secrets\.GEMINI_API_KEY\s*\}\}/);
    assert.match(yml, /git push --force origin news-feed/);
  });
});
