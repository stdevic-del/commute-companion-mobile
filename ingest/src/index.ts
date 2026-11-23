import { resolve } from 'node:path';
import { classifyNewsCategory } from '../../shared/categories.ts';
import {
  BriefingGenerator,
  createGeminiClientFromEnv,
  DEFAULT_MAX_NEW_BRIEFINGS_PER_RUN,
} from './briefing/synthesizer.ts';
import { StoryClusterer } from './cluster/clusterer.ts';
import {
  DEFAULT_DB_PATH,
  DEFAULT_OUT_DIR,
  DEFAULT_SOURCES_PATH,
  loadSourcesConfig,
} from './config.ts';
import { NewsDatabase } from './db.ts';
import { ArticleDeduplicator } from './dedup/deduplicator.ts';
import { exportFeeds } from './export/exporter.ts';
import { fetchSourcesBatch, PoliteFetcher } from './fetcher.ts';
import { detectNoiseReason, normalizeFeedItem, normalizeSignalItem } from './normalize/index.ts';
import { enrichMissingMetadata } from './parsers/enrich.ts';
import { parseFeed } from './parsers/feedParser.ts';
import { rankActiveClusters } from './rank/ranker.ts';
import { computeNextFetchState } from './scheduler.ts';
import { USER_AGENT } from './types.ts';

interface CliOptions {
  dry: boolean;
  force: boolean;
  only: string[] | null;
  enrichLimit: number;
  skipBriefing: boolean;
  maxBriefings: number;
  noExport: boolean;
  outDir: string;
  dbPath: string;
  sourcesPath: string;
}

function parseArgs(argv: string[]): CliOptions {
  let dry = false;
  let force = false;
  let only: string[] | null = null;
  let enrichLimit = 2;
  let skipBriefing = false;
  let maxBriefings = DEFAULT_MAX_NEW_BRIEFINGS_PER_RUN;
  let noExport = false;
  let outDir = DEFAULT_OUT_DIR;
  let dbPath = DEFAULT_DB_PATH;
  let sourcesPath = DEFAULT_SOURCES_PATH;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry' || arg === '--dry-run') {
      dry = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--skip-briefing') {
      skipBriefing = true;
    } else if (arg === '--no-export') {
      noExport = true;
    } else if (arg === '--max-briefings' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isInteger(n) && n >= 0) maxBriefings = n;
      i += 1;
    } else if (arg === '--only' && argv[i + 1]) {
      only = argv[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === '--enrich' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isInteger(n) && n >= 0) enrichLimit = n;
      i += 1;
    } else if (arg === '--out' && argv[i + 1]) {
      outDir = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--db' && argv[i + 1]) {
      dbPath = argv[i + 1] === ':memory:' ? ':memory:' : resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--sources' && argv[i + 1]) {
      sourcesPath = resolve(argv[i + 1]);
      i += 1;
    }
  }

  return {
    dry,
    force,
    only,
    enrichLimit,
    skipBriefing,
    maxBriefings,
    noExport,
    outDir,
    dbPath,
    sourcesPath,
  };
}

function formatRow(cols: string[], widths: number[]): string {
  return cols.map((c, idx) => c.padEnd(widths[idx])).join('  ');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const nowIso = new Date().toISOString();

  const config = loadSourcesConfig(opts.sourcesPath);
  const db = new NewsDatabase(opts.dbPath);

  try {
    const appliedMigrations = db.migrate();
    const sync = db.syncSources(config.sources);
    const all = db.getAllSourcesWithState();
    const entryMap = new Map(all.map((x) => [x.source.id, x]));

    const baseCandidates = opts.force
      ? all.filter((x) => x.source.enabled)
      : db.getDueSources(nowIso);
    const due = opts.only
      ? baseCandidates.filter((x) => opts.only!.includes(x.source.id))
      : baseCandidates;
    const dueIds = new Set(due.map((d) => d.source.id));
    const statsBefore = db.getStats();

    console.log('=== Commute Companion · News Ingest Worker (F8) ===');
    console.log(`Vreme (UTC):   ${nowIso}`);
    console.log(`User-Agent:    ${USER_AGENT}`);
    console.log(`Baza:          ${opts.dbPath}`);
    console.log(`Izvori fajl:   ${opts.sourcesPath} (v${config.version})`);
    console.log(
      `Migracije:     ${appliedMigrations.length > 0 ? `primenjene [${appliedMigrations.join(', ')}]` : 'već ažurne'}`
    );
    console.log(
      `Sinhronizacija: ${sync.upserted} izvora (${sync.statesInitialized} novih stanja, ${sync.disabledRemoved} isključenih)`
    );
    console.log(
      `Stanje pre:    ${statsBefore.sourcesEnabled}/${statsBefore.sourcesTotal} aktivnih izvora | ${statsBefore.articles} članaka | ${statsBefore.clusters} klastera | ${statsBefore.signals} signala`
    );
    console.log('');

    const publishers = all.filter((x) => x.source.enabled && x.source.role === 'publisher');
    const signals = all.filter((x) => x.source.enabled && x.source.role === 'signal');
    const disabled = all.filter((x) => !x.source.enabled);

    const widths = [16, 12, 6, 8, 12, 10, 18];
    const header = formatRow(
      ['ID', 'ULOGA', 'TIP', 'TEŽINA', 'INTERVAL', 'STATUS', 'KATEGORIJA'],
      widths
    );
    const sep = '-'.repeat(header.length);

    console.log(
      `Plan provere — spremno za preuzimanje: ${due.length} izvora${opts.only ? ` (filter: ${opts.only.join(', ')})` : ''}${opts.force ? ' [--force]' : ''}`
    );
    console.log(sep);
    console.log(header);
    console.log(sep);

    for (const item of [...publishers, ...signals]) {
      const { source, state } = item;
      const status = dueIds.has(source.id) ? 'DUE NOW' : 'WAIT';
      const intervalLabel = `${state.current_interval_min}/${source.maxIntervalMin}m`;
      console.log(
        formatRow(
          [
            source.id,
            source.role,
            source.kind,
            String(source.weight),
            intervalLabel,
            status,
            source.categoryHint,
          ],
          widths
        )
      );
    }

    if (disabled.length > 0) {
      console.log('');
      console.log(
        `Isključeni kandidati (${disabled.length}): ${disabled.map((d) => d.source.id).join(', ')}`
      );
    }

    console.log('');
    if (opts.dry) {
      console.log('[DRY RUN] Nijedan HTTP zahtev nije poslat.');
      return;
    }

    const fetcher = new PoliteFetcher(db);
    const deduplicator = new ArticleDeduplicator(db);
    const nowDate = new Date();

    if (due.length === 0) {
      console.log('[INFO] Nijedan izvor nije dospeo za proveru; osvežavam rangiranje i izvoz.');
    } else {
      const reports = await fetchSourcesBatch(db, due, fetcher);

      const rWidths = [14, 10, 8, 18, 10, 32];
      const rHeader = formatRow(
        ['ID', 'ISHOD', 'FORMAT', 'DEDUP / SIGNALI', 'SLEDEĆI', 'PRVI NASLOV / NAPOMENA'],
        rWidths
      );
      console.log('Rezultati preuzimanja, parsiranja i deduplikacije (F1–F4):');
      console.log('-'.repeat(rHeader.length));
      console.log(rHeader);
      console.log('-'.repeat(rHeader.length));

      for (const rep of reports) {
        const { result, nextState } = rep;
        const entry = entryMap.get(rep.sourceId);

        if (result.kind === 'fetched') {
          if (!entry) continue;
          const { source: src, state: prevState } = entry;
          const parsed = parseFeed(result.body, result.finalUrl, src.maxItems);
          const enrichStats =
            opts.enrichLimit > 0
              ? await enrichMissingMetadata(src, parsed.items, fetcher, {
                  maxFallbackPerSource: opts.enrichLimit,
                })
              : { attempted: 0, enriched: 0, skippedRobots: 0, failed: 0 };

          let summaryCol = '';
          let firstTitle = '(prazno)';
          let effectiveNextMin = nextState.current_interval_min;

          if (src.role === 'signal') {
            const sigs = parsed.items
              .map((item, idx) => normalizeSignalItem(item, src, idx + 1, nowDate))
              .filter((x): x is NonNullable<typeof x> => x !== null);
            for (const sig of sigs) {
              db.upsertSignal(sig);
            }
            summaryCol = `${sigs.length} signala`;
            firstTitle = sigs[0]?.title ?? '(prazno)';
          } else {
            const arts = parsed.items
              .map((item) => normalizeFeedItem(item, src, nowDate))
              .filter((x): x is NonNullable<typeof x> => x !== null);
            const dedupStats = deduplicator.processBatch(arts, src.weight, nowDate);
            const hasNew = dedupStats.inserted > 0 || dedupStats.replacedExisting > 0;

            if (!hasNew) {
              const adjusted = computeNextFetchState(
                src,
                prevState,
                {
                  kind: 'fetched',
                  status: result.status,
                  etag: result.etag,
                  lastModified: result.lastModified,
                  hasNewContent: false,
                },
                nowDate
              );
              db.updateFetchState(adjusted);
              effectiveNextMin = adjusted.current_interval_min;
            }

            summaryCol = `+${dedupStats.inserted} nov / ${dedupStats.recordedDuplicates} dup / ${dedupStats.replacedExisting} zam`;
            firstTitle = arts[0]?.title ?? '(prazno)';
          }

          const enrichTag =
            enrichStats.attempted > 0
              ? ` [HTML+${enrichStats.enriched}/${enrichStats.attempted}]`
              : '';

          console.log(
            formatRow(
              [
                rep.sourceId,
                '200 OK',
                parsed.format.toUpperCase(),
                summaryCol,
                `${effectiveNextMin}m`,
                `${firstTitle.slice(0, 36)}${enrichTag}`,
              ],
              rWidths
            )
          );
        } else {
          const outcomeLabel =
            result.kind === 'not_modified'
              ? '304 SKIP'
              : result.kind === 'rate_limited'
                ? `${result.status} LIMIT`
                : result.kind === 'blocked_robots'
                  ? 'ROBOTS'
                  : `ERR ${result.status ?? '-'}`;

          const note =
            result.kind === 'not_modified' ? `304 #${nextState.consecutive_304}` : result.error;

          console.log(
            formatRow(
              [
                rep.sourceId,
                outcomeLabel,
                '-',
                '-',
                `${nextState.current_interval_min}m`,
                note.slice(0, 44),
              ],
              rWidths
            )
          );
        }
      }
    }

    const purgedNoise = db.purgeNoiseArticles((row) => detectNoiseReason(row) !== null);
    const reclassified = db.reclassifyStoredArticles((row) =>
      classifyNewsCategory(row.title, row.snippet, { url: row.url }, row.defaultCategory)
    );
    if (purgedNoise > 0 || reclassified > 0) {
      console.log(
        `Čišćenje baze: odbačeno ${purgedNoise} šum/lajfstajl članaka, reklasifikovano ${reclassified} članaka`
      );
    }

    const clusterer = new StoryClusterer(db);
    const clusterStats = clusterer.run(nowDate);
    const pruned = db.pruneOldData();
    const ranking = rankActiveClusters(db, nowDate);

    if (!opts.skipBriefing && ranking.globalRanked.length > 0) {
      const llmClient = createGeminiClientFromEnv();
      const briefingGen = new BriefingGenerator(db, fetcher, llmClient, {
        maxNewBriefingsPerRun: opts.maxBriefings,
      });
      const bStats = await briefingGen.generateForRankedClusters(ranking.globalRanked, nowDate);
      if (!bStats.skippedNoApiKey) {
        console.log(
          `AI brifing:    +${bStats.generated} novih | ${bStats.alreadyBriefed} već postoji | ${bStats.skippedNoReadableText} bez teksta | ${bStats.failed} grešaka${bStats.hitRateLimit ? ' [429 pauza]' : ''}`
        );
      }
    }

    if (!opts.noExport) {
      const exported = exportFeeds(db, ranking, opts.outDir, nowDate);
      console.log(
        `JSON izvoz:    ${exported.filesWritten.length} fajlova u ${exported.outDir} (${exported.globalItems} vesti, ${exported.briefedItems} sa AI brifingom)`
      );
    }

    const statsAfter = db.getStats();
    console.log('');
    console.log(
      `Klasterovanje: +${clusterStats.createdClusters} novih klastera, ${clusterStats.joinedExisting} pridruženih vesti, ${clusterStats.signalsMatched} klastera sa GN signalom`
    );
    console.log(
      `Stanje posle:  ${statsAfter.articles} članaka | ${statsAfter.clusters} klastera | ${statsAfter.signals} signala (obrisano >72h: ${pruned.deletedArticles} čl, ${pruned.deletedClusters} kl, ${pruned.deletedSignals} sig)`
    );

    if (ranking.globalRanked.length > 0) {
      console.log('');
      console.log('Top 5 rangiranih klastera (raznovrsnost primenjena):');
      for (const [idx, item] of ranking.globalRanked.slice(0, 5).entries()) {
        const aiTag = item.cluster.ai_briefing_text ? ' [AI]' : '';
        console.log(
          `  ${idx + 1}. [${item.score.toFixed(2)} | ${item.cluster.media_count} med${item.cluster.signal_score > 0 ? ` +GN:${item.cluster.signal_score}` : ''}]${aiTag} (${item.cluster.category} · ${item.leadSourceName}) ${item.lead.title.slice(0, 68)}`
        );
      }
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
