import { CANONICAL_CATEGORIES } from '../../../shared/categories.ts';
import type { NewsDatabase } from '../db.ts';
import {
  TfIdfSimilarityProvider,
  type SimilarityProvider,
  type TextDocument,
} from '../dedup/similarity.ts';
import type {
  ArticleRow,
  CategoryName,
  ClusterRow,
  PaywallType,
} from '../types.ts';

export const DEFAULT_RANK_WINDOW_HOURS = 48;
export const DEFAULT_DIVERSITY_TOP_N = 5;
export const DEFAULT_MAX_PER_SOURCE_IN_TOP = 2;
export const DEFAULT_MAX_PER_CATEGORY_IN_TOP = 2;
export const DEFAULT_MAX_PER_NARROW_TOPIC_IN_TOP = 2;
export const DEFAULT_NARROW_TOPIC_THRESHOLD = 0.30;

export interface ScoreInput {
  sourceWeight: number;
  mediaCount: number;
  signalScore: number;
  referenceTimeIso: string;
}

export interface ClusterSourceSummary {
  sourceId: string;
  sourceName: string;
  sourceWeight: number;
  url: string;
  publishedAt: string;
  paywall: PaywallType;
  isDuplicate: boolean;
}

export interface RankedCluster {
  cluster: ClusterRow;
  lead: ArticleRow;
  leadSourceName: string;
  leadSourceWeight: number;
  sources: ClusterSourceSummary[];
  score: number;
  ageHours: number;
}

export interface DiversityOptions {
  /** Veličina vrha liste na koji se primenjuje pravilo (podrazumevano 5). */
  topN?: number;
  /** Najviše vesti sa istog glavnog izvora u prvih `topN` (podrazumevano 2). */
  maxPerSource?: number;
  /** Najviše vesti iz iste kategorije u prvih `topN`; `null` isključuje ograničenje (za feedove po kategoriji). */
  maxPerCategory?: number | null;
  /** Najviše vesti iz iste uske teme u prvih `topN` (podrazumevano 2). */
  maxPerNarrowTopic?: number;
  /** Prag TF-IDF sličnosti za "istu usku temu" (podrazumevano 0.30). */
  narrowTopicThreshold?: number;
  similarityProvider?: SimilarityProvider;
}

export interface RankingResult {
  globalRanked: RankedCluster[];
  byCategory: Record<CategoryName, RankedCluster[]>;
}

/**
 * Transparentna formula za rangiranje (Sloj 3 + Google News signal):
 *   Skor = (Težina_izvora + Broj_medija_u_klasteru + GN_bonus) / ((Starost_u_satima + 2) ^ 1.5)
 * Starost koristi vreme najnovije vesti u klasteru i nikad nije negativna (`Math.max(0, ...)`).
 */
export function computeClusterScore(
  input: ScoreInput,
  now: Date = new Date()
): { score: number; ageHours: number } {
  const refMs = Date.parse(input.referenceTimeIso);
  const rawAgeHours = Number.isNaN(refMs)
    ? 0
    : (now.getTime() - refMs) / 3_600_000;
  const ageHours = Math.max(0, rawAgeHours);

  const numerator =
    Math.max(0, input.sourceWeight) +
    Math.max(1, input.mediaCount) +
    Math.max(0, input.signalScore);
  const denominator = Math.pow(ageHours + 2, 1.5);
  const score = Number((numerator / denominator).toFixed(6));

  return {
    score,
    ageHours: Number(ageHours.toFixed(3)),
  };
}

function toTextDoc(item: RankedCluster): TextDocument {
  return {
    id: item.cluster.id,
    titleNorm: item.lead.title_norm,
    snippet: item.lead.snippet,
  };
}

/**
 * Primenjuje pravilo raznovrsnosti na prvih `topN` pozicija:
 * - NIKAD ne briše vesti; višak samo spušta na pozicije `topN + 1` i niže (čuvajući redosled po skoru).
 * - Ako nema dovoljno različitih izvora/kategorija da se popuni prvih `topN`, dopunjava ih
 *   najbolje rangiranim odloženim vestima kako vrh nikada ne bi ostao poluprazan.
 */
export function applyDiversityRule(
  sortedItems: RankedCluster[],
  options: DiversityOptions = {}
): RankedCluster[] {
  const topN = Math.max(1, options.topN ?? DEFAULT_DIVERSITY_TOP_N);
  if (sortedItems.length <= 1) return [...sortedItems];

  const maxPerSource = Math.max(1, options.maxPerSource ?? DEFAULT_MAX_PER_SOURCE_IN_TOP);
  const maxPerCategory =
    options.maxPerCategory === undefined
      ? DEFAULT_MAX_PER_CATEGORY_IN_TOP
      : options.maxPerCategory;
  const maxPerNarrowTopic = Math.max(
    1,
    options.maxPerNarrowTopic ?? DEFAULT_MAX_PER_NARROW_TOPIC_IN_TOP
  );
  const narrowThreshold = options.narrowTopicThreshold ?? DEFAULT_NARROW_TOPIC_THRESHOLD;
  const similarity = options.similarityProvider ?? new TfIdfSimilarityProvider();

  const top: RankedCluster[] = [];
  const topDocs: TextDocument[] = [];
  const deferred: RankedCluster[] = [];
  const rest: RankedCluster[] = [];

  const sourceCounts = new Map<string, number>();
  const categoryCounts = new Map<CategoryName, number>();

  for (const item of sortedItems) {
    if (top.length >= topN) {
      rest.push(item);
      continue;
    }

    const srcCount = sourceCounts.get(item.lead.source_id) ?? 0;
    if (srcCount >= maxPerSource) {
      deferred.push(item);
      continue;
    }

    if (maxPerCategory !== null) {
      const catCount = categoryCounts.get(item.cluster.category) ?? 0;
      if (catCount >= maxPerCategory) {
        deferred.push(item);
        continue;
      }
    }

    const itemDoc = toTextDoc(item);
    let similarTopicCount = 0;
    for (const prevDoc of topDocs) {
      if (similarity.similarity(itemDoc, prevDoc) >= narrowThreshold) {
        similarTopicCount += 1;
      }
    }
    // Ako već postoji (maxPerNarrowTopic - 1) ili više sličnih u vrhu -> dodavanje bi prešlo limit
    if (similarTopicCount >= maxPerNarrowTopic) {
      deferred.push(item);
      continue;
    }

    top.push(item);
    topDocs.push(itemDoc);
    sourceCounts.set(item.lead.source_id, srcCount + 1);
    categoryCounts.set(
      item.cluster.category,
      (categoryCounts.get(item.cluster.category) ?? 0) + 1
    );
  }

  // Fallback: ako baza trenutno nema dovoljno različitih izvora/kategorija, popuni prvih topN
  // najbolje rangiranim odloženim vestima da vrh liste nikada ne bude poluprazan
  while (top.length < topN && deferred.length > 0) {
    const next = deferred.shift()!;
    top.push(next);
  }

  return enforceMaxConsecutiveSource([...top, ...deferred, ...rest], maxPerSource);
}

/**
 * Obezbeđuje da nijedan medij nema više od `maxConsecutive` (podrazumevano 2) članaka zaredom
 * u rangiranoj listi, spuštanjem trećeg uzastopnog članka istog izvora iza prvog dostupnog članka drugog medija.
 */
export function enforceMaxConsecutiveSource(
  items: RankedCluster[],
  maxConsecutive: number = DEFAULT_MAX_PER_SOURCE_IN_TOP
): RankedCluster[] {
  const cap = Math.max(1, maxConsecutive);
  if (items.length <= cap) return [...items];

  const pool = [...items];
  const out: RankedCluster[] = [];

  while (pool.length > 0) {
    let lastSourceId: string | null = null;
    let consecutiveCount = 0;

    if (out.length >= cap) {
      lastSourceId = out[out.length - 1].lead.source_id;
      for (let i = out.length - 1; i >= 0; i -= 1) {
        if (out[i].lead.source_id === lastSourceId) {
          consecutiveCount += 1;
        } else {
          break;
        }
      }
    }

    if (consecutiveCount >= cap && lastSourceId !== null) {
      const altIdx = pool.findIndex((candidate) => candidate.lead.source_id !== lastSourceId);
      if (altIdx !== -1) {
        const [picked] = pool.splice(altIdx, 1);
        out.push(picked);
        continue;
      }
    }

    out.push(pool.shift()!);
  }

  return out;
}

export interface SortClustersByImportanceOptions {
  listenedIds?: ReadonlySet<string> | Record<string, number>;
  multiSourceWindowHours?: number;
}

function isIdInListened(
  id: string | undefined,
  listenedIds?: ReadonlySet<string> | Record<string, number>
): boolean {
  if (!id || !listenedIds) return false;
  if (listenedIds instanceof Set || typeof (listenedIds as ReadonlySet<string>).has === 'function') {
    return (listenedIds as ReadonlySet<string>).has(id);
  }
  const rec = listenedIds as Record<string, number>;
  return typeof rec[id] === 'number' && rec[id] > 0;
}

/**
 * Sortira klastere za prikaz i brifing ("Najvažnije"):
 * 1) Nepreslušane vesti uvek imaju prednost nad već preslušanim/pročitanim vestima.
 * 2) Među vestima sa istim statusom preslušanosti u poslednjih 24h (`multiSourceWindowHours`):
 *    - Višeizvorne priče (`media_count >= 2 && ageHours <= 24`) uvek imaju prednost nad
 *      pojedinačnim (single-source) vestima objavljenim tokom noći, sortirane po `media_count` silazno,
 *      pa zatim po skoru svežine (`score`) i vremenu (`updated_at`).
 *    - Pojedinačne (single-source) priče sortiraju se po skoru svežine (`score`) i vremenu.
 */
export function sortClustersByImportance(
  clusters: RankedCluster[],
  options: SortClustersByImportanceOptions = {}
): RankedCluster[] {
  const multiSourceWindowHours = options.multiSourceWindowHours ?? 24;
  const listenedIds = options.listenedIds;

  const isClusterListened = (item: RankedCluster): boolean =>
    isIdInListened(item.cluster.id, listenedIds) || isIdInListened(item.lead.id, listenedIds);

  return [...clusters].sort((a, b) => {
    const aListened = isClusterListened(a);
    const bListened = isClusterListened(b);
    if (aListened !== bListened) {
      return aListened ? 1 : -1;
    }

    const aMulti24h = a.cluster.media_count >= 2 && a.ageHours <= multiSourceWindowHours;
    const bMulti24h = b.cluster.media_count >= 2 && b.ageHours <= multiSourceWindowHours;

    if (aMulti24h !== bMulti24h) {
      return aMulti24h ? -1 : 1;
    }

    if (aMulti24h && bMulti24h && b.cluster.media_count !== a.cluster.media_count) {
      return b.cluster.media_count - a.cluster.media_count;
    }

    if (b.score !== a.score) return b.score - a.score;
    if (b.cluster.media_count !== a.cluster.media_count) {
      return b.cluster.media_count - a.cluster.media_count;
    }
    if (b.cluster.updated_at !== a.cluster.updated_at) {
      return b.cluster.updated_at.localeCompare(a.cluster.updated_at);
    }
    return a.cluster.id.localeCompare(b.cluster.id);
  });
}

export interface RankActiveOptions {
  windowHours?: number;
  similarityProvider?: SimilarityProvider;
  listenedIds?: ReadonlySet<string> | Record<string, number>;
}

/**
 * Računa skor za sve aktivne klastere, upisuje skor u SQLite i vraća:
 * - `globalRanked`: globalni feed sa raznovrsnošću po izvoru, kategoriji i uskoj temi u prvih 5
 * - `byCategory`: pojedinačne liste po kategoriji sa raznovrsnošću po izvoru (i uskoj temi), bez limita kategorije
 */
export function rankActiveClusters(
  db: NewsDatabase,
  now: Date = new Date(),
  options: RankActiveOptions = {}
): RankingResult {
  const windowHours = options.windowHours ?? DEFAULT_RANK_WINDOW_HOURS;
  const similarityProvider = options.similarityProvider ?? new TfIdfSimilarityProvider();

  const activeClusters = db.getActiveClusters(windowHours, now);
  const allSources = db.getAllSourcesWithState();
  const sourceMetaMap = new Map(allSources.map((x) => [x.source.id, x.source]));

  const scored: RankedCluster[] = [];
  const dbScoreUpdates: Array<{ id: string; score: number }> = [];

  for (const cluster of activeClusters) {
    const members = db.getClusterMembers(cluster.id);
    if (members.length === 0) continue;

    const leadEntry =
      members.find((m) => m.article.id === cluster.lead_article_id) ?? members[0];
    const leadSource = sourceMetaMap.get(leadEntry.article.source_id);
    const leadSourceWeight = leadSource?.weight ?? leadEntry.sourceWeight;
    const leadSourceName = leadSource?.name ?? leadEntry.article.source_id;

    // Koristimo vreme najnovije vesti u klasteru (cluster.updated_at), fallback lead.published_at
    const referenceTimeIso = cluster.updated_at || leadEntry.article.published_at;
    const { score, ageHours } = computeClusterScore(
      {
        sourceWeight: leadSourceWeight,
        mediaCount: cluster.media_count,
        signalScore: cluster.signal_score,
        referenceTimeIso,
      },
      now
    );

    const updatedCluster: ClusterRow = { ...cluster, score };
    const sources = db.getClusterPublisherSources(cluster.id);

    scored.push({
      cluster: updatedCluster,
      lead: leadEntry.article,
      leadSourceName,
      leadSourceWeight,
      sources,
      score,
      ageHours,
    });
    dbScoreUpdates.push({ id: cluster.id, score });
  }

  db.updateClusterScores(dbScoreUpdates);

  const orderedScored = sortClustersByImportance(scored, {
    listenedIds: options.listenedIds,
    multiSourceWindowHours: 24,
  });
  scored.splice(0, scored.length, ...orderedScored);

  // Globalni feed: izvor <= 2, kategorija <= 2, uska tema <= 2 u prvih 5
  const globalRanked = applyDiversityRule(scored, {
    topN: DEFAULT_DIVERSITY_TOP_N,
    maxPerSource: DEFAULT_MAX_PER_SOURCE_IN_TOP,
    maxPerCategory: DEFAULT_MAX_PER_CATEGORY_IN_TOP,
    maxPerNarrowTopic: DEFAULT_MAX_PER_NARROW_TOPIC_IN_TOP,
    similarityProvider,
  });

  // Kategorijski feedovi: samo izvor <= 2 (i uska tema <= 2), bez limita kategorije
  const byCategory = {} as Record<CategoryName, RankedCluster[]>;
  for (const cat of CANONICAL_CATEGORIES) {
    const catItems = scored.filter((item) => item.cluster.category === cat);
    byCategory[cat] = applyDiversityRule(catItems, {
      topN: DEFAULT_DIVERSITY_TOP_N,
      maxPerSource: DEFAULT_MAX_PER_SOURCE_IN_TOP,
      maxPerCategory: null,
      maxPerNarrowTopic: DEFAULT_MAX_PER_NARROW_TOPIC_IN_TOP,
      similarityProvider,
    });
  }

  return { globalRanked, byCategory };
}
