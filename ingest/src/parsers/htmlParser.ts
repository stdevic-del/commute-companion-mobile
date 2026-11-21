import { parse as parseHtml } from 'node-html-parser';
import type { PaywallType } from '../types.ts';
import type { HtmlArticleMetadata } from './types.ts';

const ARTICLE_SCHEMA_TYPES = new Set([
  'newsarticle',
  'article',
  'reportagenewsarticle',
  'analysisnewsarticle',
  'opinionnewsarticle',
  'backgroundnewsarticle',
  'liveblogposting',
  'blogposting',
]);

export function resolveSafeHttpUrl(raw: string | null | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || /^data:|^javascript:|^mailto:/i.test(trimmed)) return null;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

function isUsableImageUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // WordPress/Yoast JSON-LD koristi "@id": ".../#primaryimage" što nije URL slike
    if (parsed.hash && parsed.hash.length > 0) return false;
    return true;
  } catch {
    return false;
  }
}

function extractImageFromSchema(imageField: unknown, baseUrl: string): string | null {
  if (!imageField) return null;
  if (typeof imageField === 'string') {
    const resolved = resolveSafeHttpUrl(imageField, baseUrl);
    return isUsableImageUrl(resolved) ? resolved : null;
  }
  if (Array.isArray(imageField)) {
    for (const item of imageField) {
      const url = extractImageFromSchema(item, baseUrl);
      if (url) return url;
    }
    return null;
  }
  if (typeof imageField === 'object') {
    const obj = imageField as Record<string, unknown>;
    const candidates = [
      resolveSafeHttpUrl(asString(obj.url), baseUrl),
      resolveSafeHttpUrl(asString(obj.contentUrl), baseUrl),
      resolveSafeHttpUrl(asString(obj['@id']), baseUrl),
    ];
    for (const c of candidates) {
      if (isUsableImageUrl(c)) return c;
    }
  }
  return null;
}

function extractCanonicalFromSchema(node: Record<string, unknown>, baseUrl: string): string | null {
  const main = node.mainEntityOfPage;
  if (typeof main === 'string') {
    return resolveSafeHttpUrl(main, baseUrl);
  }
  if (main && typeof main === 'object') {
    const m = main as Record<string, unknown>;
    const candidate = asString(m['@id']) ?? asString(m.url);
    if (candidate) return resolveSafeHttpUrl(candidate, baseUrl);
  }
  return resolveSafeHttpUrl(asString(node.url), baseUrl);
}

function parseBoolFlag(val: unknown): boolean | null {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const low = val.trim().toLowerCase();
    if (low === 'false') return false;
    if (low === 'true') return true;
  }
  return null;
}

function detectPaywallFromSchema(node: Record<string, unknown>): PaywallType | null {
  const topFlag = parseBoolFlag(node.isAccessibleForFree);
  if (topFlag === false) return 'hard';

  const hasPart = node.hasPart;
  const parts = Array.isArray(hasPart) ? hasPart : hasPart ? [hasPart] : [];
  for (const part of parts) {
    if (part && typeof part === 'object') {
      const partFlag = parseBoolFlag((part as Record<string, unknown>).isAccessibleForFree);
      if (partFlag === false) return 'soft';
    }
  }

  if (topFlag === true) return 'none';
  return null;
}

function isArticleSchemaType(rawType: unknown): boolean {
  if (typeof rawType === 'string') {
    return ARTICLE_SCHEMA_TYPES.has(rawType.toLowerCase());
  }
  if (Array.isArray(rawType)) {
    return rawType.some((t) => typeof t === 'string' && ARTICLE_SCHEMA_TYPES.has(t.toLowerCase()));
  }
  return false;
}

function collectJsonLdNodes(value: unknown, out: Array<Record<string, unknown>>): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdNodes(item, out);
    }
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    out.push(obj);
    if (obj['@graph']) {
      collectJsonLdNodes(obj['@graph'], out);
    }
  }
}

/**
 * Fallback parser za HTML stranice članaka:
 * 1. Schema.org JSON-LD (`NewsArticle` / `Article`)
 * 2. Open Graph (`og:*`, `article:*`) i standardni meta/canonical tagovi
 * Nikada ne izvlači i ne čuva ceo tekst članka.
 */
export function parseHtmlArticle(html: string, baseUrl: string): HtmlArticleMetadata {
  const root = parseHtml(html, {
    lowerCaseTagName: true,
    comment: false,
  });

  let title: string | null = null;
  let description: string | null = null;
  let imageUrl: string | null = null;
  let publishedAtRaw: string | null = null;
  let canonicalUrl: string | null = null;
  let paywallHint: PaywallType | null = null;

  // 1. Schema.org JSON-LD
  const jsonLdScripts = root.querySelectorAll('script[type="application/ld+json"]');
  const candidateNodes: Array<Record<string, unknown>> = [];

  for (const script of jsonLdScripts) {
    const rawJson = script.text?.trim();
    if (!rawJson) continue;
    try {
      const parsed: unknown = JSON.parse(rawJson);
      collectJsonLdNodes(parsed, candidateNodes);
    } catch {
      // Neki portali imaju neispravan JSON-LD — mirno preskoči i osloni se na OG
    }
  }

  // Prioritet dajemo NewsArticle ispred običnog Article
  candidateNodes.sort((a, b) => {
    const aNews = String(a['@type'] ?? '').toLowerCase().includes('newsarticle') ? 1 : 0;
    const bNews = String(b['@type'] ?? '').toLowerCase().includes('newsarticle') ? 1 : 0;
    return bNews - aNews;
  });

  for (const node of candidateNodes) {
    if (!isArticleSchemaType(node['@type'])) continue;
    title ??= asString(node.headline) ?? asString(node.name);
    description ??= asString(node.description);
    imageUrl ??= extractImageFromSchema(node.image, baseUrl);
    publishedAtRaw ??=
      asString(node.datePublished) ?? asString(node.dateCreated) ?? asString(node.dateModified);
    canonicalUrl ??= extractCanonicalFromSchema(node, baseUrl);
    paywallHint ??= detectPaywallFromSchema(node);
  }

  // 2. Open Graph / meta / canonical tagovi za polja koja nedostaju
  const getMeta = (selectors: string[]): string | null => {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      const content = el?.getAttribute('content')?.trim();
      if (content) return content;
    }
    return null;
  };

  title ??=
    getMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ??
    asString(root.querySelector('title')?.text);

  description ??= getMeta([
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);

  if (!imageUrl) {
    const ogImg = getMeta([
      'meta[property="og:image:secure_url"]',
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]);
    imageUrl = resolveSafeHttpUrl(ogImg, baseUrl);
  }

  publishedAtRaw ??=
    getMeta([
      'meta[property="article:published_time"]',
      'meta[property="og:published_time"]',
      'meta[name="pubdate"]',
      'meta[name="publish-date"]',
      'meta[name="DC.date.issued"]',
    ]) ?? asString(root.querySelector('time[datetime]')?.getAttribute('datetime'));

  // <link rel="canonical"> ima prioritet nad og:url ako JSON-LD nije dao kanonski URL
  const linkCanonical = resolveSafeHttpUrl(
    root.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    baseUrl
  );
  if (linkCanonical) {
    canonicalUrl = linkCanonical;
  } else if (!canonicalUrl) {
    canonicalUrl = resolveSafeHttpUrl(getMeta(['meta[property="og:url"]']), baseUrl);
  }

  return {
    title,
    description,
    imageUrl,
    publishedAtRaw,
    canonicalUrl,
    paywallHint,
  };
}
