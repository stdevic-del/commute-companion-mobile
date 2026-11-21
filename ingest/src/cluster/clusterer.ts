import type { NewsDatabase } from '../db.ts';
import {
  extractContentTokens,
  TfIdfSimilarityProvider,
  type SimilarityProvider,
  type TextDocument,
} from '../dedup/similarity.ts';
import { normalizeForComparison, sha1Hex } from '../normalize/text.ts';
import type {
  ArticleWithWeight,
  CategoryName,
  ClusterRow,
  PaywallType,
  SignalRow,
} from '../types.ts';

export const DEFAULT_CLUSTER_WINDOW_HOURS = 36;
export const DEFAULT_CLUSTER_THRESHOLD = 0.32;
export const DEFAULT_CROSS_CATEGORY_THRESHOLD = 0.44;
export const DEFAULT_SIGNAL_MATCH_THRESHOLD = 0.34;
export const MAX_SIGNAL_SCORE = 3.0;

/**
 * Opšti entiteti/akteri koji sami po sebi NE čine isti događaj
 * (npr. dve različite utakmice Zvezde ili dve nepovezane izjave predsednika Srbije).
 */
const GENERIC_ACTOR_STEMS = new Set([
  'srbij',
  'srpsk',
  'beograd',
  'novi',
  'sad',
  'predsednik',
  'premijer',
  'ministar',
  'ministr',
  'vlad',
  'drzav',
  'grad',
  'crven',
  'zvezd',
  'partizan',
  'sastanak',
  'izjav',
  'najav',
  'saopst',
  'odluk',
  'evrop',
  'svet',
  'medij',
  'gradjan',
]);

export interface ClustererOptions {
  similarityProvider?: SimilarityProvider;
  windowHours?: number;
  threshold?: number;
  crossCategoryThreshold?: number;
  signalThreshold?: number;
}

export interface ClusterRunStats {
  processedArticles: number;
  joinedExisting: number;
  createdClusters: number;
  recalculatedClusters: number;
  signalsMatched: number;
}

const PAYWALL_PRIORITY: Record<PaywallType, number> = {
  none: 2,
  soft: 1,
  hard: 0,
};

/**
 * Bira glavnu vest (lead article) u klasteru po strogom redosledu prioriteta:
 * 1. Nije iza paywall-a (`none` > `soft` > `hard`)
 * 2. Ima sliku (`image_url !== null`)
 * 3. Veća težina izvora (`sourceWeight`)
 * 4. Svežina (`published_at` noviji)
 */
export function pickLeadArticle(members: ArticleWithWeight[]): ArticleWithWeight {
  if (members.length === 0) {
    throw new Error('pickLeadArticle zahteva bar jedan članak u klasteru.');
  }

  return [...members].sort((a, b) => {
    const payDiff = PAYWALL_PRIORITY[b.article.paywall] - PAYWALL_PRIORITY[a.article.paywall];
    if (payDiff !== 0) return payDiff;

    const imgDiff = Number(Boolean(b.article.image_url)) - Number(Boolean(a.article.image_url));
    if (imgDiff !== 0) return imgDiff;

    if (b.sourceWeight !== a.sourceWeight) return b.sourceWeight - a.sourceWeight;

    if (b.article.published_at !== a.article.published_at) {
      return b.article.published_at.localeCompare(a.article.published_at);
    }

    return a.article.id.localeCompare(b.article.id);
  })[0];
}

/**
 * Određuje kategoriju klastera većinskim glasanjem ponderisanim težinom izvora
 * (kod izjednačenja pobeđuje kategorija glavne vesti).
 */
export function pickClusterCategory(
  members: ArticleWithWeight[],
  lead: ArticleWithWeight
): CategoryName {
  const weights = new Map<CategoryName, number>();
  for (const m of members) {
    weights.set(m.article.category, (weights.get(m.article.category) ?? 0) + m.sourceWeight);
  }

  let bestCat: CategoryName = lead.article.category;
  let bestWeight = -1;
  for (const [cat, total] of weights.entries()) {
    if (
      total > bestWeight ||
      (total === bestWeight && cat === lead.article.category)
    ) {
      bestWeight = total;
      bestCat = cat;
    }
  }
  return bestCat;
}

function getDocumentStems(titleNorm: string, snippet?: string): Set<string> {
  const stems = new Set<string>(extractContentTokens(titleNorm));
  if (snippet) {
    for (const tok of extractContentTokens(normalizeForComparison(snippet))) {
      stems.add(tok);
    }
  }
  return stems;
}

function countSharedStems(
  a: Set<string>,
  b: Set<string>
): { total: number; specific: number } {
  let total = 0;
  let specific = 0;
  for (const stem of a) {
    if (b.has(stem)) {
      total += 1;
      if (!GENERIC_ACTOR_STEMS.has(stem)) {
        specific += 1;
      }
    }
  }
  return { total, specific };
}

function toDoc(entry: ArticleWithWeight): TextDocument {
  return {
    id: entry.article.id,
    titleNorm: entry.article.title_norm,
    snippet: entry.article.snippet,
  };
}

/**
 * Pretvara Google News rang (1 = najistaknutije) u bonus [1.0, 3.0].
 */
function signalRankToBonus(rank: number): number {
  if (rank <= 3) return 3.0;
  if (rank <= 8) return 2.4;
  if (rank <= 15) return 1.8;
  return 1.2;
}

interface ActiveClusterState {
  cluster: ClusterRow;
  members: ArticleWithWeight[];
  lead: ArticleWithWeight;
  memberStems: Map<string, Set<string>>;
}

export class StoryClusterer {
  private readonly db: NewsDatabase;
  private readonly similarityProvider: SimilarityProvider;
  private readonly windowHours: number;
  private readonly threshold: number;
  private readonly crossCategoryThreshold: number;
  private readonly signalThreshold: number;

  constructor(db: NewsDatabase, options: ClustererOptions = {}) {
    this.db = db;
    this.similarityProvider = options.similarityProvider ?? new TfIdfSimilarityProvider();
    this.windowHours = options.windowHours ?? DEFAULT_CLUSTER_WINDOW_HOURS;
    this.threshold = options.threshold ?? DEFAULT_CLUSTER_THRESHOLD;
    this.crossCategoryThreshold =
      options.crossCategoryThreshold ?? DEFAULT_CROSS_CATEGORY_THRESHOLD;
    this.signalThreshold = options.signalThreshold ?? DEFAULT_SIGNAL_MATCH_THRESHOLD;
  }

  private loadActiveClusterStates(now: Date): ActiveClusterState[] {
    const activeRows = this.db.getActiveClusters(this.windowHours, now);
    const states: ActiveClusterState[] = [];

    for (const cluster of activeRows) {
      const members = this.db.getClusterMembers(cluster.id);
      if (members.length === 0) continue;

      const lead =
        members.find((m) => m.article.id === cluster.lead_article_id) ?? pickLeadArticle(members);
      const memberStems = new Map<string, Set<string>>();
      for (const m of members) {
        memberStems.set(m.article.id, getDocumentStems(m.article.title_norm, m.article.snippet));
      }
      states.push({ cluster, members, lead, memberStems });
    }

    return states;
  }

  private matchesCluster(
    incoming: ArticleWithWeight,
    incomingStems: Set<string>,
    state: ActiveClusterState
  ): number {
    const incomingDoc = toDoc(incoming);
    const sameCategory = incoming.article.category === state.cluster.category;
    const requiredThreshold = sameCategory ? this.threshold : this.crossCategoryThreshold;
    const leadFloor = requiredThreshold * 0.72;

    const leadDoc = toDoc(state.lead);
    const leadSim = this.similarityProvider.similarity(incomingDoc, leadDoc);
    if (leadSim < leadFloor) {
      return 0;
    }

    let bestSim = leadSim;
    let bestOverlap = countSharedStems(
      incomingStems,
      state.memberStems.get(state.lead.article.id) ?? new Set()
    );

    for (const member of state.members) {
      if (member.article.id === state.lead.article.id) continue;
      const sim = this.similarityProvider.similarity(incomingDoc, toDoc(member));
      if (sim > bestSim) {
        bestSim = sim;
        bestOverlap = countSharedStems(
          incomingStems,
          state.memberStems.get(member.article.id) ?? new Set()
        );
      }
    }

    // Zaštita od "lažnih parova": potrebna su bar 2 deljena korena I bar 1 specifičan koren događaja
    // (dve različite vesti o istom klubu ili političaru dele samo generičke entitete)
    if (bestSim < requiredThreshold) return 0;
    if (bestOverlap.total < 2 || bestOverlap.specific < 1) return 0;

    return bestSim;
  }

  private recalculateCluster(state: ActiveClusterState): void {
    const lead = pickLeadArticle(state.members);
    const category = pickClusterCategory(state.members, lead);
    const distinctPublishers = this.db.getClusterDistinctPublisherIds(state.cluster.id);
    const mediaCount = Math.max(1, distinctPublishers.length);

    let firstSeenAt = state.members[0].article.published_at;
    let updatedAt = state.members[0].article.published_at;
    for (const m of state.members) {
      if (m.article.published_at < firstSeenAt) firstSeenAt = m.article.published_at;
      if (m.article.published_at > updatedAt) updatedAt = m.article.published_at;
    }

    this.db.updateClusterSummary({
      id: state.cluster.id,
      lead_article_id: lead.article.id,
      category,
      media_count: mediaCount,
      first_seen_at: firstSeenAt,
      updated_at: updatedAt,
    });

    state.lead = lead;
    state.cluster.lead_article_id = lead.article.id;
    state.cluster.category = category;
    state.cluster.media_count = mediaCount;
    state.cluster.first_seen_at = firstSeenAt;
    state.cluster.updated_at = updatedAt;
  }

  /**
   * Inkrementalno klasteruje sve neraspoređene članke iz poslednjih `windowHours` (podrazumevano 36 h),
   * osvežava `media_count` (uključujući `article_duplicates`) i povezuje Google News signale.
   */
  public run(now: Date = new Date()): ClusterRunStats {
    const stats: ClusterRunStats = {
      processedArticles: 0,
      joinedExisting: 0,
      createdClusters: 0,
      recalculatedClusters: 0,
      signalsMatched: 0,
    };

    const states = this.loadActiveClusterStates(now);
    const unclustered = this.db.getUnclusteredArticles(this.windowHours, now);

    for (const incoming of unclustered) {
      stats.processedArticles += 1;
      const incomingStems = getDocumentStems(incoming.article.title_norm, incoming.article.snippet);

      let bestState: ActiveClusterState | null = null;
      let bestScore = 0;

      for (const state of states) {
        const sim = this.matchesCluster(incoming, incomingStems, state);
        if (sim > bestScore) {
          bestScore = sim;
          bestState = state;
        }
      }

      if (bestState) {
        this.db.assignArticleToCluster(incoming.article.id, bestState.cluster.id);
        incoming.article.cluster_id = bestState.cluster.id;
        bestState.members.push(incoming);
        bestState.memberStems.set(incoming.article.id, incomingStems);
        this.recalculateCluster(bestState);
        stats.joinedExisting += 1;
      } else {
        const clusterId = `clu_${sha1Hex(incoming.article.id).slice(0, 16)}`;
        const newCluster: ClusterRow = {
          id: clusterId,
          lead_article_id: incoming.article.id,
          category: incoming.article.category,
          media_count: 1,
          signal_score: 0,
          first_seen_at: incoming.article.published_at,
          updated_at: incoming.article.published_at,
          score: 0,
          ai_briefing_text: null,
          ai_briefing_sources: null,
          ai_briefing_media_count: null,
          ai_briefing_at: null,
        };

        this.db.createCluster(newCluster);
        this.db.assignArticleToCluster(incoming.article.id, clusterId);
        incoming.article.cluster_id = clusterId;

        const memberStems = new Map<string, Set<string>>();
        memberStems.set(incoming.article.id, incomingStems);
        const createdState: ActiveClusterState = {
          cluster: newCluster,
          members: [incoming],
          lead: incoming,
          memberStems,
        };
        // Odmah osveži media_count jer članak možda već ima zabeležene `article_duplicates` iz F4!
        this.recalculateCluster(createdState);
        states.push(createdState);
        stats.createdClusters += 1;
      }
    }

    // Osveži sve aktivne klastere za slučaj da su u F4 stigli novi `article_duplicates` za postojeće članke
    for (const state of states) {
      this.recalculateCluster(state);
      stats.recalculatedClusters += 1;
    }

    // Poveži Google News signale (samo za signal_score u F6 rangiranju, nikad kao izvor)
    stats.signalsMatched = this.refreshSignalScores(states, now);

    return stats;
  }

  private refreshSignalScores(states: ActiveClusterState[], now: Date): number {
    const signals = this.db.getRecentSignals(this.windowHours, now);
    if (states.length === 0) return 0;

    if (signals.length === 0) {
      for (const state of states) {
        if (state.cluster.signal_score !== 0) {
          this.db.updateClusterSignalScore(state.cluster.id, 0);
          state.cluster.signal_score = 0;
        }
      }
      return 0;
    }

    const signalPrepared = signals.map((s: SignalRow) => ({
      signal: s,
      doc: { id: s.id, titleNorm: s.title_norm } satisfies TextDocument,
      stems: getDocumentStems(s.title_norm),
    }));

    let matchedClusters = 0;

    for (const state of states) {
      const leadDoc: TextDocument = {
        id: state.lead.article.id,
        titleNorm: state.lead.article.title_norm,
        snippet: state.lead.article.snippet,
      };
      const leadStems = state.memberStems.get(state.lead.article.id) ?? new Set<string>();

      let bestBonus = 0;
      let matchingSignalCount = 0;

      for (const sp of signalPrepared) {
        const sim = this.similarityProvider.similarity(leadDoc, sp.doc);
        if (sim < this.signalThreshold) continue;
        const overlap = countSharedStems(leadStems, sp.stems);
        if (overlap.total < 2 || overlap.specific < 1) continue;

        matchingSignalCount += 1;
        bestBonus = Math.max(bestBonus, signalRankToBonus(sp.signal.rank));
      }

      // Blagi dodatak ako se tema pojavljuje u više Google News signalnih feedova, limitirano na 3.0
      const finalScore =
        bestBonus > 0
          ? Number(
              Math.min(MAX_SIGNAL_SCORE, bestBonus + Math.max(0, matchingSignalCount - 1) * 0.3).toFixed(2)
            )
          : 0;

      if (finalScore > 0) matchedClusters += 1;
      if (state.cluster.signal_score !== finalScore) {
        this.db.updateClusterSignalScore(state.cluster.id, finalScore);
        state.cluster.signal_score = finalScore;
      }
    }

    return matchedClusters;
  }
}
