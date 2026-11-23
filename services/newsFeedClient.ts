import type {
  ArticlePaywallType,
  NewsReport,
  ScrapedArticle,
  SourceGroupId,
  WeatherSummary,
} from '../types';
import { detectNoiseReason } from '../ingest/src/normalize/filter.ts';

export const DEFAULT_NEWS_FEED_BASE_URL =
  'https://raw.githubusercontent.com/stdevic-del/commute-companion-mobile/news-feed';

export const NEWS_FEED_CACHE_KEY = 'commute_companion_news_feed_cache_v1';
export const NEWS_META_CACHE_KEY = 'commute_companion_news_meta_cache_v1';
export const ONBOARDING_DONE_KEY = 'putni_vodic_onboarding_done';
export const ACTIVE_BRIEFING_PACKAGE_CACHE_KEY = 'putni_vodic_active_briefing_pkg_v1';
export const WEATHER_CACHE_KEY = 'putni_vodic_cached_weather_v1';
export const LIVE_SERVICES_CACHE_KEY = 'commute_companion_live_servisi_v2';

export interface StaticFeedSource {
  id: string;
  name: string;
  url: string;
  publishedAt: string;
}

export interface StaticFeedClusterItem {
  id: string;
  title: string;
  snippet: string;
  url: string;
  imageUrl: string | null;
  category: string;
  categorySlug: string;
  sourceId: string;
  sourceName: string;
  paywall: ArticlePaywallType;
  publishedAt: string;
  updatedAt: string;
  mediaCount: number;
  sources: StaticFeedSource[];
  score: number;
  aiBriefing: string | null;
  aiBriefingSources: string[];
}

export interface StaticFeedPayload {
  schemaVersion: number;
  generatedAt: string;
  feedType: 'global' | 'category';
  category: string | null;
  categorySlug: string | null;
  totalItems: number;
  items: StaticFeedClusterItem[];
}

/**
 * Objedinjeni format odgovora sa centralnog keširanog backenda (`VITE_DATA_API_URL`).
 * Može biti direktan `StaticFeedPayload` ili objedinjeni JSON paket sa vestima, servisima (struja/voda/parking) i vremenom.
 */
export interface UnifiedCentralDataPayload {
  generatedAt?: string;
  items?: StaticFeedClusterItem[];
  news?: StaticFeedPayload | { items: StaticFeedClusterItem[]; generatedAt?: string };
  services?: {
    verzija?: number;
    generisano?: string;
    izvori?: Record<string, { ok: boolean; broj: number; greska?: string }>;
    eds: unknown[];
    direktni: unknown[];
  };
  weather?: WeatherSummary;
}

export interface StaticMetaSourceHealth {
  id: string;
  name: string;
  domain: string;
  role: 'publisher' | 'signal';
  weight: number;
  enabled: boolean;
  paywall: ArticlePaywallType;
  lastStatus: number | null;
  lastFetchedAt: string | null;
  nextCheckAt: string | null;
  currentIntervalMin: number;
  consecutive304: number;
  consecutiveErrors: number;
  lastError: string | null;
}

export interface StaticFeedMeta {
  schemaVersion: number;
  generatedAt: string;
  counts: {
    globalItems: number;
    byCategory: Record<string, number>;
    articlesInDb: number;
    clustersInDb: number;
    briefedClusters: number;
    activeSources: number;
  };
  categories: Array<{
    name: string;
    slug: string;
    file: string;
    count: number;
  }>;
  sources: StaticMetaSourceHealth[];
}

export interface StaticFeedResponse {
  articles: ScrapedArticle[];
  generatedAt: string | null;
  lastSyncedAt: string;
  fromCache: boolean;
  isOfflineFallback: boolean;
}

interface CachedFeedEnvelope {
  payload: StaticFeedPayload;
  cachedAt: string;
}

/**
 * Vraća konfigurabilni centralni endpoint iz `import.meta.env.VITE_DATA_API_URL` ako je definisan.
 */
export function getCentralDataApiUrl(): string | null {
  try {
    const globalOverride = (globalThis as unknown as { __VITE_DATA_API_URL__?: string })
      .__VITE_DATA_API_URL__;
    if (typeof globalOverride === 'string' && globalOverride.trim()) {
      return globalOverride.trim().replace(/\/+$/, '');
    }
    const envUrl =
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string | undefined> }).env
        ?.VITE_DATA_API_URL;
    if (typeof envUrl === 'string' && envUrl.trim()) {
      return envUrl.trim().replace(/\/+$/, '');
    }
  } catch {
    // ignore
  }
  return null;
}

function getFeedBaseUrl(): string {
  const envUrl =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_NEWS_FEED_BASE_URL;
  return (envUrl && envUrl.trim().replace(/\/+$/, '')) || DEFAULT_NEWS_FEED_BASE_URL;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getSafeStorage(): StorageLike | null {
  try {
    const g = globalThis as { localStorage?: StorageLike };
    if (g && g.localStorage && typeof g.localStorage.getItem === 'function') {
      return g.localStorage;
    }
  } catch {
    // ignore storage access errors in private mode
  }
  return null;
}

/**
 * Kešira kompletan tekstualni paket aktivnog brifinga (učitane vesti, servisne informacije za struju/vodu i vreme)
 * u `localStorage` i prosleđuje ga Service Worker-u (`public/sw.js`) u Cache API za nastavak čitanja bez interneta (tunel/garaža).
 */
export function saveCachedBriefingPackage(report: NewsReport): void {
  const storage = getSafeStorage();
  const lightweightReport: NewsReport = {
    ...report,
    audioData: undefined, // Čuvamo kompletan tekstualni paket (transkript, poglavlja, vesti, struja/voda radar, vreme)
  };
  if (storage) {
    try {
      storage.setItem(ACTIVE_BRIEFING_PACKAGE_CACHE_KEY, JSON.stringify(lightweightReport));
    } catch {
      // ignore storage quota errors
    }
  }
  try {
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as unknown as {
            serviceWorker?: {
              controller?: { postMessage: (msg: unknown) => void } | null;
            };
          })
        : null;
    if (nav?.serviceWorker?.controller) {
      nav.serviceWorker.controller.postMessage({
        type: 'CACHE_BRIEFING_PACKAGE',
        payload: lightweightReport,
      });
    }
  } catch {
    // ignore SW postMessage errors
  }
}

/**
 * Čita poslednji lokalno keširani kompletan tekstualni paket aktivnog brifinga.
 */
export function readCachedBriefingPackage(): NewsReport | null {
  const storage = getSafeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(ACTIVE_BRIEFING_PACKAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewsReport;
    if (parsed && typeof parsed.transcript === 'string' && Array.isArray(parsed.chapters)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveCachedWeather(weather: WeatherSummary): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({ weather, cachedAt: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

export function readCachedWeather(): WeatherSummary | null {
  const storage = getSafeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { weather?: WeatherSummary };
    if (parsed?.weather && typeof parsed.weather.tempC === 'number') {
      return parsed.weather;
    }
  } catch {
    // ignore
  }
  return null;
}

export const LISTENED_ARTICLES_STORAGE_KEY = 'putni_vodic_listened_articles_v1';
export const LISTENED_TTL_MS = 24 * 60 * 60 * 1000; // 24 sata
export type NewsSortMode = 'important' | 'latest';

/**
 * Čita mapu preslušanih/pročitanih vesti `{ [id]: timestampMs }` iz `localStorage`
 * i automatski čisti unose starije od 24 sata.
 */
export function readListenedArticleMap(
  nowMs: number = Date.now(),
  storageOverride?: StorageLike | null
): Record<string, number> {
  const storage = storageOverride !== undefined ? storageOverride : getSafeStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(LISTENED_ARTICLES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const clean: Record<string, number> = {};
    let pruned = false;
    for (const [id, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && Number.isFinite(ts) && nowMs - ts <= LISTENED_TTL_MS) {
        clean[id] = ts;
      } else {
        pruned = true;
      }
    }
    if (pruned) {
      try {
        storage.setItem(LISTENED_ARTICLES_STORAGE_KEY, JSON.stringify(clean));
      } catch {
        // ignore
      }
    }
    return clean;
  } catch {
    return {};
  }
}

/**
 * Beleži ID (ili listu ID-jeva klastera/članaka) u `localStorage` sa trenutnim timestamp-om,
 * automatski briše unose starije od 24 sata i vraća ažuriranu mapu.
 */
export function markArticlesAsListened(
  ids: string | string[],
  nowMs: number = Date.now(),
  storageOverride?: StorageLike | null
): Record<string, number> {
  const storage = storageOverride !== undefined ? storageOverride : getSafeStorage();
  const current = readListenedArticleMap(nowMs, storage);
  const idList = (Array.isArray(ids) ? ids : [ids]).map((x) => (x || '').trim()).filter(Boolean);
  if (idList.length === 0) return current;

  const updated: Record<string, number> = { ...current };
  for (const id of idList) {
    updated[id] = nowMs;
  }

  if (storage) {
    try {
      storage.setItem(LISTENED_ARTICLES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage quota errors
    }
  }
  return updated;
}

export function isArticleListened(
  id: string | undefined,
  listenedMap: Record<string, number> | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!id || !listenedMap) return false;
  const ts = listenedMap[id];
  return typeof ts === 'number' && Number.isFinite(ts) && nowMs - ts <= LISTENED_TTL_MS;
}

function getArticleTimestampMs(art: ScrapedArticle, nowMs: number): number {
  const iso = art.updatedAtIso || art.publishedAtIso;
  if (iso) {
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return nowMs;
}

function getArticleMediaCount(art: ScrapedArticle): number {
  return Math.max(
    1,
    Number(art.mediaCount) || 1,
    art.relatedSources?.length || 1,
    art.clusterSources?.length || 1
  );
}

/**
 * Sortira listu vesti za prikaz i audio brifing:
 * - `'latest'` (**Najnovije**): čisto hronološko sortiranje od najnovije ka najstarijoj objavi (bez obzira na `mediaCount`).
 * - `'important'` (**Najvažnije**):
 *    a) Prvo **nepreslušane** višeizvorne priče (`mediaCount >= 2`) iz poslednja 24h (po `mediaCount` silazno, pa svežina/skor).
 *    b) Zatim **nepreslušane** pojedinačne vesti (`mediaCount === 1`), po svežini.
 *    c) Na dnu liste: vesti koje je korisnik već čuo/pročitao tog dana (`Preslušano`).
 */
export function sortArticlesForFeed(
  articles: ScrapedArticle[],
  mode: NewsSortMode,
  listenedMap: Record<string, number> = {},
  nowMs: number = Date.now()
): ScrapedArticle[] {
  const indexed = articles.map((art, idx) => {
    const ts = getArticleTimestampMs(art, nowMs);
    const hasExplicitIso = Boolean(art.updatedAtIso || art.publishedAtIso);
    const ageHours = hasExplicitIso ? Math.max(0, (nowMs - ts) / 3_600_000) : 0;
    const mediaCount = getArticleMediaCount(art);
    const listened = isArticleListened(art.id, listenedMap, nowMs);
    const score = Number(art.score ?? art.importanceScore ?? 0);
    return {
      art,
      idx,
      ts,
      hasExplicitIso,
      ageHours,
      mediaCount,
      listened,
      score,
    };
  });

  if (mode === 'latest') {
    indexed.sort((a, b) => {
      if (a.hasExplicitIso && b.hasExplicitIso && b.ts !== a.ts) {
        return b.ts - a.ts;
      }
      if (a.hasExplicitIso !== b.hasExplicitIso) {
        return a.hasExplicitIso ? -1 : 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    });
    return indexed.map((x) => x.art);
  }

  // mode === 'important' ("Najvažnije")
  indexed.sort((a, b) => {
    // c) Već preslušane vesti idu na dno liste
    if (a.listened !== b.listened) {
      return a.listened ? 1 : -1;
    }

    // a) Višeizvorne priče (mediaCount >= 2) u poslednja 24h imaju prednost nad single-source vestima
    const aMulti24h = a.mediaCount >= 2 && a.ageHours <= 24;
    const bMulti24h = b.mediaCount >= 2 && b.ageHours <= 24;
    if (aMulti24h !== bMulti24h) {
      return aMulti24h ? -1 : 1;
    }

    if (aMulti24h && bMulti24h) {
      if (b.mediaCount !== a.mediaCount) {
        return b.mediaCount - a.mediaCount;
      }
      if (a.hasExplicitIso && b.hasExplicitIso && b.ts !== a.ts) {
        return b.ts - a.ts;
      }
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    }

    // b) Pojedinačne (single-source) vesti po svežini, pa skoru
    if (a.hasExplicitIso && b.hasExplicitIso && b.ts !== a.ts) {
      return b.ts - a.ts;
    }
    if (b.score !== a.score) return b.score - a.score;
    if (b.mediaCount !== a.mediaCount) return b.mediaCount - a.mediaCount;
    return a.idx - b.idx;
  });

  return indexed.map((x) => x.art);
}

/**
 * Formatira relativno vreme objave na srpskom jeziku (npr. "upravo sad", "pre 15 min", "pre 2 h").
 */
export function formatRelativeTimeSr(
  isoString: string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!isoString) return '';
  const ts = Date.parse(isoString);
  if (Number.isNaN(ts)) return '';

  const diffMin = Math.max(0, Math.floor((nowMs - ts) / 60_000));
  if (diffMin < 1) return 'upravo sad';
  if (diffMin < 60) return `pre ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `pre ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'juče';
  return `pre ${diffDays} dana`;
}

export function formatSyncClockSr(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function inferSourceGroup(category: string): SourceGroupId {
  if (category === 'Tehnologija') return 'it_tech';
  return 'domaci_info';
}

/**
 * Pretvara stavku iz statičkog JSON feeda u `ScrapedArticle` (bez `fullText` polja — Sloj 5).
 */
export function mapExportedItemToArticle(
  item: StaticFeedClusterItem,
  index: number,
  nowMs: number = Date.now()
): ScrapedArticle {
  const sourceNames = Array.from(
    new Set(
      (item.sources || [])
        .map((s) => s.name?.trim())
        .filter((name): name is string => Boolean(name))
    )
  );
  if (sourceNames.length === 0 && item.sourceName) {
    sourceNames.push(item.sourceName);
  }

  const refIso = item.updatedAt || item.publishedAt;
  const mediaCount = Math.max(1, Number(item.mediaCount) || sourceNames.length || 1);
  const importanceScore = Math.min(
    99,
    Math.max(45, Math.round(50 + item.score * 10 + mediaCount * 4))
  );

  return {
    id: item.id,
    title: item.title,
    sourceName: item.sourceName || sourceNames[0] || 'Redakcija',
    sourceGroup: inferSourceGroup(item.category),
    category: item.category || 'Društvo',
    summary: item.snippet || '',
    url: item.url,
    publishedAt: formatRelativeTimeSr(refIso, nowMs) || 'nedavno',
    publishedAtIso: item.publishedAt,
    updatedAtIso: item.updatedAt,
    selected: index < 16,
    imageUrl: item.imageUrl ?? null,
    paywall: item.paywall ?? 'none',
    mediaCount,
    relatedSources: sourceNames,
    clusterSources: sourceNames,
    importanceScore,
    score: item.score,
    isBreakingCluster: mediaCount >= 3 || item.score >= 3.0,
    aiBriefing: item.aiBriefing ?? null,
    aiBriefingSources: Array.isArray(item.aiBriefingSources) ? item.aiBriefingSources : [],
    fromStaticFeed: true,
  };
}

/**
 * Gradi čist tekst za audio čitanje vesti:
 * - Ako klaster ima generisan `aiBriefing`, koristi njega.
 * - Ako je `aiBriefing` null (npr. vest van top 20), bezbedno vraća čist fallback (izvor + naslov + uvod).
 */
export function buildArticleBriefingScript(article: ScrapedArticle): string {
  const ai = typeof article.aiBriefing === 'string' ? article.aiBriefing.trim() : '';
  if (ai.length >= 25) {
    return ai;
  }

  const cleanSources = Array.from(
    new Set(
      (article.relatedSources && article.relatedSources.length > 0
        ? article.relatedSources
        : [article.sourceName || 'redakcije']
      )
        .map((s) => s.replace(/\s*\(\+\d+\s*medija\)/i, '').trim())
        .filter(Boolean)
    )
  ).slice(0, 3);

  const sourcePhrase =
    cleanSources.length > 1
      ? `Kako prenose ${cleanSources.slice(0, -1).join(', ')} i ${cleanSources[cleanSources.length - 1]}`
      : `Prema pisanju portala ${cleanSources[0] || 'redakcije'}`;

  const cleanTitle = (article.title || '').trim().replace(/[.!?]+$/, '');
  const rawSummary = (article.summary || '')
    .replace(/^Udarna tema u više redakcija\s*\([^)]+\)\.\s*/i, '')
    .trim();

  const summaryDuplicatesTitle =
    rawSummary.length > 0 &&
    rawSummary.toLowerCase().startsWith(cleanTitle.toLowerCase().slice(0, 24));

  if (rawSummary && !summaryDuplicatesTitle) {
    return `${sourcePhrase}, ${cleanTitle}. ${rawSummary}`;
  }

  return `${sourcePhrase}, ${cleanTitle}.`;
}

/**
 * Gradi kontinuirani brifing počevši od izabrane vesti i nastavljajući narednim vestima na listi.
 */
export function buildContinuousBriefingFromArticle(
  startArticle: ScrapedArticle,
  orderedFeed: ScrapedArticle[],
  maxStories: number = 6
): { title: string; transcript: string; count: number } {
  const startIdx = orderedFeed.findIndex((a) => a.id === startArticle.id);
  const queue: ScrapedArticle[] =
    startIdx >= 0
      ? orderedFeed.slice(startIdx, startIdx + maxStories)
      : [startArticle, ...orderedFeed.filter((a) => a.id !== startArticle.id).slice(0, maxStories - 1)];

  const parts = queue.map((art, idx) => {
    const body = buildArticleBriefingScript(art);
    if (idx === 0) return body;
    return `Sledeća vest iz kategorije ${art.category}. ${body}`;
  });

  return {
    title: startArticle.title,
    transcript: parts.join('\n\n'),
    count: queue.length,
  };
}

export function readCachedStaticFeed(): StaticFeedResponse | null {
  const storage = getSafeStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(NEWS_FEED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFeedEnvelope;
    if (!parsed?.payload || !Array.isArray(parsed.payload.items) || parsed.payload.items.length === 0) {
      return null;
    }

    const nowMs = Date.now();
    const cleanItems = parsed.payload.items.filter(
      (item) =>
        detectNoiseReason({
          url: item.url,
          title: item.title,
          snippet: item.snippet,
        }) === null
    );
    const articles = cleanItems.map((item, idx) =>
      mapExportedItemToArticle(item, idx, nowMs)
    );
    const refTime = parsed.payload.generatedAt || parsed.cachedAt;
    return {
      articles,
      generatedAt: parsed.payload.generatedAt || null,
      lastSyncedAt: formatSyncClockSr(refTime) || 'keširano',
      fromCache: true,
      isOfflineFallback: false,
    };
  } catch {
    return null;
  }
}

function saveCachedStaticFeed(payload: StaticFeedPayload): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    const envelope: CachedFeedEnvelope = {
      payload,
      cachedAt: new Date().toISOString(),
    };
    storage.setItem(NEWS_FEED_CACHE_KEY, JSON.stringify(envelope));
  } catch {
    // ignore quota errors
  }
}

function normalizeCentralOrStaticPayload(
  raw: StaticFeedPayload | UnifiedCentralDataPayload
): StaticFeedPayload | null {
  if (!raw || typeof raw !== 'object') return null;

  const maybeUnified = raw as UnifiedCentralDataPayload;
  const storage = getSafeStorage();

  // Ako centralni endpoint vrati i keširane servise (struja/voda/parking), sačuvaj ih u lokalni keš
  if (
    maybeUnified.services &&
    Array.isArray(maybeUnified.services.eds) &&
    Array.isArray(maybeUnified.services.direktni) &&
    storage
  ) {
    try {
      storage.setItem(LIVE_SERVICES_CACHE_KEY, JSON.stringify(maybeUnified.services));
    } catch {
      // ignore
    }
  }

  // Ako centralni endpoint vrati i keširanu vremensku prognozu, sačuvaj je u lokalni keš
  if (maybeUnified.weather && typeof maybeUnified.weather.tempC === 'number') {
    saveCachedWeather(maybeUnified.weather);
  }

  const itemsList = Array.isArray(maybeUnified.items)
    ? maybeUnified.items
    : maybeUnified.news && Array.isArray(maybeUnified.news.items)
    ? maybeUnified.news.items
    : null;

  if (!itemsList || itemsList.length === 0) return null;

  const generatedAt =
    maybeUnified.generatedAt ||
    (maybeUnified.news && maybeUnified.news.generatedAt) ||
    new Date().toISOString();

  return {
    schemaVersion: 1,
    generatedAt,
    feedType: 'global',
    category: null,
    categorySlug: null,
    totalItems: itemsList.length,
    items: itemsList,
  };
}

/**
 * Čita objedinjeni keširani JSON sa centralnog endpointa (`VITE_DATA_API_URL`) ako je definisan,
 * a ako nije definisan ili poziv ne uspe, koristi statički JSON feed sa grane `news-feed` i lokalni keš.
 */
export async function fetchStaticNewsFeed(options?: {
  forceRefresh?: boolean;
  baseUrl?: string;
  centralApiUrl?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<StaticFeedResponse | null> {
  const baseUrl = (options?.baseUrl || getFeedBaseUrl()).replace(/\/+$/, '');
  const centralUrl =
    options?.centralApiUrl !== undefined ? options.centralApiUrl : getCentralDataApiUrl();
  const timeoutMs = options?.timeoutMs ?? 6_000;
  const fetchFn = options?.fetchImpl ?? fetch;
  const cacheBust = options?.forceRefresh ? `?t=${Math.floor(Date.now() / 60_000)}` : '';

  const candidateUrls: string[] = [];
  if (centralUrl) {
    const cleanCentral = centralUrl.replace(/\/+$/, '');
    const centralEndpoint = cleanCentral.endsWith('.json')
      ? `${cleanCentral}${cacheBust}`
      : `${cleanCentral}/feed.json${cacheBust}`;
    candidateUrls.push(centralEndpoint);
  }
  candidateUrls.push(`${baseUrl}/feed.json${cacheBust}`);

  for (const url of candidateUrls) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      let res: Response;
      try {
        res = await fetchFn(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller?.signal,
        });
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (!res.ok) {
        continue;
      }

      const rawJson = (await res.json()) as StaticFeedPayload | UnifiedCentralDataPayload;
      const payload = normalizeCentralOrStaticPayload(rawJson);
      if (!payload) {
        continue;
      }

      saveCachedStaticFeed(payload);
      const nowMs = Date.now();
      const cleanItems = payload.items.filter(
        (item) =>
          detectNoiseReason({
            url: item.url,
            title: item.title,
            snippet: item.snippet,
          }) === null
      );
      const articles = cleanItems.map((item, idx) => mapExportedItemToArticle(item, idx, nowMs));

      return {
        articles,
        generatedAt: payload.generatedAt || null,
        lastSyncedAt:
          formatSyncClockSr(payload.generatedAt) || formatSyncClockSr(new Date().toISOString()),
        fromCache: false,
        isOfflineFallback: false,
      };
    } catch {
      // Ako centralni endpoint ne uspe, prelazi na sledeći kandidat (statički feed -> lokalni keš)
    }
  }

  const cached = readCachedStaticFeed();
  if (cached) {
    return {
      ...cached,
      fromCache: true,
      isOfflineFallback: true,
    };
  }
  return null;
}

export async function fetchStaticFeedMeta(options?: {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<StaticFeedMeta | null> {
  const baseUrl = (options?.baseUrl || getFeedBaseUrl()).replace(/\/+$/, '');
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const fetchFn = options?.fetchImpl ?? fetch;
  const storage = getSafeStorage();

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}/meta.json`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = (await res.json()) as StaticFeedMeta;
    if (storage && meta && typeof meta === 'object') {
      try {
        storage.setItem(NEWS_META_CACHE_KEY, JSON.stringify(meta));
      } catch {
        // ignore
      }
    }
    return meta;
  } catch {
    if (!storage) return null;
    try {
      const cached = storage.getItem(NEWS_META_CACHE_KEY);
      return cached ? (JSON.parse(cached) as StaticFeedMeta) : null;
    } catch {
      return null;
    }
  }
}
