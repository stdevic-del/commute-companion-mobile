import { XMLParser } from 'fast-xml-parser';
import { parse as parseHtml } from 'node-html-parser';
import { parseHtmlArticle, resolveSafeHttpUrl } from './htmlParser.ts';
import type { DetectedFeedFormat, ParsedFeedItem, ParsedFeedResult } from './types.ts';

const ARRAY_TAG_NAMES = new Set([
  'item',
  'entry',
  'link',
  'category',
  'enclosure',
  'media:content',
  'media:thumbnail',
  'media:group',
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true,
  isArray: (tagName) => ARRAY_TAG_NAMES.has(tagName),
});

/**
 * Detektuje format po samom sadržaju (XML/HTML tagovima), NE po Content-Type zaglavlju
 * (npr. RTS vraća RSS 2.0 sa Content-Type: text/html).
 */
export function detectFeedFormat(rawBody: string): DetectedFeedFormat {
  const head = rawBody
    .replace(/^\uFEFF/, '')
    .slice(0, 4096)
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  if (!head) return 'unknown';

  // Preskoči eventualnu XML deklaraciju / PI na početku
  const withoutXmlDecl = head.replace(/^<\?[\s\S]*?\?>\s*/g, '').trim();

  if (/^<rss\b/i.test(withoutXmlDecl) || /<rss\b[^>]*>/i.test(withoutXmlDecl.slice(0, 512))) {
    return 'rss';
  }
  if (
    /^<feed\b/i.test(withoutXmlDecl) ||
    /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(withoutXmlDecl.slice(0, 1024))
  ) {
    return 'atom';
  }
  if (/^<rdf:RDF\b/i.test(withoutXmlDecl) || /<rdf:RDF\b/i.test(withoutXmlDecl.slice(0, 512))) {
    return 'rdf';
  }
  if (/^<!doctype\s+html/i.test(withoutXmlDecl) || /<html\b/i.test(withoutXmlDecl.slice(0, 1024))) {
    return 'html';
  }
  // Neki neispravni RSS fajlovi počinju direktno sa <channel>
  if (/<channel\b/i.test(withoutXmlDecl.slice(0, 512)) && /<item\b/i.test(rawBody.slice(0, 8192))) {
    return 'rss';
  }

  return 'unknown';
}

function getText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    for (const v of value) {
      const t = getText(v);
      if (t) return t;
    }
    return '';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj['#text'] !== undefined) return getText(obj['#text']);
    if (obj['__cdata'] !== undefined) return getText(obj['__cdata']);
  }
  return '';
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function looksLikeImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i.test(url);
}

function isTrackingPixelUrl(url: string, widthAttr?: string, heightAttr?: string): boolean {
  if (widthAttr === '1' || heightAttr === '1') return true;
  return /feedburner|pixel|1x1|spacer\.gif|doubleclick|analytics/i.test(url);
}

function extractFirstImgFromHtml(htmlFragment: string, baseUrl: string): string | null {
  if (!htmlFragment || !htmlFragment.includes('<img')) return null;
  const root = parseHtml(htmlFragment, { lowerCaseTagName: true, comment: false });
  const imgs = root.querySelectorAll('img');
  for (const img of imgs) {
    const rawSrc =
      img.getAttribute('src') ?? img.getAttribute('data-src') ?? img.getAttribute('data-lazy-src');
    const resolved = resolveSafeHttpUrl(rawSrc, baseUrl);
    if (!resolved) continue;
    if (isTrackingPixelUrl(resolved, img.getAttribute('width'), img.getAttribute('height'))) {
      continue;
    }
    return resolved;
  }
  return null;
}

function extractMediaImage(node: Record<string, unknown>, baseUrl: string): string | null {
  // 1. media:content (biraj sliku sa najvećom širinom ako ih ima više)
  const mediaContents: Array<Record<string, unknown>> = [];
  for (const mc of asArray(node['media:content'])) {
    if (mc && typeof mc === 'object') mediaContents.push(mc as Record<string, unknown>);
  }
  for (const mg of asArray(node['media:group'])) {
    if (mg && typeof mg === 'object') {
      for (const mc of asArray((mg as Record<string, unknown>)['media:content'])) {
        if (mc && typeof mc === 'object') mediaContents.push(mc as Record<string, unknown>);
      }
    }
  }

  let bestMediaUrl: string | null = null;
  let bestWidth = -1;
  for (const mc of mediaContents) {
    const rawUrl = typeof mc['@_url'] === 'string' ? mc['@_url'] : null;
    const resolved = resolveSafeHttpUrl(rawUrl, baseUrl);
    if (!resolved) continue;

    const medium = typeof mc['@_medium'] === 'string' ? mc['@_medium'].toLowerCase() : '';
    const type = typeof mc['@_type'] === 'string' ? mc['@_type'].toLowerCase() : '';
    const isImage =
      medium === 'image' || type.startsWith('image/') || (!medium && !type && looksLikeImageUrl(resolved));
    if (!isImage) continue;

    const width = Number(mc['@_width']) || 0;
    if (width > bestWidth) {
      bestWidth = width;
      bestMediaUrl = resolved;
    }
  }
  if (bestMediaUrl) return bestMediaUrl;

  // 2. media:thumbnail (direktno ili u media:group)
  const thumbnails: Array<Record<string, unknown>> = [];
  for (const mt of asArray(node['media:thumbnail'])) {
    if (mt && typeof mt === 'object') thumbnails.push(mt as Record<string, unknown>);
  }
  for (const mg of asArray(node['media:group'])) {
    if (mg && typeof mg === 'object') {
      for (const mt of asArray((mg as Record<string, unknown>)['media:thumbnail'])) {
        if (mt && typeof mt === 'object') thumbnails.push(mt as Record<string, unknown>);
      }
    }
  }
  for (const mt of thumbnails) {
    const rawUrl = typeof mt['@_url'] === 'string' ? mt['@_url'] : null;
    const resolved = resolveSafeHttpUrl(rawUrl, baseUrl);
    if (resolved) return resolved;
  }

  // 3. RSS enclosure
  for (const enc of asArray(node.enclosure)) {
    if (!enc || typeof enc !== 'object') continue;
    const obj = enc as Record<string, unknown>;
    const rawUrl = typeof obj['@_url'] === 'string' ? obj['@_url'] : null;
    const type = typeof obj['@_type'] === 'string' ? obj['@_type'].toLowerCase() : '';
    const resolved = resolveSafeHttpUrl(rawUrl, baseUrl);
    if (!resolved) continue;
    if (type.startsWith('image/') || (!type && looksLikeImageUrl(resolved))) {
      return resolved;
    }
  }

  // 4. Nestandardni <image> tag unutar <item>
  const directImg = resolveSafeHttpUrl(getText(node.image), baseUrl);
  if (directImg && looksLikeImageUrl(directImg)) return directImg;

  return null;
}

function extractCategories(rawCats: unknown): string[] {
  const result: string[] = [];
  for (const cat of asArray(rawCats)) {
    if (typeof cat === 'string') {
      const t = cat.trim();
      if (t) result.push(t);
    } else if (cat && typeof cat === 'object') {
      const obj = cat as Record<string, unknown>;
      const val =
        getText(obj) ||
        (typeof obj['@_label'] === 'string' ? obj['@_label'].trim() : '') ||
        (typeof obj['@_term'] === 'string' ? obj['@_term'].trim() : '');
      if (val) result.push(val);
    }
  }
  return Array.from(new Set(result));
}

function extractRssLink(item: Record<string, unknown>, baseUrl: string): string | null {
  for (const candidate of asArray(item.link)) {
    if (typeof candidate === 'string') {
      const resolved = resolveSafeHttpUrl(candidate, baseUrl);
      if (resolved) return resolved;
    } else if (candidate && typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>;
      const href = typeof obj['@_href'] === 'string' ? obj['@_href'] : getText(obj);
      const resolved = resolveSafeHttpUrl(href, baseUrl);
      if (resolved) return resolved;
    }
  }

  // Fallback na guid ako je URL
  const guidText = getText(item.guid);
  if (guidText) {
    const resolved = resolveSafeHttpUrl(guidText, baseUrl);
    if (resolved) return resolved;
  }
  return null;
}

function extractAtomLink(entry: Record<string, unknown>, baseUrl: string): {
  articleUrl: string | null;
  enclosureImageUrl: string | null;
} {
  let alternateUrl: string | null = null;
  let fallbackUrl: string | null = null;
  let enclosureImageUrl: string | null = null;

  for (const link of asArray(entry.link)) {
    if (typeof link === 'string') {
      fallbackUrl ??= resolveSafeHttpUrl(link, baseUrl);
      continue;
    }
    if (!link || typeof link !== 'object') continue;
    const obj = link as Record<string, unknown>;
    const href = typeof obj['@_href'] === 'string' ? obj['@_href'] : getText(obj);
    const rel = typeof obj['@_rel'] === 'string' ? obj['@_rel'].toLowerCase() : 'alternate';
    const type = typeof obj['@_type'] === 'string' ? obj['@_type'].toLowerCase() : '';
    const resolved = resolveSafeHttpUrl(href, baseUrl);
    if (!resolved) continue;

    if (rel === 'enclosure' && (type.startsWith('image/') || looksLikeImageUrl(resolved))) {
      enclosureImageUrl ??= resolved;
    } else if (rel === 'alternate' && (!type || type.includes('html'))) {
      alternateUrl ??= resolved;
    } else if (rel !== 'self' && rel !== 'enclosure' && rel !== 'replies') {
      fallbackUrl ??= resolved;
    }
  }

  return {
    articleUrl: alternateUrl ?? fallbackUrl,
    enclosureImageUrl,
  };
}

function parseRssItems(
  rawItems: unknown[],
  baseUrl: string,
  maxItems: number
): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];

  for (const raw of rawItems) {
    if (items.length >= maxItems) break;
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    const title = getText(item.title);
    const url = extractRssLink(item, baseUrl);
    if (!title || !url) continue;

    const descriptionRaw =
      getText(item.description) ||
      getText(item['content:encoded']) ||
      getText(item.summary);

    const contentHtml = getText(item['content:encoded']) || getText(item.description);
    const imageUrl =
      extractMediaImage(item, baseUrl) ?? extractFirstImgFromHtml(contentHtml, baseUrl);

    const publishedAtRaw =
      getText(item.pubDate) ||
      getText(item['dc:date']) ||
      getText(item.published) ||
      getText(item.updated) ||
      null;

    const sourceNameHint = getText(item.source) || null;

    items.push({
      title,
      url,
      publishedAtRaw,
      descriptionRaw,
      imageUrl,
      categories: extractCategories(item.category),
      sourceNameHint,
      paywallHint: null,
      canonicalUrlHint: null,
    });
  }

  return items;
}

function parseAtomEntries(
  rawEntries: unknown[],
  baseUrl: string,
  maxItems: number
): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];

  for (const raw of rawEntries) {
    if (items.length >= maxItems) break;
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;

    const title = getText(entry.title);
    const { articleUrl, enclosureImageUrl } = extractAtomLink(entry, baseUrl);
    if (!title || !articleUrl) continue;

    const summary = getText(entry.summary);
    const content = getText(entry.content);
    const descriptionRaw = summary || content;

    const imageUrl =
      extractMediaImage(entry, baseUrl) ??
      enclosureImageUrl ??
      extractFirstImgFromHtml(content, baseUrl) ??
      extractFirstImgFromHtml(summary, baseUrl);

    const publishedAtRaw = getText(entry.published) || getText(entry.updated) || null;

    items.push({
      title,
      url: articleUrl,
      publishedAtRaw,
      descriptionRaw,
      imageUrl,
      categories: extractCategories(entry.category),
      sourceNameHint: getText(entry.source) || null,
      paywallHint: null,
      canonicalUrlHint: null,
    });
  }

  return items;
}

/**
 * Parsira RSS 2.0, Atom 1.0, RDF ili fallback HTML članak.
 * Format se uvek određuje na osnovu samog sadržaja, nezavisno od Content-Type zaglavlja.
 */
export function parseFeed(
  body: string,
  baseUrl: string,
  maxItems: number = 50
): ParsedFeedResult {
  const format = detectFeedFormat(body);

  if (format === 'html') {
    const meta = parseHtmlArticle(body, baseUrl);
    if (meta.title) {
      return {
        format: 'html',
        feedTitle: meta.title,
        items: [
          {
            title: meta.title,
            url: meta.canonicalUrl ?? baseUrl,
            publishedAtRaw: meta.publishedAtRaw,
            descriptionRaw: meta.description ?? '',
            imageUrl: meta.imageUrl,
            categories: [],
            sourceNameHint: null,
            paywallHint: meta.paywallHint,
            canonicalUrlHint: meta.canonicalUrl,
          },
        ],
      };
    }
    return { format: 'html', feedTitle: null, items: [] };
  }

  if (format === 'unknown') {
    return { format: 'unknown', feedTitle: null, items: [] };
  }

  const parsed = xmlParser.parse(body) as Record<string, unknown>;

  if (format === 'rss') {
    const rss = parsed.rss as Record<string, unknown> | undefined;
    const channel = (rss?.channel ?? parsed.channel) as Record<string, unknown> | undefined;
    if (!channel) return { format: 'rss', feedTitle: null, items: [] };
    const feedTitle = getText(channel.title) || null;
    const items = parseRssItems(asArray(channel.item), baseUrl, maxItems);
    return { format: 'rss', feedTitle, items };
  }

  if (format === 'atom') {
    const feed = parsed.feed as Record<string, unknown> | undefined;
    if (!feed) return { format: 'atom', feedTitle: null, items: [] };
    const feedTitle = getText(feed.title) || null;
    const items = parseAtomEntries(asArray(feed.entry), baseUrl, maxItems);
    return { format: 'atom', feedTitle, items };
  }

  if (format === 'rdf') {
    const rdf = parsed['rdf:RDF'] as Record<string, unknown> | undefined;
    if (!rdf) return { format: 'rdf', feedTitle: null, items: [] };
    const channel = rdf.channel as Record<string, unknown> | undefined;
    const feedTitle = channel ? getText(channel.title) || null : null;
    const items = parseRssItems(asArray(rdf.item), baseUrl, maxItems);
    return { format: 'rdf', feedTitle, items };
  }

  return { format: 'unknown', feedTitle: null, items: [] };
}
