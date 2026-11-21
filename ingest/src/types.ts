export {
  CANONICAL_CATEGORIES,
  isCanonicalCategory,
  type CategoryName,
} from '../../shared/categories.ts';
import type { CategoryName } from '../../shared/categories.ts';

export type FeedKind = 'rss' | 'atom' | 'html';
export type SourceRole = 'publisher' | 'signal';
export type PaywallType = 'none' | 'soft' | 'hard';

export interface SourceConfig {
  id: string;
  name: string;
  domain: string;
  feedUrl: string;
  kind: FeedKind;
  role: SourceRole;
  categoryHint: CategoryName;
  weight: number;
  baseIntervalMin: number;
  maxIntervalMin: number;
  paywall: PaywallType;
  maxItems: number;
  enabled: boolean;
  notes?: string;
}

export interface SourcesFile {
  version: number;
  description?: string;
  sources: SourceConfig[];
}

export interface FetchStateRow {
  source_id: string;
  etag: string | null;
  last_modified: string | null;
  last_status: number | null;
  last_fetched_at: string | null;
  next_check_at: string | null;
  current_interval_min: number;
  consecutive_304: number;
  consecutive_errors: number;
  last_error: string | null;
}

export interface SourceWithState {
  source: SourceConfig;
  state: FetchStateRow;
}

export interface ArticleRow {
  id: string;
  source_id: string;
  canonical_url: string;
  url: string;
  title: string;
  title_norm: string;
  title_hash: string;
  snippet: string;
  image_url: string | null;
  published_at: string;
  first_seen_at: string;
  category: CategoryName;
  paywall: PaywallType;
  cluster_id: string | null;
}

export interface ClusterRow {
  id: string;
  lead_article_id: string | null;
  category: CategoryName;
  media_count: number;
  signal_score: number;
  first_seen_at: string;
  updated_at: string;
  score: number;
  ai_briefing_text: string | null;
  ai_briefing_sources: string | null;
  ai_briefing_media_count: number | null;
  ai_briefing_at: string | null;
}

export interface SignalRow {
  id: string;
  source_id: string;
  title: string;
  title_norm: string;
  rank: number;
  seen_at: string;
}

export interface RobotsCacheRow {
  domain: string;
  body: string;
  status: number;
  fetched_at: string;
}

export type DuplicateReason = 'title_hash' | 'semantic';

export interface ArticleDuplicateRow {
  article_id: string;
  duplicate_source_id: string;
  duplicate_url: string;
  reason: DuplicateReason;
  similarity: number;
  seen_at: string;
}

export interface ArticleWithWeight {
  article: ArticleRow;
  sourceWeight: number;
}

export const USER_AGENT = 'Mozilla/5.0 (compatible; NewsAggregatorTest/1.0)';
export const DEFAULT_RETENTION_HOURS = 72;
