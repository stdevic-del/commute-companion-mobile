import type { PoliteFetcher } from '../fetcher.ts';
import type { SourceConfig } from '../types.ts';
import { parseHtmlArticle } from './htmlParser.ts';
import type { ParsedFeedItem } from './types.ts';

export interface EnrichOptions {
  /** Maksimalan broj HTML fallback zahteva po izvoru u jednom ciklusu (podrazumevano 3). */
  maxFallbackPerSource?: number;
}

export interface EnrichStats {
  attempted: number;
  enriched: number;
  skippedRobots: number;
  failed: number;
}

function needsEnrichment(item: ParsedFeedItem): boolean {
  return !item.imageUrl || !item.publishedAtRaw || !item.descriptionRaw;
}

/**
 * Dopunjuje RSS/Atom stavke kojima fali slika, datum ili opis preko pristojnog HTML fallback-a
 * (Schema.org NewsArticle + Open Graph).
 * - Nikad se ne izvršava za signalne izvore (npr. Google News)
 * - Strogo ograničeno na `maxFallbackPerSource` po izvoru po ciklusu
 * - Sirovi HTML se odmah odbacuje iz memorije (Sloj 5)
 */
export async function enrichMissingMetadata(
  source: SourceConfig,
  items: ParsedFeedItem[],
  fetcher: PoliteFetcher,
  options: EnrichOptions = {}
): Promise<EnrichStats> {
  const stats: EnrichStats = {
    attempted: 0,
    enriched: 0,
    skippedRobots: 0,
    failed: 0,
  };

  if (source.role !== 'publisher') {
    return stats;
  }

  const limit = Math.max(0, options.maxFallbackPerSource ?? 3);
  if (limit === 0) return stats;

  for (const item of items) {
    if (stats.attempted >= limit) break;
    if (!needsEnrichment(item)) continue;

    stats.attempted += 1;
    const res = await fetcher.fetchUrl(item.url, {
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    });

    if (res.kind === 'blocked_robots') {
      stats.skippedRobots += 1;
      continue;
    }

    if (res.kind !== 'fetched') {
      stats.failed += 1;
      continue;
    }

    const meta = parseHtmlArticle(res.body, res.finalUrl);
    let changed = false;

    if (!item.imageUrl && meta.imageUrl) {
      item.imageUrl = meta.imageUrl;
      changed = true;
    }
    if (!item.publishedAtRaw && meta.publishedAtRaw) {
      item.publishedAtRaw = meta.publishedAtRaw;
      changed = true;
    }
    if (!item.descriptionRaw && meta.description) {
      item.descriptionRaw = meta.description;
      changed = true;
    }
    if (!item.canonicalUrlHint && meta.canonicalUrl) {
      item.canonicalUrlHint = meta.canonicalUrl;
      changed = true;
    }
    if (!item.paywallHint && meta.paywallHint) {
      item.paywallHint = meta.paywallHint;
      changed = true;
    }

    if (changed) {
      stats.enriched += 1;
    }
  }

  return stats;
}
