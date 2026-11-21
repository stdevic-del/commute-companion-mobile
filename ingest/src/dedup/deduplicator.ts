import type { NewsDatabase } from '../db.ts';
import type { NormalizedArticle } from '../normalize/index.ts';
import type { ArticleWithWeight, DuplicateReason } from '../types.ts';
import {
  extractContentTokens,
  TfIdfSimilarityProvider,
  type SimilarityProvider,
  type TextDocument,
} from './similarity.ts';

/**
 * Visok prag za deduplikaciju: hvata samo skoro identične tekstove (prepisane agencijske vesti).
 * Različiti tekstovi o istom događaju (npr. 0.45–0.75) ostaju odvojeni da bi ih F5 klasterovao.
 */
export const DEFAULT_SEMANTIC_DEDUP_THRESHOLD = 0.82;
export const DEFAULT_DEDUP_WINDOW_HOURS = 48;

export interface DeduplicatorOptions {
  similarityProvider?: SimilarityProvider;
  semanticThreshold?: number;
  windowHours?: number;
}

export type DedupDecision =
  | { action: 'inserted'; articleId: string }
  | { action: 'skip_exact_url'; existingId: string }
  | { action: 'skip_same_source_duplicate'; existingId: string; reason: DuplicateReason; similarity: number }
  | {
      action: 'recorded_duplicate';
      existingId: string;
      reason: DuplicateReason;
      similarity: number;
    }
  | {
      action: 'replaced_existing';
      articleId: string;
      replacedId: string;
      reason: DuplicateReason;
      similarity: number;
    };

export interface DedupBatchStats {
  inserted: number;
  skippedExactUrl: number;
  skippedSameSource: number;
  recordedDuplicates: number;
  replacedExisting: number;
}

/**
 * Odlučuje da li dolazna vest zamenjuje postojeću kod detektovanog duplikata:
 * 1. Pobeđuje izvor sa većom težinom (`weight`)
 * 2. Ako su težine jednake, pobeđuje starija vest (`published_at`, pa `first_seen_at`)
 */
export function shouldIncomingReplaceExisting(
  incoming: NormalizedArticle,
  incomingWeight: number,
  existing: ArticleWithWeight
): boolean {
  if (incomingWeight !== existing.sourceWeight) {
    return incomingWeight > existing.sourceWeight;
  }
  if (incoming.published_at !== existing.article.published_at) {
    return incoming.published_at < existing.article.published_at;
  }
  return incoming.first_seen_at < existing.article.first_seen_at;
}

function toTextDoc(id: string, titleNorm: string, snippet: string): TextDocument {
  return { id, titleNorm, snippet };
}

export class ArticleDeduplicator {
  private readonly db: NewsDatabase;
  private readonly similarityProvider: SimilarityProvider;
  private readonly semanticThreshold: number;
  private readonly windowHours: number;

  constructor(db: NewsDatabase, options: DeduplicatorOptions = {}) {
    this.db = db;
    this.similarityProvider = options.similarityProvider ?? new TfIdfSimilarityProvider();
    this.semanticThreshold = options.semanticThreshold ?? DEFAULT_SEMANTIC_DEDUP_THRESHOLD;
    this.windowHours = options.windowHours ?? DEFAULT_DEDUP_WINDOW_HOURS;
  }

  private resolveCrossSourceDuplicate(
    incoming: NormalizedArticle,
    incomingWeight: number,
    existing: ArticleWithWeight,
    reason: DuplicateReason,
    similarity: number,
    nowIso: string
  ): DedupDecision {
    if (existing.article.source_id === incoming.source_id) {
      return {
        action: 'skip_same_source_duplicate',
        existingId: existing.article.id,
        reason,
        similarity,
      };
    }

    if (shouldIncomingReplaceExisting(incoming, incomingWeight, existing)) {
      this.db.promoteDuplicateReplacement(
        existing.article.id,
        incoming,
        reason,
        similarity,
        nowIso
      );
      return {
        action: 'replaced_existing',
        articleId: incoming.id,
        replacedId: existing.article.id,
        reason,
        similarity,
      };
    }

    this.db.recordArticleDuplicate({
      article_id: existing.article.id,
      duplicate_source_id: incoming.source_id,
      duplicate_url: incoming.canonical_url,
      reason,
      similarity,
      seen_at: nowIso,
    });

    return {
      action: 'recorded_duplicate',
      existingId: existing.article.id,
      reason,
      similarity,
    };
  }

  public processOne(
    incoming: NormalizedArticle,
    incomingWeight: number,
    now: Date = new Date()
  ): DedupDecision {
    const nowIso = now.toISOString();

    // Nivo 1a: Tačna provera po kanonskom URL-u
    const byUrl = this.db.findArticleByCanonicalUrl(incoming.canonical_url);
    if (byUrl) {
      // Ako je postojeći članak bio bez slike ili uvoda, a sada ga imamo — tiho dopuni
      this.db.fillMissingArticleMetadata(byUrl.id, incoming.image_url, incoming.snippet);
      return { action: 'skip_exact_url', existingId: byUrl.id };
    }

    // Nivo 1b: Tačna provera po hash-u normalizovanog naslova
    const byHash = this.db.findArticlesByTitleHash(incoming.title_hash);
    if (byHash.length > 0) {
      // Ako postoji isti izvor, prvo njega preskoči; inače uporedi sa najtežim/najstarijim
      const sameSrc = byHash.find((x) => x.article.source_id === incoming.source_id);
      const target = sameSrc ?? byHash[0];
      return this.resolveCrossSourceDuplicate(
        incoming,
        incomingWeight,
        target,
        'title_hash',
        1.0,
        nowIso
      );
    }

    // Nivo 2: Semantička / TF-IDF provera za skoro identične (agencijske) vesti
    const tokens = extractContentTokens(incoming.title_norm);
    const hasEnoughSignal = tokens.length >= 4 || incoming.title_norm.length + incoming.snippet.length >= 40;

    if (hasEnoughSignal) {
      const recent = this.db.getRecentArticlesWithWeight(this.windowHours, now);
      if (recent.length > 0) {
        const queryDoc = toTextDoc(incoming.id, incoming.title_norm, incoming.snippet);
        const corpusDocs = recent.map((r) =>
          toTextDoc(r.article.id, r.article.title_norm, r.article.snippet)
        );

        const match = this.similarityProvider.findMostSimilar(
          queryDoc,
          corpusDocs,
          this.semanticThreshold
        );

        if (match) {
          const matchedEntry = recent.find((r) => r.article.id === match.id);
          if (matchedEntry) {
            return this.resolveCrossSourceDuplicate(
              incoming,
              incomingWeight,
              matchedEntry,
              'semantic',
              Number(match.score.toFixed(4)),
              nowIso
            );
          }
        }
      }
    }

    // Jedinstvena vest (ili drugačiji članak o istom događaju -> ide u F5 klasterovanje)
    this.db.insertArticle(incoming);
    return { action: 'inserted', articleId: incoming.id };
  }

  public processBatch(
    articles: NormalizedArticle[],
    sourceWeight: number,
    now: Date = new Date()
  ): DedupBatchStats {
    const stats: DedupBatchStats = {
      inserted: 0,
      skippedExactUrl: 0,
      skippedSameSource: 0,
      recordedDuplicates: 0,
      replacedExisting: 0,
    };

    for (const art of articles) {
      const decision = this.processOne(art, sourceWeight, now);
      switch (decision.action) {
        case 'inserted':
          stats.inserted += 1;
          break;
        case 'skip_exact_url':
          stats.skippedExactUrl += 1;
          break;
        case 'skip_same_source_duplicate':
          stats.skippedSameSource += 1;
          break;
        case 'recorded_duplicate':
          stats.recordedDuplicates += 1;
          break;
        case 'replaced_existing':
          stats.replacedExisting += 1;
          break;
      }
    }

    return stats;
  }
}
