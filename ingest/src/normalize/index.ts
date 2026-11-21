import { classifyNewsCategory } from '../../../shared/categories.ts';
import type { ParsedFeedItem } from '../parsers/types.ts';
import type { ArticleRow, SignalRow, SourceConfig } from '../types.ts';
import { normalizePublishedAt } from './date.ts';
import {
  buildSnippet,
  cleanTitle,
  normalizeForComparison,
  sha1Hex,
} from './text.ts';
import { canonicalizeUrl } from './url.ts';

export type NormalizedArticle = Omit<ArticleRow, 'cluster_id'>;

/**
 * Pretvara sirovu parsiranu stavku izdavača u normalizovani zapis spreman za dedup i bazu.
 */
export function normalizeFeedItem(
  item: ParsedFeedItem,
  source: SourceConfig,
  now: Date = new Date()
): NormalizedArticle | null {
  const title = cleanTitle(item.title, item.sourceNameHint ?? source.name);
  const titleNorm = normalizeForComparison(title);
  if (!title || titleNorm.length < 4) return null;

  const canonicalUrl = canonicalizeUrl(item.url, item.canonicalUrlHint);
  const id = sha1Hex(canonicalUrl);
  const titleHash = sha1Hex(titleNorm);
  const snippet = buildSnippet(item.descriptionRaw, title, 280);
  const publishedAt = normalizePublishedAt(item.publishedAtRaw, now);
  const firstSeenAt = now.toISOString();
  const category = classifyNewsCategory(title, snippet, undefined, source.categoryHint);

  return {
    id,
    source_id: source.id,
    canonical_url: canonicalUrl,
    url: item.url.trim(),
    title,
    title_norm: titleNorm,
    title_hash: titleHash,
    snippet,
    image_url: item.imageUrl,
    published_at: publishedAt,
    first_seen_at: firstSeenAt,
    category,
    paywall: item.paywallHint ?? source.paywall,
  };
}

/**
 * Pretvara stavku signalnog izvora (Google News) u normalizovani signal za rangiranje.
 */
export function normalizeSignalItem(
  item: ParsedFeedItem,
  source: SourceConfig,
  rank: number,
  now: Date = new Date()
): SignalRow | null {
  const title = cleanTitle(item.title, item.sourceNameHint ?? source.name);
  const titleNorm = normalizeForComparison(title);
  if (!title || titleNorm.length < 4) return null;

  const id = sha1Hex(`${source.id}:${titleNorm}`);
  return {
    id,
    source_id: source.id,
    title,
    title_norm: titleNorm,
    rank,
    seen_at: now.toISOString(),
  };
}

export { buildSnippet, cleanTitle, cyrillicToLatin, normalizeForComparison, sha1Hex } from './text.ts';
export { canonicalizeUrl } from './url.ts';
export { normalizePublishedAt } from './date.ts';
