import type { PaywallType } from '../types.ts';

export type DetectedFeedFormat = 'rss' | 'atom' | 'rdf' | 'html' | 'unknown';

export interface ParsedFeedItem {
  title: string;
  url: string;
  publishedAtRaw: string | null;
  descriptionRaw: string;
  imageUrl: string | null;
  categories: string[];
  sourceNameHint: string | null;
  paywallHint: PaywallType | null;
  canonicalUrlHint: string | null;
}

export interface ParsedFeedResult {
  format: DetectedFeedFormat;
  feedTitle: string | null;
  items: ParsedFeedItem[];
}

export interface HtmlArticleMetadata {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  publishedAtRaw: string | null;
  canonicalUrl: string | null;
  paywallHint: PaywallType | null;
}
