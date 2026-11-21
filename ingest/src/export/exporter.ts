import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_CATEGORIES, categoryToSlug } from '../../../shared/categories.ts';
import type { NewsDatabase } from '../db.ts';
import type { RankedCluster, RankingResult } from '../rank/ranker.ts';
import type { CategoryName, PaywallType, SourceRole } from '../types.ts';

export const FEED_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_GLOBAL_ITEMS = 80;
export const DEFAULT_MAX_CATEGORY_ITEMS = 40;
export const IMAGE_PROXY_BASE = 'https://wsrv.nl/';

export interface ExportedSource {
  id: string;
  name: string;
  url: string;
  publishedAt: string;
}

export interface ExportedClusterItem {
  id: string;
  title: string;
  snippet: string;
  url: string;
  imageUrl: string | null;
  category: CategoryName;
  categorySlug: string;
  sourceId: string;
  sourceName: string;
  paywall: PaywallType;
  publishedAt: string;
  updatedAt: string;
  mediaCount: number;
  sources: ExportedSource[];
  score: number;
  aiBriefing: string | null;
  aiBriefingSources: string[];
}

export interface ExportedFeedFile {
  schemaVersion: typeof FEED_SCHEMA_VERSION;
  generatedAt: string;
  feedType: 'global' | 'category';
  category: CategoryName | null;
  categorySlug: string | null;
  totalItems: number;
  items: ExportedClusterItem[];
}

export interface ExportedSourceHealth {
  id: string;
  name: string;
  domain: string;
  role: SourceRole;
  weight: number;
  enabled: boolean;
  paywall: PaywallType;
  lastStatus: number | null;
  lastFetchedAt: string | null;
  nextCheckAt: string | null;
  currentIntervalMin: number;
  consecutive304: number;
  consecutiveErrors: number;
  lastError: string | null;
}

export interface ExportedMetaFile {
  schemaVersion: typeof FEED_SCHEMA_VERSION;
  generatedAt: string;
  counts: {
    globalItems: number;
    byCategory: Record<CategoryName, number>;
    articlesInDb: number;
    clustersInDb: number;
    briefedClusters: number;
    activeSources: number;
  };
  categories: Array<{
    name: CategoryName;
    slug: string;
    file: string;
    count: number;
  }>;
  sources: ExportedSourceHealth[];
}

export interface ExportSummary {
  outDir: string;
  filesWritten: string[];
  globalItems: number;
  briefedItems: number;
}

export interface ExportOptions {
  maxGlobalItems?: number;
  maxCategoryItems?: number;
}

/**
 * Gradi WebP proxy URL preko `wsrv.nl` sa urednim `encodeURIComponent` kodiranjem:
 * `https://wsrv.nl/?url=<encoded>&w=640&output=webp&q=80&we`
 * Vraća čist `null` kada vest nema validnu http/https sliku.
 */
export function buildOptimizedImageUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'wsrv.nl' || host === 'images.weserv.nl') {
    return trimmed;
  }

  return `${IMAGE_PROXY_BASE}?url=${encodeURIComponent(trimmed)}&w=640&output=webp&q=80&we`;
}

function parseBriefingSources(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    }
  } catch {
    // ignore malformed JSON
  }
  return [];
}

function serializeCluster(item: RankedCluster): ExportedClusterItem {
  const category = item.cluster.category;
  const sources: ExportedSource[] = item.sources.map((s) => ({
    id: s.sourceId,
    name: s.sourceName,
    url: s.url,
    publishedAt: s.publishedAt,
  }));

  if (sources.length === 0) {
    sources.push({
      id: item.lead.source_id,
      name: item.leadSourceName,
      url: item.lead.url,
      publishedAt: item.lead.published_at,
    });
  }

  return {
    id: item.cluster.id,
    title: item.lead.title,
    snippet: item.lead.snippet,
    url: item.lead.url,
    imageUrl: buildOptimizedImageUrl(item.lead.image_url),
    category,
    categorySlug: categoryToSlug(category),
    sourceId: item.lead.source_id,
    sourceName: item.leadSourceName,
    paywall: item.lead.paywall,
    publishedAt: item.lead.published_at,
    updatedAt: item.cluster.updated_at,
    mediaCount: item.cluster.media_count,
    sources,
    score: Number(item.score.toFixed(4)),
    aiBriefing: item.cluster.ai_briefing_text ?? null,
    aiBriefingSources: parseBriefingSources(item.cluster.ai_briefing_sources),
  };
}

function writeJsonFile(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

/**
 * Izvozi statičke JSON fajlove spremne za brzu CDN isporuku (<200 ms):
 * - `feed.json` (globalno rangirana lista sa raznovrsnošću u top 5)
 * - `<slug>.json` (10 fajlova po kanonskoj kategoriji)
 * - `meta.json` (metapodaci, brojači i zdravlje izvora)
 */
export function exportFeeds(
  db: NewsDatabase,
  ranking: RankingResult,
  outDir: string,
  now: Date = new Date(),
  options: ExportOptions = {}
): ExportSummary {
  const generatedAt = now.toISOString();
  const maxGlobal = options.maxGlobalItems ?? DEFAULT_MAX_GLOBAL_ITEMS;
  const maxCat = options.maxCategoryItems ?? DEFAULT_MAX_CATEGORY_ITEMS;

  mkdirSync(outDir, { recursive: true });
  const filesWritten: string[] = [];

  // 1. Globalni feed.json
  const globalItems = ranking.globalRanked.slice(0, maxGlobal).map(serializeCluster);
  const globalPayload: ExportedFeedFile = {
    schemaVersion: FEED_SCHEMA_VERSION,
    generatedAt,
    feedType: 'global',
    category: null,
    categorySlug: null,
    totalItems: globalItems.length,
    items: globalItems,
  };
  writeJsonFile(join(outDir, 'feed.json'), globalPayload);
  filesWritten.push('feed.json');

  // 2. Pojedinačni kategorijski JSON fajlovi
  const byCategoryCounts = {} as Record<CategoryName, number>;
  const categoryIndex: ExportedMetaFile['categories'] = [];

  for (const cat of CANONICAL_CATEGORIES) {
    const slug = categoryToSlug(cat);
    const fileName = `${slug}.json`;
    const items = (ranking.byCategory[cat] ?? []).slice(0, maxCat).map(serializeCluster);
    byCategoryCounts[cat] = items.length;

    const catPayload: ExportedFeedFile = {
      schemaVersion: FEED_SCHEMA_VERSION,
      generatedAt,
      feedType: 'category',
      category: cat,
      categorySlug: slug,
      totalItems: items.length,
      items,
    };
    writeJsonFile(join(outDir, fileName), catPayload);
    filesWritten.push(fileName);

    categoryIndex.push({
      name: cat,
      slug,
      file: fileName,
      count: items.length,
    });
  }

  // 3. meta.json (zdravlje izvora i statistika za nadzor / F10)
  const dbStats = db.getStats();
  const allSources = db.getAllSourcesWithState();
  const briefedItems = globalItems.filter((i) => Boolean(i.aiBriefing)).length;

  const metaPayload: ExportedMetaFile = {
    schemaVersion: FEED_SCHEMA_VERSION,
    generatedAt,
    counts: {
      globalItems: globalItems.length,
      byCategory: byCategoryCounts,
      articlesInDb: dbStats.articles,
      clustersInDb: dbStats.clusters,
      briefedClusters: briefedItems,
      activeSources: dbStats.sourcesEnabled,
    },
    categories: categoryIndex,
    sources: allSources.map(({ source, state }) => ({
      id: source.id,
      name: source.name,
      domain: source.domain,
      role: source.role,
      weight: source.weight,
      enabled: source.enabled,
      paywall: source.paywall,
      lastStatus: state.last_status,
      lastFetchedAt: state.last_fetched_at,
      nextCheckAt: state.next_check_at,
      currentIntervalMin: state.current_interval_min,
      consecutive304: state.consecutive_304,
      consecutiveErrors: state.consecutive_errors,
      lastError: state.last_error,
    })),
  };

  writeJsonFile(join(outDir, 'meta.json'), metaPayload);
  filesWritten.push('meta.json');

  return {
    outDir,
    filesWritten,
    globalItems: globalItems.length,
    briefedItems,
  };
}
