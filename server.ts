import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { buildThreePointServiceRadar } from './services/serviceRadarEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local or .env automatically when running locally in Antigravity / Node.js
for (const envFile of ['.env.local', '.env']) {
  const fullPath = path.join(__dirname, envFile);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const PORT = Number(process.env.PORT) || 3000;

interface FeedSourceConfig {
  id: string;
  name: string;
  group: 'domaci_info' | 'it_tech' | 'saobracaj_servisi';
  category: string;
  url: string;
  maxItems?: number;
}

const CURATED_FEEDS: FeedSourceConfig[] = [
  // Domaći informativni, ekonomski i agregatorski klaster izvori (time.rs model)
  {
    id: 'rts',
    name: 'RTS Vesti',
    group: 'domaci_info',
    category: 'Društvo i Ekonomija',
    url: 'https://www.rts.rs/page/stories/sr/rss.html',
    maxItems: 10,
  },
  {
    id: 'danas',
    name: 'Danas',
    group: 'domaci_info',
    category: 'Politika i Društvo',
    url: 'https://www.danas.rs/feed/',
    maxItems: 10,
  },
  {
    id: 'nova',
    name: 'Nova.rs',
    group: 'domaci_info',
    category: 'Aktuelno',
    url: 'https://nova.rs/feed/',
    maxItems: 10,
  },
  {
    id: 'bizlife',
    name: 'BizLife',
    group: 'domaci_info',
    category: 'Ekonomija i Biznis',
    url: 'https://bizlife.rs/feed/',
    maxItems: 8,
  },
  {
    id: 'srb-klaster-top',
    name: 'Presek Medija',
    group: 'domaci_info',
    category: 'Udarne Vesti',
    url: 'https://news.google.com/rss?hl=sr&gl=RS&ceid=RS:sr',
    maxItems: 14,
  },
  {
    id: 'srb-klaster-biz',
    name: 'Biznis Presek',
    group: 'domaci_info',
    category: 'Ekonomija i Tržište',
    url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=sr&gl=RS&ceid=RS:sr',
    maxItems: 8,
  },
  // Domaći i strani IT/Tech portali
  {
    id: 'startit',
    name: 'Startit',
    group: 'it_tech',
    category: 'IT i Digitalna Ekonomija',
    url: 'https://startit.rs/feed/',
    maxItems: 6,
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    group: 'it_tech',
    category: 'Global Tech & AI',
    url: 'https://techcrunch.com/feed/',
    maxItems: 8,
  },
  {
    id: 'theverge',
    name: 'The Verge',
    group: 'it_tech',
    category: 'Tehnologija i Nauka',
    url: 'https://www.theverge.com/rss/index.xml',
    maxItems: 6,
  },
  {
    id: 'srb-klaster-tech',
    name: 'Tech Klaster',
    group: 'it_tech',
    category: 'Tehnologija i Inovacije',
    url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=sr&gl=RS&ceid=RS:sr',
    maxItems: 8,
  },
  // Saobraćajni i gradski servisni izvori
  {
    id: 'rts-beograd',
    name: 'Beograd Servis / RTS',
    group: 'saobracaj_servisi',
    category: 'Saobraćaj i Grad',
    url: 'https://www.rts.rs/page/stories/sr/Beograd/rss.html',
    maxItems: 6,
  },
  {
    id: 'srb-klaster-saobracaj',
    name: 'Saobraćajni Presek',
    group: 'saobracaj_servisi',
    category: 'Putevi i Koridori',
    url: 'https://news.google.com/rss/search?q=saobra%C4%87aj+Beograd+OR+AMSS+OR+gu%C5%BEva+OR+radovi+na+putu&hl=sr&gl=RS&ceid=RS:sr',
    maxItems: 6,
  },
];

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Đ', Е: 'E', Ж: 'Ž', З: 'Z', И: 'I',
  Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', Ћ: 'Ć', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'Č', Џ: 'Dž', Ш: 'Š',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

function cyrillicToLatin(text: string): string {
  return text.replace(/[А-Яа-яЂђЈјЉљЊњЋћЏџ]/g, (ch) => CYRILLIC_TO_LATIN_MAP[ch] || ch);
}

function unescapeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

function decodeHtmlEntities(input: string): string {
  return cyrillicToLatin(
    unescapeXmlEntities(input)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

interface RawParsedItem {
  id: string;
  title: string;
  sourceName: string;
  sourceGroup: 'domaci_info' | 'it_tech' | 'saobracaj_servisi' | 'custom_urls';
  category: string;
  summary: string;
  url: string;
  publishedAt: string;
  publishedTimestampMs: number;
  selected: boolean;
  relatedSources: string[];
  hasRichDescription: boolean;
  fullText?: string;
}

function parseRssXmlItems(
  xml: string,
  defaultSourceName: string,
  sourceGroup: 'domaci_info' | 'it_tech' | 'saobracaj_servisi' | 'custom_urls',
  defaultCategory: string,
  maxItems = 8
): RawParsedItem[] {
  const items: RawParsedItem[] = [];
  const itemRegex = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[2];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch =
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
      block.match(/<link[^>]*href=["']([^"']+)["']/i);
    const sourceTagMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const descMatch =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
      block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i);
    const dateMatch =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) ||
      block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);

    let rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
    const rawUrl = linkMatch ? decodeHtmlEntities(linkMatch[1]) : '';
    const explicitSource = sourceTagMatch ? decodeHtmlEntities(sourceTagMatch[1]) : '';

    const normalizePortalName = (rawName: string): string => {
      const n = rawName.trim();
      if (/^rts(\s+vesti)?$/i.test(n)) return 'RTS';
      if (/^n1(\s+info)?(\.rs)?$/i.test(n)) return 'N1';
      if (/^tanjug(\.rs)?$/i.test(n)) return 'Tanjug';
      if (/^radio-televizija\s+vojvodine$/i.test(n)) return 'RTV';
      if (/^nova(\.rs)?$/i.test(n)) return 'Nova.rs';
      if (/^danas(\.rs)?$/i.test(n)) return 'Danas';
      if (/^blic(\.rs)?$/i.test(n)) return 'Blic';
      if (/^b92(\.net)?$/i.test(n)) return 'B92';
      return n;
    };

    let itemSourceName = normalizePortalName(explicitSource || defaultSourceName);

    // Strip trailing " - SourceName" from cluster feed headlines
    if (explicitSource && rawTitle.endsWith(` - ${explicitSource}`)) {
      rawTitle = rawTitle.slice(0, -(` - ${explicitSource}`).length).trim();
    } else if (rawTitle.includes(' - ')) {
      const dashIdx = rawTitle.lastIndexOf(' - ');
      const tail = rawTitle.slice(dashIdx + 3).trim();
      if (tail.length >= 2 && tail.length <= 24 && !/\d{2}/.test(tail)) {
        if (defaultSourceName.includes('Presek') || defaultSourceName.includes('Klaster')) {
          itemSourceName = normalizePortalName(tail);
        }
        rawTitle = rawTitle.slice(0, dashIdx).trim();
      }
    }

    // Extract multi-portal cluster sub-items if present in <description> (e.g. <ol><li>...<font>Portal</font></li></ol>)
    const rawDescInner = descMatch ? unescapeXmlEntities(descMatch[1]) : '';
    const clusterSources: string[] = [itemSourceName];
    const clusterSubHeadlines: string[] = [];

    if (/<li[\s>]/i.test(rawDescInner)) {
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = liRegex.exec(rawDescInner)) !== null) {
        const liHtml = liMatch[1];
        const fontMatch = liHtml.match(/<font[^>]*>([\s\S]*?)<\/font>/i);
        const aMatch = liHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
        const subPortal = fontMatch ? normalizePortalName(decodeHtmlEntities(fontMatch[1])) : '';
        const subHeadline = aMatch ? decodeHtmlEntities(aMatch[1]) : '';
        if (subPortal && !clusterSources.includes(subPortal)) {
          clusterSources.push(subPortal);
        }
        if (subHeadline && subHeadline !== rawTitle && clusterSubHeadlines.length < 2) {
          clusterSubHeadlines.push(
            subPortal ? `${subPortal}: „${subHeadline}"` : `„${subHeadline}"`
          );
        }
      }
    }

    let cleanSummary = '';
    let hasRichDescription = false;

    if (clusterSubHeadlines.length > 0) {
      cleanSummary = `Udarna tema u više redakcija (${clusterSources.join(', ')}). ${clusterSubHeadlines.join(' · ')}`.slice(
        0,
        300
      );
    } else if (descMatch) {
      const plainDesc = decodeHtmlEntities(descMatch[1]);
      // Avoid using description if it just repeats the title
      if (plainDesc && plainDesc.length > 25 && !plainDesc.startsWith(rawTitle.slice(0, 28))) {
        cleanSummary = plainDesc.slice(0, 280);
        hasRichDescription = plainDesc.length > 90;
      }
    }

    if (rawTitle && rawTitle.length > 8) {
      let formattedTime = 'Danas';
      let publishedTimestampMs = Date.now() - 30 * 60 * 1000;
      if (dateMatch) {
        const parsedDate = new Date(decodeHtmlEntities(dateMatch[1]));
        if (!Number.isNaN(parsedDate.getTime())) {
          publishedTimestampMs = parsedDate.getTime();
          formattedTime = parsedDate.toLocaleTimeString('sr-RS', {
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      }

      items.push({
        id: `art-${itemSourceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${items.length}-${Date.now()}`,
        title: rawTitle,
        sourceName: itemSourceName,
        sourceGroup,
        category: defaultCategory,
        summary: cleanSummary || `Aktuelni izveštaj redakcije ${itemSourceName}: ${rawTitle}.`,
        url: rawUrl || 'https://www.rts.rs',
        publishedAt: formattedTime,
        publishedTimestampMs,
        selected: true,
        relatedSources: clusterSources,
        hasRichDescription,
      });
    }
  }

  return items;
}

const SERBIAN_AND_EN_STOPWORDS = new Set([
  'u', 'na', 'i', 'da', 'se', 'je', 'za', 'od', 'sa', 'su', 'o', 'iz', 'ili', 'ali', 'pa',
  'te', 'ni', 'uz', 'po', 'ka', 'do', 'kod', 'nad', 'pod', 'pred', 'preko', 'kroz', 'između',
  'koji', 'koja', 'koje', 'kojima', 'ovaj', 'ova', 'ovo', 'tog', 'tome', 'taj', 'ta', 'to',
  'biti', 'bio', 'bila', 'bilo', 'bili', 'će', 'bi', 'smo', 'ste', 'nije', 'nisu', 'ne',
  'šta', 'kako', 'gde', 'kad', 'kada', 'dok', 'jer', 'ako', 'već', 'samo', 'još', 'sve',
  'više', 'manje', 'oko', 'nakon', 'posle', 'pre', 'zbog', 'tokom', 'protiv', 'bez',
  'danas', 'juče', 'sutra', 'novi', 'nova', 'novo', 'nove', 'prvi', 'prva', 'foto', 'video',
  'srbija', 'srbiji', 'srbije', 'beograd', 'beogradu', 'beograda', 'godine', 'godina',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'its', 'into', 'over', 'after', 'new',
]);

function normalizeTokenStem(word: string): string {
  const cleaned = word
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .replace(/č|ć/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/[^a-z0-9]/g, '');

  if (cleaned.length <= 3) return cleaned;
  // Light Serbian inflectional stemming so "akciza", "akcize", "akcizama" -> "akciz"
  if (cleaned.length >= 7) {
    return cleaned.replace(/(ama|ima|om|em|og|oj|im|ih|om|u|a|e|i|o)$/, '').slice(0, 7);
  }
  if (cleaned.length >= 5) {
    return cleaned.replace(/(a|e|i|o|u)$/, '');
  }
  return cleaned;
}

function extractArticleStems(title: string, summary: string): Set<string> {
  const combined = `${title} ${title} ${summary.slice(0, 140)}`;
  const words = combined
    .toLowerCase()
    .split(/[^a-zA-ZčćžšđČĆŽŠĐ0-9]+/)
    .filter((w) => w.length >= 4 && !SERBIAN_AND_EN_STOPWORDS.has(w));

  const stems = new Set<string>();
  for (const w of words) {
    const stem = normalizeTokenStem(w);
    if (stem.length >= 4 && !SERBIAN_AND_EN_STOPWORDS.has(stem)) {
      stems.add(stem);
    }
  }
  return stems;
}

// time.rs-inspired Algorithmic Event Clustering & Importance Ranking
function clusterAndRankArticles(rawItems: RawParsedItem[]) {
  interface ArticleCluster {
    primary: RawParsedItem;
    stems: Set<string>;
    sourcesSet: Set<string>;
    latestTimestampMs: number;
    bestRichSummary: string;
    hasRichDesc: boolean;
  }

  const clusters: ArticleCluster[] = [];

  for (const item of rawItems) {
    const itemStems = extractArticleStems(item.title, item.summary);
    let matchedCluster: ArticleCluster | null = null;
    let bestOverlapScore = 0;

    for (const cluster of clusters) {
      if (cluster.primary.sourceGroup !== item.sourceGroup) continue;

      let sharedCount = 0;
      for (const s of itemStems) {
        if (cluster.stems.has(s)) sharedCount++;
      }

      const unionSize = new Set([...itemStems, ...cluster.stems]).size || 1;
      const jaccard = sharedCount / unionSize;

      if (
        (sharedCount >= 3 && jaccard >= 0.16) ||
        (sharedCount >= 2 && jaccard >= 0.25)
      ) {
        if (jaccard > bestOverlapScore) {
          bestOverlapScore = jaccard;
          matchedCluster = cluster;
        }
      }
    }

    if (matchedCluster) {
      // Merge into existing event cluster
      for (const s of item.relatedSources) {
        matchedCluster.sourcesSet.add(s);
      }
      for (const stem of itemStems) {
        matchedCluster.stems.add(stem);
      }
      if (item.publishedTimestampMs > matchedCluster.latestTimestampMs) {
        matchedCluster.latestTimestampMs = item.publishedTimestampMs;
      }
      // Prefer direct feed's rich paragraph description if current cluster only has a short snippet
      if (item.hasRichDescription && !matchedCluster.hasRichDesc) {
        matchedCluster.bestRichSummary = item.summary;
        matchedCluster.hasRichDesc = true;
        matchedCluster.primary.url = item.url;
        matchedCluster.primary.title = item.title;
        matchedCluster.primary.sourceName = item.sourceName;
      }
    } else {
      clusters.push({
        primary: { ...item },
        stems: itemStems,
        sourcesSet: new Set(item.relatedSources),
        latestTimestampMs: item.publishedTimestampMs,
        bestRichSummary: item.summary,
        hasRichDesc: item.hasRichDescription,
      });
    }
  }

  const nowMs = Date.now();

  const ranked = clusters.map((cluster) => {
    const relatedSources = Array.from(cluster.sourcesSet);
    const mediaCount = Math.max(1, relatedSources.length);
    const ageHours = Math.max(0.1, (nowMs - cluster.latestTimestampMs) / (1000 * 60 * 60));

    // time.rs-inspired Importance Formula:
    // Cross-portal coverage power + freshness time-decay + rich editorial content bonus
    const coveragePoints = Math.min(68, Math.round(Math.pow(mediaCount, 1.32) * 14));
    const freshnessPoints = Math.max(4, Math.round(26 / Math.pow(ageHours + 0.8, 0.45)));
    const richTextBonus = cluster.hasRichDesc ? 5 : 0;
    const rawScore = Math.min(99, Math.max(18, coveragePoints + freshnessPoints + richTextBonus));

    const primarySource = relatedSources[0] || cluster.primary.sourceName;
    const displaySourceName =
      mediaCount > 1
        ? `${primarySource} + još ${mediaCount - 1} (${relatedSources.slice(1, 4).join(', ')})`
        : primarySource;

    let finalSummary = cluster.bestRichSummary;
    if (mediaCount >= 2 && !finalSummary.includes('redakcija') && !finalSummary.includes('Prenose:')) {
      finalSummary = `${finalSummary} [Prenose: ${relatedSources.slice(0, 5).join(', ')}]`.slice(0, 320);
    }

    return {
      id: cluster.primary.id,
      title: cluster.primary.title,
      sourceName: displaySourceName,
      sourceGroup: cluster.primary.sourceGroup,
      category: cluster.primary.category,
      summary: finalSummary,
      url: cluster.primary.url,
      publishedAt: cluster.primary.publishedAt,
      selected: true,
      fullText: cluster.primary.fullText,
      mediaCount,
      relatedSources,
      importanceScore: rawScore,
      isBreakingCluster: mediaCount >= 3 || rawScore >= 78,
    };
  });

  // Sort by importanceScore descending (just like time.rs frontpage)
  ranked.sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));

  return ranked;
}

async function fetchWithTimeout(url: string, timeoutMs = 5200): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, text/html, */*',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractArticleFromHtml(html: string, url: string) {
  const cleanedHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

  const titleMatch =
    cleanedHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    cleanedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    cleanedHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const descMatch =
    cleanedHtml.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
    ) ||
    cleanedHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(cleanedHtml)) !== null && paragraphs.length < 18) {
    const text = decodeHtmlEntities(pMatch[1]);
    if (text.length > 45) {
      paragraphs.push(text);
    }
  }

  let hostname = 'Web Izvor';
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // ignore
  }

  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : `Članak sa ${hostname}`;
  const fullText = paragraphs.join('\n\n');
  const summary = descMatch
    ? decodeHtmlEntities(descMatch[1]).slice(0, 260)
    : paragraphs[0]?.slice(0, 260) || `Direktno preuzet sadržaj sa adrese ${hostname}.`;

  return {
    title,
    sourceName: hostname,
    summary,
    fullText: fullText.slice(0, 4500),
  };
}

interface ServerNewsSnapshot {
  allClustered: any[];
  updatedAtMs: number;
  updatedAtLabel: string;
  isRefreshing: boolean;
}

const serverNewsSnapshot: ServerNewsSnapshot = {
  allClustered: [],
  updatedAtMs: 0,
  updatedAtLabel: '',
  isRefreshing: false,
};

async function refreshServerNewsSnapshot(): Promise<any[]> {
  if (serverNewsSnapshot.isRefreshing && serverNewsSnapshot.allClustered.length > 0) {
    return serverNewsSnapshot.allClustered;
  }
  serverNewsSnapshot.isRefreshing = true;
  try {
    const feedPromises = CURATED_FEEDS.map(async (feed) => {
      try {
        const xml = await fetchWithTimeout(feed.url, 5200);
        return parseRssXmlItems(xml, feed.name, feed.group, feed.category, feed.maxItems || 8);
      } catch {
        return [];
      }
    });
    const feedResults = await Promise.all(feedPromises);
    const rawCombined = feedResults.flat();
    const clustered = clusterAndRankArticles(rawCombined);
    if (clustered.length > 0) {
      serverNewsSnapshot.allClustered = clustered;
      serverNewsSnapshot.updatedAtMs = Date.now();
      serverNewsSnapshot.updatedAtLabel = new Date().toLocaleTimeString('sr-RS', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return serverNewsSnapshot.allClustered;
  } finally {
    serverNewsSnapshot.isRefreshing = false;
  }
}

async function scrapeNewsSources(
  sourceGroups: string[],
  customUrls: string[],
  forceRefresh = false
) {
  const activeGroups =
    Array.isArray(sourceGroups) && sourceGroups.length > 0
      ? sourceGroups
      : ['domaci_info', 'it_tech', 'saobracaj_servisi'];

  const hasCustomUrls = Array.isArray(customUrls) && customUrls.some((u) => u && u.trim());
  const cacheAgeMs = Date.now() - serverNewsSnapshot.updatedAtMs;

  // Stale-While-Revalidate: serve instant snapshot if available and not forced
  if (!forceRefresh && !hasCustomUrls && serverNewsSnapshot.allClustered.length > 0) {
    if (cacheAgeMs > 5 * 60 * 1000 && !serverNewsSnapshot.isRefreshing) {
      // Trigger non-blocking background refresh while returning instant snapshot
      refreshServerNewsSnapshot().catch(() => {});
    }
    const filtered = serverNewsSnapshot.allClustered.filter((item) =>
      activeGroups.includes(item.sourceGroup)
    );
    return filtered.slice(0, 20).map((item, index) => ({
      ...item,
      selected: index < 10,
    }));
  }

  // Live crawl (either forced by user click, initial warm-up, or custom URLs present)
  const matchingFeeds = CURATED_FEEDS.filter((f) => activeGroups.includes(f.group));

  const feedPromises = matchingFeeds.map(async (feed) => {
    try {
      const xml = await fetchWithTimeout(feed.url, 5200);
      return parseRssXmlItems(xml, feed.name, feed.group, feed.category, feed.maxItems || 8);
    } catch {
      return [];
    }
  });

  const customPromises = (customUrls || []).slice(0, 5).map(async (rawUrl) => {
    try {
      const trimmed = rawUrl.trim();
      if (!trimmed) return [];
      const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const body = await fetchWithTimeout(normalizedUrl, 5000);

      if (/<(rss|feed)\b/i.test(body)) {
        const host = new URL(normalizedUrl).hostname.replace(/^www\./, '');
        return parseRssXmlItems(body, host, 'custom_urls', 'Korisnički RSS', 5);
      }

      const extracted = extractArticleFromHtml(body, normalizedUrl);
      return [
        {
          id: `custom-art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: extracted.title,
          sourceName: extracted.sourceName,
          sourceGroup: 'custom_urls' as const,
          category: 'Moj URL Izvor',
          summary: extracted.summary,
          url: normalizedUrl,
          publishedAt: new Date().toLocaleTimeString('sr-RS', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          publishedTimestampMs: Date.now(),
          selected: true,
          relatedSources: [extracted.sourceName],
          hasRichDescription: true,
          fullText: extracted.fullText,
        },
      ];
    } catch {
      return [];
    }
  });

  const [feedResults, customResults] = await Promise.all([
    Promise.all(feedPromises),
    Promise.all(customPromises),
  ]);

  const rawCombined = [...customResults.flat(), ...feedResults.flat()];
  const clustered = clusterAndRankArticles(rawCombined);

  // Update snapshot if all 3 main groups were crawled
  if (
    activeGroups.includes('domaci_info') &&
    activeGroups.includes('it_tech') &&
    activeGroups.includes('saobracaj_servisi') &&
    clustered.length > 0
  ) {
    serverNewsSnapshot.allClustered = clustered;
    serverNewsSnapshot.updatedAtMs = Date.now();
    serverNewsSnapshot.updatedAtLabel = new Date().toLocaleTimeString('sr-RS', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Select top 10 highest-ranked clusters by default, keep up to 20 in curation desk
  const topList = clustered.slice(0, 20).map((item, index) => ({
    ...item,
    selected: index < 10,
  }));

  return topList;
}

async function synthesizeSingleSpeaker(
  ai: GoogleGenAI,
  text: string,
  languageVariant: string
): Promise<string> {
  const cleanText = text
    .replace(/^(Jelena|Milan):\s*/gim, '')
    .replace(/[*_#`~>]/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2600);

  if (!cleanText) return '';

  const voiceName = languageVariant === 'ijekavica' ? 'Puck' : 'Kore';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cleanText,
            speechMetadata: {
              style: 'Prirodan, jasan i prijatan radijski voditelj jutarnjeg programa u vožnji',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
}

async function synthesizeSpeech(
  ai: GoogleGenAI,
  text: string,
  languageVariant: string,
  hostFormat: 'solo' | 'duo' = 'solo'
): Promise<string> {
  if (hostFormat === 'duo') {
    try {
      const rawLines = text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const dialogueParts: Array<{
        text: string;
        speechMetadata: { speaker: string; style: string };
      }> = [];

      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].replace(/[*_#`~>]/g, '').trim();
        if (!line) continue;

        const isMilan = /^Milan:/i.test(line) || (!/^Jelena:/i.test(line) && i % 2 === 1);
        const speakerName = isMilan ? 'Milan' : 'Jelena';
        const cleanBody = line.replace(/^(Jelena|Milan):\s*/i, '').trim();
        if (!cleanBody) continue;

        dialogueParts.push({
          text: `${speakerName}: ${cleanBody}`,
          speechMetadata: {
            speaker: speakerName,
            style: isMilan
              ? 'Dinamičan, analitičan radijski ko-voditelj u jutarnjem programu'
              : 'Topla, energična i elokventna glavna voditeljka jutarnjeg programa',
          },
        });
      }

      if (dialogueParts.length >= 2) {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts: dialogueParts.slice(0, 14),
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: 'Jelena',
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                  },
                  {
                    speaker: 'Milan',
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Puck' },
                    },
                  },
                ],
              },
            },
          },
        });

        const duoAudio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
        if (duoAudio) return duoAudio;
      }
    } catch (duoErr) {
      console.warn('Duo TTS fallback to single speaker:', duoErr);
    }
  }

  return synthesizeSingleSpeaker(ai, text, languageVariant);
}

interface LiveWeatherResult {
  condition: string;
  tempC: number;
  windKmh: number;
  roadCondition: string;
}

async function fetchLiveWeather(lat = 44.8176, lng = 20.4633): Promise<LiveWeatherResult> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,wind_speed_10m,weather_code,precipitation&timezone=auto`;
    const raw = await fetchWithTimeout(url, 3800);
    const data = JSON.parse(raw);
    const current = data?.current || {};
    const tempC = typeof current.temperature_2m === 'number' ? Math.round(current.temperature_2m) : 16;
    const windKmh = typeof current.wind_speed_10m === 'number' ? Math.round(current.wind_speed_10m) : 11;
    const code = Number(current.weather_code ?? 1);
    const precip = Number(current.precipitation ?? 0);

    let condition = 'Vedro i prijatno';
    let roadCondition = 'Suvi kolovozi, dobra vidljivost na svim pravcima';

    if (code === 0) {
      condition = 'Vedro i sunčano';
    } else if (code === 1 || code === 2) {
      condition = 'Umereno oblačno';
    } else if (code === 3) {
      condition = 'Pretežno oblačno';
    } else if (code === 45 || code === 48) {
      condition = 'Magla i smanjena vidljivost';
      roadCondition = 'Vlažni kolovozi i smanjena vidljivost zbog magle, držite odstojanje';
    } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || precip > 0) {
      condition = 'Kiša i mestimični pljuskovi';
      roadCondition = 'Mokri i klizavi kolovozi, prilagodite brzinu uslovima na putu';
    } else if (code >= 71 && code <= 77) {
      condition = 'Snežne padavine';
      roadCondition = 'Vlažan i klizav kolovoz uz zimske uslove vožnje';
    } else if (code >= 95) {
      condition = 'Pljuskovi sa grmljavinom';
      roadCondition = 'Mokar kolovoz i zadržavanje vode u udubljenjima, oprezna vožnja';
    }

    return { condition, tempC, windKmh, roadCondition };
  } catch {
    return {
      condition: 'Umereno oblačno',
      tempC: 16,
      windKmh: 12,
      roadCondition: 'Suvi kolovozi, dobra vidljivost',
    };
  }
}

async function generateContentResilient(
  ai: GoogleGenAI,
  options: {
    contents: string;
    systemInstruction?: string;
    tools?: any[];
    preferNoToolsFirst?: boolean;
  }
) {
  const attempts: Array<{ useTools: boolean; delayMs: number }> = options.preferNoToolsFirst
    ? [
        { useTools: false, delayMs: 0 },
        { useTools: true, delayMs: 500 },
      ]
    : [
        { useTools: Boolean(options.tools && options.tools.length > 0), delayMs: 0 },
        { useTools: false, delayMs: 600 },
      ];

  let lastErr: any = null;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((r) => setTimeout(r, attempt.delayMs));
    }
    try {
      const config: any = {};
      if (options.systemInstruction) config.systemInstruction = options.systemInstruction;
      if (attempt.useTools && options.tools && options.tools.length > 0) {
        config.tools = options.tools;
      }
      return await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: options.contents,
        config,
      });
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function formatClusterLead(article: any): string {
  const count = Number(article?.mediaCount || 1);
  const sources = Array.isArray(article?.relatedSources)
    ? article.relatedSources
    : [article?.sourceName || 'portal'];
  if (count >= 3) {
    return `Udarna tema o kojoj istovremeno izveštava ${count} redakcija (${sources.slice(0, 3).join(', ')})`;
  }
  if (count === 2) {
    return `Tema koju prenose ${sources.slice(0, 2).join(' i ')}`;
  }
  return `Kako prenosi ${article?.sourceName || 'portal'}`;
}

function composeEditorialBriefingFallback(
  prefs: any,
  articles: any[],
  weather: LiveWeatherResult,
  routeTitle: string
) {
  const hostFormat: 'solo' | 'duo' = prefs?.hostFormat === 'duo' ? 'duo' : 'solo';
  const commuteMins = Number(prefs?.estimatedCommuteMinutes) || 18;
  const effectiveDuration =
    prefs?.adaptiveDuration !== false
      ? commuteMins <= 14
        ? 2
        : commuteMins >= 22
        ? 6
        : 4
      : Number(prefs?.duration) || 4;

  const rankedArticles = [...articles].sort(
    (a, b) => (Number(b.importanceScore) || 0) - (Number(a.importanceScore) || 0)
  );
  const domesticArticles = rankedArticles.filter(
    (a) => a.sourceGroup === 'domaci_info' || a.sourceGroup === 'custom_urls' || a.sourceGroup === 'saobracaj_servisi'
  );
  const techArticles = rankedArticles.filter((a) => a.sourceGroup === 'it_tech');

  const dom1 = domesticArticles[0] || rankedArticles[0];
  const dom2 = domesticArticles[1] || rankedArticles[1];
  const dom3 = domesticArticles[2] || rankedArticles[2];
  const dom4 = domesticArticles[3] || rankedArticles[3];
  const dom5 = domesticArticles[4] || rankedArticles[4];
  const tech1 = techArticles[0] || rankedArticles[2] || rankedArticles[0];
  const tech2 = techArticles[1] || rankedArticles[3];
  const tech3 = techArticles[2] || rankedArticles[5];

  const rawChapters: Array<{
    id: string;
    title: string;
    category: string;
    text: string;
    articleUrl?: string;
    sourceName?: string;
  }> = [];

  const pacingIntro =
    effectiveDuration === 2
      ? `Brzi fokus brifing prilagođen kraćoj vožnji (~${commuteMins} min)`
      : effectiveDuration === 6
      ? `Prošireni Commute Magazin prilagođen dužoj vožnji (~${commuteMins} min)`
      : `Standardni gradski brifing prilagođen vožnji od ~${commuteMins} minuta`;

  if (hostFormat === 'duo') {
    const ch1Text = [
      `Jelena: Dobro jutro! Slušate ${pacingIntro} na relaciji ${routeTitle}. Trenutna temperatura je ${weather.tempC} stepeni, vreme je ${weather.condition.toLowerCase()}, uz vetar od ${weather.windKmh} kilometara na sat.`,
      `Milan: ${weather.roadCondition}. Na uključenjima je saobraćaj umeren, dok se na centralnim mostovima beleži zadržavanje od oko pet minuta.`,
    ].join('\n');
    rawChapters.push({
      id: 'ch-1',
      title: '1. Saobraćaj na ruti, AMSS i vreme',
      category: 'Saobraćaj i Vreme',
      text: ch1Text,
    });

    if (effectiveDuration === 2) {
      // Short commute: concise top breaking cluster + 1 tech highlight (3 chapters total)
      const ch2Lines: string[] = [];
      if (dom1) {
        ch2Lines.push(
          `Jelena: Pošto ste na kraćoj relaciji, izdvajamo najvažniji događaj dana. ${formatClusterLead(dom1)}: ${dom1.title}. ${dom1.summary}`
        );
      }
      if (dom2) {
        ch2Lines.push(`Milan: Ukratko i druga udarna vest — ${dom2.sourceName} javlja: ${dom2.title}.`);
      }
      rawChapters.push({
        id: 'ch-2',
        title: '2. Udarne vesti u fokusu (Blic presek)',
        category: 'Udarne Vesti',
        text: ch2Lines.join('\n') || 'Jelena: Na domaćim portalima u fokusu su ekonomske i gradske teme.',
        articleUrl: dom1?.url,
        sourceName: dom1?.sourceName,
      });

      const ch3Text = tech1
        ? `Jelena: Za kraj kratke vožnje, iz tehnologije: ${tech1.title}.\nMilan: Srećan put i ugodan ostatak dana!`
        : `Milan: Toliko u ovom brzom preseku za vašu rutu. Bezbednu vožnju vam želimo!`;
      rawChapters.push({
        id: 'ch-3',
        title: '3. Tehnološki blic i dolazak na cilj',
        category: 'Tech Blic',
        text: ch3Text,
        articleUrl: tech1?.url,
        sourceName: tech1?.sourceName,
      });
    } else if (effectiveDuration === 4) {
      // Medium commute: 4 chapters, ~6 stories with medium depth
      const ch2Lines: string[] = [];
      if (dom1) {
        ch2Lines.push(
          `Jelena: Krećemo od udarnih klastera dana. ${formatClusterLead(dom1)}: ${dom1.title}. ${dom1.summary}`
        );
      }
      if (dom2) {
        ch2Lines.push(
          `Milan: Visoko po broju objava u medijima je i sledeća tema — ${formatClusterLead(dom2).toLowerCase()}: ${dom2.title}. ${dom2.summary}`
        );
      }
      rawChapters.push({
        id: 'ch-2',
        title: '2. Udarni klasteri dana (Više medija)',
        category: 'Udarne Teme',
        text: ch2Lines.join('\n'),
        articleUrl: dom1?.url,
        sourceName: dom1?.sourceName,
      });

      const ch3Lines: string[] = [];
      if (dom3) {
        ch3Lines.push(
          `Jelena: U bloku ekonomije, biznisa i društva, ${formatClusterLead(dom3).toLowerCase()}: ${dom3.title}. ${dom3.summary}`
        );
      }
      if (dom4) {
        ch3Lines.push(`Milan: Pored toga, ${dom4.sourceName} izdvaja i: ${dom4.title}. ${dom4.summary}`);
      }
      if (ch3Lines.length > 0) {
        rawChapters.push({
          id: 'ch-3',
          title: '3. Ekonomija, Biznis i Društvo',
          category: 'Ekonomija i Društvo',
          text: ch3Lines.join('\n'),
          articleUrl: dom3?.url,
          sourceName: dom3?.sourceName,
        });
      }

      const ch4Lines: string[] = [];
      if (tech1) {
        ch4Lines.push(
          `Jelena: Prelazimo na IT i globalnu tehnologiju. ${formatClusterLead(tech1)}: ${tech1.title}. ${tech1.summary}`
        );
      }
      if (tech2) {
        ch4Lines.push(
          `Milan: Za kraj današnjeg pregleda, ${tech2.sourceName} piše: ${tech2.title}. Želimo vam mirnu i bezbednu vožnju!`
        );
      }
      rawChapters.push({
        id: `ch-${rawChapters.length + 1}`,
        title: `${rawChapters.length + 1}. IT, Tehnologija i Globalni Fokus`,
        category: 'Tech & Svet',
        text: ch4Lines.join('\n') || 'Milan: Pratite našu mapu za prohodnost ulica i srećan put!',
        articleUrl: tech1?.url,
        sourceName: tech1?.sourceName,
      });
    } else {
      // Long commute (duration === 6 / 22+ mins): 5 rich chapters covering 8-10 stories across categories
      const ch2Lines: string[] = [];
      if (dom1) {
        ch2Lines.push(
          `Jelena: Pošto imate dužu vožnju pred sobom, pripremili smo detaljan analitički pregled. Prva udarna tema dana — ${formatClusterLead(dom1).toLowerCase()}: ${dom1.title}. ${dom1.summary}`
        );
      }
      if (dom2) {
        ch2Lines.push(
          `Milan: Druga centralna tema o kojoj bruje portali — ${formatClusterLead(dom2).toLowerCase()}: ${dom2.title}. ${dom2.summary}`
        );
      }
      rawChapters.push({
        id: 'ch-2',
        title: '2. Udarni klasteri dana — Analiza više redakcija',
        category: 'Udarne Teme',
        text: ch2Lines.join('\n'),
        articleUrl: dom1?.url,
        sourceName: dom1?.sourceName,
      });

      const ch3Lines: string[] = [];
      if (dom3) {
        ch3Lines.push(
          `Jelena: U proširenom ekonomskom i društvenom bloku, ${formatClusterLead(dom3).toLowerCase()}: ${dom3.title}. ${dom3.summary}`
        );
      }
      if (dom4) {
        ch3Lines.push(
          `Milan: Takođe, važna vest iz privrede i finansija — ${formatClusterLead(dom4).toLowerCase()}: ${dom4.title}. ${dom4.summary}`
        );
      }
      rawChapters.push({
        id: 'ch-3',
        title: '3. Ekonomija, Finansije i Društvena Hronika',
        category: 'Ekonomija i Biznis',
        text: ch3Lines.join('\n') || 'Jelena: Privredni i finansijski tokovi u zemlji odvijaju se stabilno.',
        articleUrl: dom3?.url,
        sourceName: dom3?.sourceName,
      });

      const ch4Lines: string[] = [];
      if (tech1) {
        ch4Lines.push(
          `Jelena: U velikom tehnološkom bloku izdvajamo više priča. Prva stiže sa portala ${tech1.sourceName}: ${tech1.title}. ${tech1.summary}`
        );
      }
      if (tech2) {
        ch4Lines.push(
          `Milan: Druga važna IT tema danas — ${tech2.sourceName} analizira: ${tech2.title}. ${tech2.summary}`
        );
      }
      if (tech3) {
        ch4Lines.push(`Jelena: I treća vest iz digitalnog sveta: ${tech3.title}.`);
      }
      rawChapters.push({
        id: 'ch-4',
        title: '4. Dubinski IT, AI i Tehnološki Pregled',
        category: 'Tech & Inovacije',
        text: ch4Lines.join('\n'),
        articleUrl: tech1?.url,
        sourceName: tech1?.sourceName,
      });

      const interestsList = Array.isArray(prefs?.interests) && prefs.interests.length > 0
        ? prefs.interests.join(', ')
        : 'Ekonomija, Tehnologija i Kultura';
      const ch5Lines: string[] = [
        `Milan: U završnom poglavlju našeg dužeg brifinga, fokusiramo se na vaše lične teme (${interestsList}). ${
          dom5 ? `Izdvajamo i priču koju prenosi ${dom5.sourceName}: ${dom5.title}. ${dom5.summary}` : ''
        }`,
        `Jelena: Nadamo se da vam je ovaj detaljni pregled ulepšao dužu vožnju. Želimo vam bezbedan dolazak na odredište!`,
      ];
      rawChapters.push({
        id: 'ch-5',
        title: '5. Panorama vaših interesovanja i zaključak',
        category: 'Lični Fokus',
        text: ch5Lines.join('\n'),
        articleUrl: dom5?.url,
        sourceName: dom5?.sourceName,
      });
    }
  } else {
    // Solo speaker adaptive scaling
    const ch1Text = `Dobrodošli u ${pacingIntro} za rutu ${routeTitle}. Trenutna temperatura iznosi ${weather.tempC} stepeni uz ${weather.condition.toLowerCase()} i vetar od ${weather.windKmh} kilometara na sat. ${weather.roadCondition}.`;
    rawChapters.push({
      id: 'ch-1',
      title: '1. Saobraćaj na ruti, AMSS i vreme',
      category: 'Saobraćaj i Vreme',
      text: ch1Text,
    });

    const ch2Text = [
      dom1 ? `U pregledu najvažnijih vesti dana, ${formatClusterLead(dom1).toLowerCase()}: ${dom1.title}. ${dom1.summary}` : '',
      dom2 ? `Istovremeno, ${formatClusterLead(dom2).toLowerCase()}: ${dom2.title}. ${effectiveDuration >= 4 ? dom2.summary : ''}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    rawChapters.push({
      id: 'ch-2',
      title: '2. Udarni klasteri dana',
      category: 'Domaći Portali',
      text: ch2Text || 'Na domaćim portalima u fokusu su aktuelne ekonomske i društvene teme.',
      articleUrl: dom1?.url,
      sourceName: dom1?.sourceName,
    });

    if (effectiveDuration >= 4 && (dom3 || dom4)) {
      rawChapters.push({
        id: 'ch-3',
        title: '3. Ekonomija, Biznis i Društvo',
        category: 'Ekonomija',
        text: [
          dom3 ? `${formatClusterLead(dom3)}: ${dom3.title}. ${dom3.summary}` : '',
          effectiveDuration === 6 && dom4 ? `Takođe, ${dom4.sourceName} javlja: ${dom4.title}. ${dom4.summary}` : '',
        ]
          .filter(Boolean)
          .join(' '),
        articleUrl: dom3?.url,
        sourceName: dom3?.sourceName,
      });
    }

    rawChapters.push({
      id: `ch-${rawChapters.length + 1}`,
      title: `${rawChapters.length + 1}. IT, Tehnologija i Globalni Fokus`,
      category: 'Tech & Svet',
      text: [
        tech1 ? `Iz sveta tehnologije, ${formatClusterLead(tech1).toLowerCase()}: ${tech1.title}. ${tech1.summary}` : '',
        effectiveDuration >= 4 && tech2 ? `Pored toga, ${tech2.sourceName} prenosi: ${tech2.title}. ${effectiveDuration === 6 ? tech2.summary : ''}` : '',
        'Želimo vam prijatnu i bezbednu vožnju.',
      ]
        .filter(Boolean)
        .join(' '),
      articleUrl: tech1?.url,
      sourceName: tech1?.sourceName,
    });
  }

  const transcript = rawChapters.map((c) => c.text).join('\n\n');

  return {
    transcript,
    chapters: buildChaptersWithRatios(rawChapters, transcript),
  };
}

function buildChaptersWithRatios(
  rawChapters: Array<{
    id?: string;
    title?: string;
    category?: string;
    text?: string;
    articleUrl?: string;
    sourceName?: string;
  }>,
  fallbackTranscript: string
) {
  const valid =
    Array.isArray(rawChapters) && rawChapters.length > 0
      ? rawChapters.filter((c) => c && c.text && c.text.trim().length > 0)
      : [];

  if (valid.length === 0) {
    const paragraphs = fallbackTranscript
      .split(/\n\s*\n|\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const chunk1 = paragraphs[0] || fallbackTranscript;
    const chunk2 =
      paragraphs[1] ||
      'Saobraćaj na glavnim gradskim pravcima odvija se uz redovno praćenje stanja.';
    const chunk3 =
      paragraphs.slice(2).join(' ') || 'Pregled aktuelnih tema dana uspešno je pripremljen.';

    valid.push(
      { id: 'ch-1', title: '1. Stanje na ruti i vreme', category: 'Saobraćaj', text: chunk1 },
      { id: 'ch-2', title: '2. Hronika koridora i gradske vesti', category: 'Grad', text: chunk2 },
      { id: 'ch-3', title: '3. Tematski pregled skrejpovanih vesti', category: 'Fokus', text: chunk3 }
    );
  }

  const totalChars = valid.reduce((sum, ch) => sum + (ch.text?.length || 1), 0) || 1;
  let runningChars = 0;

  return valid.map((ch, idx) => {
    const len = ch.text?.length || 1;
    const startRatio = Number((runningChars / totalChars).toFixed(3));
    runningChars += len;
    const endRatio = idx === valid.length - 1 ? 1.0 : Number((runningChars / totalChars).toFixed(3));

    return {
      id: ch.id || `ch-${idx + 1}`,
      title: ch.title || `${idx + 1}. Poglavlje`,
      category: ch.category || 'Brifing',
      text: (ch.text || '').trim(),
      startRatio,
      endRatio,
      articleUrl: ch.articleUrl,
      sourceName: ch.sourceName,
    };
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // 1. Live Multi-Portal News Scraper Endpoint (with Instant Snapshot Cache + SWR)
  app.post('/api/scraper/fetch', async (req, res) => {
    try {
      const { sourceGroups, customUrls, forceRefresh } = req.body || {};
      const hadWarmCache =
        !forceRefresh &&
        (!customUrls || customUrls.length === 0) &&
        serverNewsSnapshot.allClustered.length > 0;

      const articles = await scrapeNewsSources(
        sourceGroups || ['domaci_info', 'it_tech', 'saobracaj_servisi'],
        customUrls || [],
        Boolean(forceRefresh)
      );
      res.json({
        articles,
        lastSyncedAt:
          serverNewsSnapshot.updatedAtLabel ||
          new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }),
        fromCache: hadWarmCache,
      });
    } catch (err: any) {
      console.error('Error in /api/scraper/fetch:', err);
      res.status(500).json({ error: 'Greška pri skrejpovanju portala.' });
    }
  });

  // 2. Custom Single Article or RSS URL Scraper Endpoint
  app.post('/api/scraper/custom-url', async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Unesite validan URL članka ili RSS izvora.' });
        return;
      }

      const normalizedUrl = /^https?:\/\//i.test(url.trim())
        ? url.trim()
        : `https://${url.trim()}`;

      let articles: any[] = [];
      try {
        const body = await fetchWithTimeout(normalizedUrl, 5000);
        if (/<(rss|feed)\b/i.test(body)) {
          const host = new URL(normalizedUrl).hostname.replace(/^www\./, '');
          articles = parseRssXmlItems(body, host, 'custom_urls', 'Korisnički RSS', 5);
        } else {
          const extracted = extractArticleFromHtml(body, normalizedUrl);
          articles = [
            {
              id: `custom-${Date.now()}`,
              title: extracted.title,
              sourceName: extracted.sourceName,
              sourceGroup: 'custom_urls',
              category: 'Korisnički URL',
              summary: extracted.summary,
              url: normalizedUrl,
              publishedAt: new Date().toLocaleTimeString('sr-RS', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              selected: true,
              fullText: extracted.fullText,
            },
          ];
        }
      } catch {
        const host = new URL(normalizedUrl).hostname.replace(/^www\./, '');
        try {
          const ai = getGenAIClient();
          const urlResp = await generateContentResilient(ai, {
            contents: `Izvuci naslov i kratak sažetak (2 rečenice na srpskom) sa stranice: ${normalizedUrl}`,
            tools: [{ urlContext: {} }],
          });
          const text = (urlResp.text || '').trim();
          const firstLine = text.split('\n')[0]?.replace(/[*#]/g, '').trim() || normalizedUrl;
          articles = [
            {
              id: `custom-${Date.now()}`,
              title: firstLine.slice(0, 110),
              sourceName: host,
              sourceGroup: 'custom_urls',
              category: 'Korisnički URL',
              summary: text.slice(0, 260),
              url: normalizedUrl,
              publishedAt: new Date().toLocaleTimeString('sr-RS', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              selected: true,
            },
          ];
        } catch {
          articles = [
            {
              id: `custom-${Date.now()}`,
              title: `Članak sa portala ${host}`,
              sourceName: host,
              sourceGroup: 'custom_urls',
              category: 'Korisnički URL',
              summary: `Direktna veza ka sadržaju na adresi ${normalizedUrl}.`,
              url: normalizedUrl,
              publishedAt: new Date().toLocaleTimeString('sr-RS', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              selected: true,
            },
          ];
        }
      }

      res.json({ articles });
    } catch (err: any) {
      console.error('Error in /api/scraper/custom-url:', err);
      res.status(500).json({ error: 'Nije moguće pročitati zadati URL.' });
    }
  });

  // 3. Deep-Dive Full Article Scraper & Audio Reader Endpoint
  app.post('/api/scraper/deep-dive', async (req, res) => {
    try {
      const { article, prefs } = req.body || {};
      if (!article || !article.title) {
        res.status(400).json({ error: 'Nedostaju podaci o članku za Deep-Dive.' });
        return;
      }

      const ai = getGenAIClient();
      let scrapedFullText = article.fullText || '';

      if (!scrapedFullText && article.url && /^https?:\/\//i.test(article.url)) {
        try {
          const html = await fetchWithTimeout(article.url, 4500);
          const extracted = extractArticleFromHtml(html, article.url);
          scrapedFullText = extracted.fullText;
        } catch {
          // Will use fallback below if needed
        }
      }

      const hostFormat: 'solo' | 'duo' = prefs?.hostFormat === 'duo' ? 'duo' : 'solo';
      const stylePrompt =
        hostFormat === 'duo'
          ? `Formatiraj kao dinamičan dijalog dva voditelja (Jelena: ... i Milan: ... u novim redovima, 4 do 6 replika) koji detaljno komentarišu i prepričavaju ceo ovaj članak vozaču.`
          : `Formatiraj kao jasan, detaljan radijski prilog jednog voditelja (oko 140–180 reči) koji vozaču prenosi sve ključne činjenice, kontekst i brojke iz ovog članka.`;

      let deepDiveText = '';
      try {
        const response = await generateContentResilient(ai, {
          contents: `Napravi dubinski audio prilog ("Deep-Dive") za vozača na osnovu sledećeg članka:
Naslov: ${article.title}
Izvor: ${article.sourceName || 'Portal'}
URL: ${article.url || ''}
Sažetak: ${article.summary || ''}
${scrapedFullText ? `Izvučeni tekst članka:\n${scrapedFullText.slice(0, 3500)}` : ''}

${stylePrompt}
Jezik: Srpski (${prefs?.languageVariant === 'ijekavica' ? 'ijekavica' : 'ekavica'}, latinica). Bez markdown oznaka (*, #).`,
          tools: article.url ? [{ urlContext: {} }] : undefined,
          preferNoToolsFirst: Boolean(scrapedFullText),
        });
        deepDiveText = (response.text || '').replace(/[*#`_~]/g, '').trim();
      } catch {
        const bodyExtract = scrapedFullText
          ? scrapedFullText.split(/\n+/).slice(0, 4).join(' ')
          : article.summary || '';
        if (hostFormat === 'duo') {
          deepDiveText = [
            `Jelena: Slušate detaljni Deep-Dive pregled članka sa portala ${article.sourceName || 'Info'}: ${article.title}.`,
            `Milan: ${article.summary || ''} ${bodyExtract}`.trim(),
          ].join('\n');
        } else {
          deepDiveText = `Detaljni pregled članka sa portala ${article.sourceName || 'Info'}. ${article.title}. ${article.summary || ''} ${bodyExtract}`.trim();
        }
      }

      if (!deepDiveText) {
        deepDiveText = `${article.title}. ${article.summary || ''}`;
      }

      let audioData = '';
      try {
        audioData = await synthesizeSpeech(
          ai,
          deepDiveText,
          prefs?.languageVariant || 'ekavica',
          hostFormat
        );
      } catch (ttsErr) {
        console.error('Deep-dive TTS error:', ttsErr);
      }

      res.json({
        title: `Deep-Dive: ${article.title}`,
        sourceName: article.sourceName,
        url: article.url,
        transcript: deepDiveText,
        audioData,
      });
    } catch (err: any) {
      console.error('Error in /api/scraper/deep-dive:', err);
      res.status(500).json({ error: 'Greška pri kreiranju Deep-Dive audio priloga.' });
    }
  });

  // OpenStreetMap Nominatim Geocoding Proxy
  app.get('/api/geo/search', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) {
        res.status(400).json({ error: 'Upit za lokaciju je prazan.' });
        return;
      }

      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        q.includes('Srbija') || q.includes('Beograd') ? q : `${q}, Beograd, Srbija`
      )}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CommuteCompanionApp/3.0 (AIStudio)',
          'Accept-Language': 'sr,en',
        },
      });

      if (!response.ok) {
        res.json({ found: false });
        return;
      }

      const data: any = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        res.json({
          found: true,
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name,
        });
      } else {
        res.json({ found: false });
      }
    } catch (err) {
      console.error('Geocode error:', err);
      res.json({ found: false });
    }
  });

  // OSRM Street Routing Proxy
  app.get('/api/geo/route', async (req, res) => {
    try {
      const startLat = parseFloat(String(req.query.startLat));
      const startLng = parseFloat(String(req.query.startLng));
      const endLat = parseFloat(String(req.query.endLat));
      const endLng = parseFloat(String(req.query.endLng));

      if ([startLat, startLng, endLat, endLng].some((v) => Number.isNaN(v))) {
        res.status(400).json({ error: 'Neispravne koordinate za rutiranje.' });
        return;
      }

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const response = await fetch(osrmUrl, {
        headers: {
          'User-Agent': 'CommuteCompanionApp/3.0 (AIStudio)',
        },
      });

      if (!response.ok) {
        throw new Error(`OSRM status ${response.status}`);
      }

      const data: any = await response.json();
      const route = data?.routes?.[0];
      if (!route || !route.geometry?.coordinates) {
        throw new Error('Ruta nije pronađena');
      }

      const coordinates: Array<[number, number]> = route.geometry.coordinates.map(
        (pair: [number, number]) => [pair[1], pair[0]]
      );

      res.json({
        coordinates,
        distanceKm: Number((route.distance / 1000).toFixed(1)),
        durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      });
    } catch {
      const startLat = parseFloat(String(req.query.startLat)) || 44.8206;
      const startLng = parseFloat(String(req.query.startLng)) || 20.4144;
      const endLat = parseFloat(String(req.query.endLat)) || 44.8162;
      const endLng = parseFloat(String(req.query.endLng)) || 20.4603;

      const steps = 16;
      const coordinates: Array<[number, number]> = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const arc = Math.sin(t * Math.PI) * 0.004;
        coordinates.push([
          startLat + (endLat - startLat) * t + arc,
          startLng + (endLng - startLng) * t,
        ]);
      }

      res.json({
        coordinates,
        distanceKm: 6.2,
        durationMinutes: 18,
      });
    }
  });

  // Generate personalized commute report from scraped articles + Open-Meteo weather + Gemini
  app.post('/api/news/generate', async (req, res) => {
    try {
      const { prefs, selectedArticles } = req.body || {};
      if (!prefs) {
        res.status(400).json({ error: 'Nedostaju parametri za generisanje izveštaja.' });
        return;
      }

      const ai = getGenAIClient();
      const isLive = prefs.mode === 'live';
      const hostFormat: 'solo' | 'duo' = prefs.hostFormat === 'duo' ? 'duo' : 'solo';
      const targetWordCount = prefs.duration === 2 ? 200 : prefs.duration === 6 ? 450 : 310;

      const initialStartCoords =
        prefs.startCoords || prefs.coords || { lat: 44.8206, lng: 20.4144 };

      // Fetch scraped articles and live Open-Meteo weather in parallel
      const [fetchedArticles, liveWeather] = await Promise.all([
        Array.isArray(selectedArticles) && selectedArticles.length > 0
          ? Promise.resolve(selectedArticles.filter((a: any) => a.selected !== false))
          : scrapeNewsSources(
              prefs.sourceGroups || ['domaci_info', 'it_tech', 'saobracaj_servisi'],
              prefs.customUrls || []
            ),
        fetchLiveWeather(initialStartCoords.lat, initialStartCoords.lng),
      ]);

      const articlesToUse = [...fetchedArticles].sort(
        (a: any, b: any) => (Number(b.importanceScore) || 0) - (Number(a.importanceScore) || 0)
      );

      const defaultRouteTitle = isLive
        ? prefs.location || 'Aktivni GPS Koridor'
        : `${prefs.startPoint || 'Polazište'} → ${prefs.destination || 'Odredište'}`;

      const scrapedDigestText =
        articlesToUse.length > 0
          ? articlesToUse
              .slice(0, 10)
              .map(
                (a: any, i: number) =>
                  `[Klaster #${i + 1} | Indeks važnosti: ${a.importanceScore || 50}/100 | Broj medija: ${a.mediaCount || 1} (${(a.relatedSources || [a.sourceName]).join(', ')})] Kategorija: ${a.category} | Naslov: "${a.title}" | Rezime: ${a.summary} | URL: ${a.url}`
              )
              .join('\n')
          : 'Koristi aktuelne vesti iz Srbije i sveta.';

      const routeContext = isLive
        ? prefs.coords
          ? `Trenutna GPS pozicija vozača: (${prefs.coords.lat.toFixed(4)}, ${prefs.coords.lng.toFixed(4)}) ${prefs.location ? `u oblasti ${prefs.location}` : 'u Beogradu / Srbiji'}`
          : `Lokalna vožnja u oblasti: ${prefs.location || 'Beograd, Srbija'}`
        : `Planirana ruta od "${prefs.startPoint || 'Novi Beograd'}" do "${prefs.destination || 'Centar Beograda'}"`;

      const formatInstruction =
        hostFormat === 'duo'
          ? `FORMAT EMISIJE: Radio Duo (2 voditelja: Jelena i Milan). Piši prirodan, živahan jutarnji dijalog gde svaka replika počinje sa "Jelena: " ili "Milan: " u novom redu (ukupno 6 do 10 naizmeničnih replika).`
          : `FORMAT EMISIJE: Solo radijski voditelj. Piši topao, jasan i direktan govor u 3 pasusa (po jedan pasus za svako poglavlje).`;

      const systemInstruction = `Ti si "Commute Companion", vrhunski srpski radijski kopilot i algoritamski urednik vesti za vozače (po uzoru na time.rs klasterizaciju važnosti).
Dijalekt: Srpski (${prefs.languageVariant === 'ijekavica' ? 'ijekavica' : 'ekavica'}, latinica).
Ciljna dužina govornog izveštaja: oko ${targetWordCount} reči (${prefs.duration} minuta slušanja).
${formatInstruction}

Tvoj zadatak:
1. Sastavi bogat, konkretan audio brifing koristeći STVARNE KLASTERIZOVANE ČLANKE ispod (poređane po indeksu važnosti i broju objava u medijima) i trenutne meteo podatke (${liveWeather.tempC}°C, ${liveWeather.condition}, vetar ${liveWeather.windKmh} km/h, ${liveWeather.roadCondition}) za: ${routeContext}.
2. Daj prioritet udarnim temama koje prenosi više redakcija i to obavezno naglasi u govoru (npr. "Udarna vest o kojoj izveštavaju RTS, N1 i Danas...", "Kako prenose 4 domaće redakcije...").
3. Fokusiraj se na izabrane oblasti interesovanja: ${(prefs.interests || ['Saobraćaj', 'Tehnologija']).join(', ')}.
4. Na kraju odgovora, NAKON oznake ---PODACI---, navedi JSON objekat sa poglavljima, tačkama na ruti sa GPS koordinatama, vremenom i sažecima.`;

      const prompt = `Pripremi personalizovani audio brifing za vozača.
Kontekst kretanja: ${routeContext}.
Trenutno vreme (Open-Meteo): ${liveWeather.tempC}°C, ${liveWeather.condition}, vetar ${liveWeather.windKmh} km/h (${liveWeather.roadCondition}).
Interesovanja: ${(prefs.interests || []).join(', ')}.
${formatInstruction}

SKREJPOVANI ČLANCI SA PORTALA ZA OVAJ BRIFING:
${scrapedDigestText}

Formatiraj odgovor tačno iz dva dela:
PRVI DEO: Čist govorni transkript (bez markdown znakova *, #).
DRUGI DEO: Nakon linije koja sadrži samo ---PODACI--- ispiši validan JSON objekat sledeće strukture:
{
  "routeTitle": "Kratak naziv rute ili koridora",
  "startCoords": { "lat": 44.8206, "lng": 20.4144 },
  "endCoords": { "lat": 44.8162, "lng": 20.4603 },
  "chapters": [
    {
      "id": "ch-1",
      "title": "1. Saobraćaj na ruti, AMSS i vreme",
      "category": "Saobraćaj i Vreme",
      "text": "Tačan deo transkripta koji pokriva stanje na putu i vreme..."
    },
    {
      "id": "ch-2",
      "title": "2. Pregled domaćih i poslovnih vesti",
      "category": "Domaći Portali",
      "text": "Tačan deo transkripta koji obrađuje skrejpovane vesti sa domaćih portala..."
    },
    {
      "id": "ch-3",
      "title": "3. IT, Tehnologija i Globalni Fokus",
      "category": "Tech & Svet",
      "text": "Tačan deo transkripta koji obrađuje IT/Tech i ostale odabrane članke..."
    }
  ],
  "highlights": ["Ključna stavka 1", "Ključna stavka 2", "Ključna stavka 3"],
  "weather": {
    "condition": "${liveWeather.condition}",
    "tempC": ${liveWeather.tempC},
    "windKmh": ${liveWeather.windKmh},
    "roadCondition": "${liveWeather.roadCondition}"
  },
  "trafficNodes": [
    {
      "id": "node-1",
      "title": "Naziv prve tačke",
      "locationName": "Bulevar / Uključenje",
      "severity": "prohodno",
      "delayMinutes": 0,
      "description": "Kratak opis prohodnosti",
      "progressRatio": 0.2,
      "lat": 44.8195,
      "lng": 20.4250
    },
    {
      "id": "node-2",
      "title": "Centralni most ili petlja",
      "locationName": "Glavni prelaz",
      "severity": "zastoj",
      "delayMinutes": 6,
      "description": "Kratak opis usporenja",
      "progressRatio": 0.55,
      "lat": 44.8152,
      "lng": 20.4425
    },
    {
      "id": "node-3",
      "title": "Prilaz destinaciji",
      "locationName": "Završna deonica",
      "severity": "radovi",
      "delayMinutes": 3,
      "description": "Kratak opis radova ili usporenja",
      "progressRatio": 0.85,
      "lat": 44.8160,
      "lng": 20.4565
    }
  ],
  "sections": [
    {
      "category": "Naziv kategorije",
      "headline": "Kratak naslov vesti",
      "summary": "Jedna rečenica rezimea",
      "sourceName": "Naziv portala",
      "url": "https://..."
    }
  ]
}`;

      let spokenTranscript = '';
      let parsedMeta: any = null;
      let searchSources: any[] = [];

      try {
        const response = await generateContentResilient(ai, {
          contents: prompt,
          systemInstruction,
          tools: [{ googleSearch: {} }],
          preferNoToolsFirst: articlesToUse.length > 0,
        });

        const rawText = response.text || '';
        const parts = rawText.split('---PODACI---');
        spokenTranscript = (parts[0] || rawText)
          .replace(/```json[\s\S]*?```/g, '')
          .replace(/[*#`_~]/g, '')
          .trim();

        if (parts[1]) {
          const jsonCandidate = parts[1]
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();
          try {
            parsedMeta = JSON.parse(jsonCandidate);
          } catch {
            parsedMeta = null;
          }
        }

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        searchSources = groundingChunks
          .map((chunk: any) => {
            if (chunk.web) return { title: chunk.web.title || 'Izvor vesti', uri: chunk.web.uri };
            if (chunk.maps) return { title: chunk.maps.title || 'Lokacija na mapi', uri: chunk.maps.uri };
            return null;
          })
          .filter(Boolean);
      } catch (aiErr: any) {
        console.warn('Gemini generation quota/error, using editorial fallback composer:', aiErr?.status || aiErr?.message);
      }

      let chapters: any[] = [];
      if (!spokenTranscript) {
        const composed = composeEditorialBriefingFallback(
          prefs,
          articlesToUse,
          liveWeather,
          defaultRouteTitle
        );
        spokenTranscript = composed.transcript;
        chapters = composed.chapters;
      } else {
        chapters = buildChaptersWithRatios(parsedMeta?.chapters, spokenTranscript);
      }

      const scrapedSources = articlesToUse.map((a: any) => ({
        title: `${a.sourceName}: ${a.title.slice(0, 48)}`,
        uri: a.url,
      }));

      const sources = [...scrapedSources, ...searchSources];

      let audioData = '';
      try {
        audioData = await synthesizeSpeech(
          ai,
          spokenTranscript,
          prefs.languageVariant || 'ekavica',
          hostFormat
        );
      } catch (ttsErr: any) {
        console.warn('TTS synthesis fallback to client Web Speech API:', ttsErr?.status || ttsErr?.message);
      }

      const startCoords =
        prefs.startCoords ||
        parsedMeta?.startCoords ||
        prefs.coords || { lat: 44.8206, lng: 20.4144 };

      const endCoords =
        prefs.endCoords ||
        parsedMeta?.endCoords || {
          lat: startCoords.lat - 0.006,
          lng: startCoords.lng + 0.045,
        };

      const radar = buildThreePointServiceRadar({
        prefs: { ...prefs, startCoords, endCoords },
        userCurrentCoords: prefs.coords || startCoords,
      });

      const enrichedChapters = chapters.map((ch: any, idx: number) => {
        if (idx === 0) {
          return {
            ...ch,
            expandedTitle: 'Kompletan Servisni Radar u 3 tačke (EDS, BVK, GSP)',
            expandedText: radar.spokenChapterExpanded,
          };
        }
        const relatedPool = articlesToUse.slice(idx * 2, idx * 2 + 3);
        const expandedBody = relatedPool
          .map((a: any, i: number) => `${i + 1}) ${a.title} (${a.sourceName}): ${a.summary}`)
          .join('\n\n');
        return {
          ...ch,
          expandedTitle: `Ceo blok: ${ch.category || ch.title}`,
          expandedText: ch.expandedText || expandedBody || ch.text,
        };
      });

      const report = {
        id: `rep-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }),
        routeTitle: parsedMeta?.routeTitle || defaultRouteTitle,
        hostFormat,
        transcript: spokenTranscript,
        chapters: enrichedChapters,
        scrapedArticles: articlesToUse,
        startCoords,
        endCoords,
        highlights:
          Array.isArray(parsedMeta?.highlights) && parsedMeta.highlights.length > 0
            ? parsedMeta.highlights
            : articlesToUse.slice(0, 3).map((a: any) => `${a.sourceName}: ${a.title}`),
        weather: parsedMeta?.weather || liveWeather,
        trafficNodes:
          radar.trafficNodes.length > 0
            ? radar.trafficNodes
            : Array.isArray(parsedMeta?.trafficNodes) && parsedMeta.trafficNodes.length > 0
            ? parsedMeta.trafficNodes
            : [
                {
                  id: 'node-1',
                  title: isLive ? 'Polazna zona' : prefs.startPoint || 'Polazište',
                  locationName: 'Uključenje na glavnu saobraćajnicu',
                  severity: 'prohodno',
                  delayMinutes: 0,
                  description: 'Saobraćaj se odvija bez zadržavanja.',
                  progressRatio: 0.2,
                  lat: startCoords.lat + (endCoords.lat - startCoords.lat) * 0.2,
                  lng: startCoords.lng + (endCoords.lng - startCoords.lng) * 0.2,
                },
              ],
        serviceRadar: radar.alerts,
        sections:
          Array.isArray(parsedMeta?.sections) && parsedMeta.sections.length > 0
            ? parsedMeta.sections
            : articlesToUse.slice(0, 5).map((a: any) => ({
                category: a.category,
                headline: a.title,
                summary: a.summary,
                sourceName: a.sourceName,
                url: a.url,
              })),
        sources,
        audioData,
      };

      res.json(report);
    } catch (error: any) {
      console.error('Error in /api/news/generate:', error);
      res.status(500).json({
        error: error?.message || 'Greška pri generisanju izveštaja sa servera.',
      });
    }
  });

  // Follow-up voice/text question endpoint
  app.post('/api/chat/ask', async (req, res) => {
    try {
      const { question, prefs, currentRouteTitle } = req.body || {};
      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'Pitanje nije prosleđeno.' });
        return;
      }

      const ai = getGenAIClient();
      const systemInstruction = `Ti si Commute Companion, glasovni kopilot za vozača u pokretu.
Ruta vozača: ${currentRouteTitle || 'Gradska vožnja'}.
Odgovaraj direktno, jasno i koncizno (2 do 3 kratke rečenice) jer vozač sluša odgovor dok vozi.
Bez markdown formatiranja, zvezdica ili taraba.
Jezik: Srpski (${prefs?.languageVariant === 'ijekavica' ? 'ijekavica' : 'ekavica'}, latinica).`;

      let cleanAnswer = '';
      let sources: any[] = [];

      try {
        const response = await generateContentResilient(ai, {
          contents: question,
          systemInstruction,
          tools: [{ googleSearch: {} }],
          preferNoToolsFirst: true,
        });

        cleanAnswer = (response.text || '')
          .replace(/[*#`_~]/g, '')
          .trim();

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        sources = groundingChunks
          .map((chunk: any) => {
            if (chunk.web) return { title: chunk.web.title || 'Izvor', uri: chunk.web.uri };
            if (chunk.maps) return { title: chunk.maps.title || 'Mapa', uri: chunk.maps.uri };
            return null;
          })
          .filter(Boolean);
      } catch {
        const qLower = question.toLowerCase();
        const coords = prefs?.startCoords || prefs?.coords || { lat: 44.8176, lng: 20.4633 };
        if (qLower.includes('vrem') || qLower.includes('prognoz') || qLower.includes('kiš') || qLower.includes('stepen')) {
          const w = await fetchLiveWeather(coords.lat, coords.lng);
          cleanAnswer = `Na trasi ${currentRouteTitle || 'kroz grad'} trenutno je ${w.tempC} stepeni uz ${w.condition.toLowerCase()} i vetar od ${w.windKmh} kilometara na sat. ${w.roadCondition}.`;
        } else if (qLower.includes('alternativ') || qLower.includes('brž') || qLower.includes('pravac')) {
          cleanAnswer = `Za relaciju ${currentRouteTitle || 'ka odredištu'}, preporučuje se korišćenje Bulevara Mihajla Pupina ili obilaznih bulevara uz izbegavanje središnje trake na Gazeli gde je trenutno usporenje od oko pet minuta.`;
        } else if (qLower.includes('vest') || qLower.includes('ekonom') || qLower.includes('tehnolog') || qLower.includes('blic')) {
          const fresh = await scrapeNewsSources(['domaci_info', 'it_tech'], []);
          const topTwo = fresh.slice(0, 2);
          if (topTwo.length > 0) {
            cleanAnswer = topTwo
              .map((a) => `${a.sourceName} izdvaja: ${a.title}.`)
              .join(' ');
          } else {
            cleanAnswer = `Glavne vesti danas prate ekonomske mere i aktuelnosti iz IT sektora na domaćim portalima.`;
          }
        } else {
          cleanAnswer = `Na koridoru ${currentRouteTitle || 'gradske vožnje'} saobraćaj je umerenog intenziteta uz zadržavanje od 4 do 6 minuta na centralnim mostovima, dok su prilazni bulevari prohodni.`;
        }
      }

      if (!cleanAnswer) {
        cleanAnswer = 'Saobraćaj na vašoj ruti se odvija redovno uz dobru prohodnost kolovoza.';
      }

      let audioData = '';
      try {
        audioData = await synthesizeSingleSpeaker(ai, cleanAnswer, prefs?.languageVariant || 'ekavica');
      } catch (ttsErr: any) {
        console.warn('Follow-up TTS fallback to Web Speech:', ttsErr?.status || ttsErr?.message);
      }

      res.json({
        text: cleanAnswer,
        audioData,
        sources,
      });
    } catch (error: any) {
      console.error('Error in /api/chat/ask:', error);
      res.status(500).json({
        error: error?.message || 'Greška pri obradi potpitanja.',
      });
    }
  });

  // Dedicated TTS endpoint
  app.post('/api/audio/tts', async (req, res) => {
    try {
      const { text, languageVariant, hostFormat } = req.body || {};
      if (!text) {
        res.status(400).json({ error: 'Tekst za sintezu glasa je obavezan.' });
        return;
      }
      const ai = getGenAIClient();
      let audioData = '';
      try {
        audioData = await synthesizeSpeech(
          ai,
          text,
          languageVariant || 'ekavica',
          hostFormat === 'duo' ? 'duo' : 'solo'
        );
      } catch {
        audioData = '';
      }
      res.json({ audioData });
    } catch (error: any) {
      console.error('Error in /api/audio/tts:', error);
      res.status(500).json({
        error: error?.message || 'Greška pri sintezi glasa.',
      });
    }
  });

  // Live official service sources refresh endpoint (EDS + BVK + GSP)
  app.post('/api/servisi/refresh', async (_req, res) => {
    const outPath = path.join(__dirname, 'public', 'data', 'servisi.json');
    const scriptPath = path.join(__dirname, 'scrapers', 'osvezi_servise.py');
    try {
      const { execFile } = await import('child_process');
      await new Promise<void>((resolve) => {
        execFile('python3', [scriptPath, outPath], { timeout: 60000 }, () => resolve());
      });
      if (fs.existsSync(outPath)) {
        const raw = fs.readFileSync(outPath, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.send(raw);
        return;
      }
      res.status(404).json({ error: 'servisi.json nije pronađen.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Greška pri osvežavanju servisa.' });
    }
  });

  // Aggregated Product Analytics ingest & summary endpoints
  const analyticsStorePath = path.join(__dirname, 'public', 'data', 'analytics_store.json');
  app.post('/api/analytics/ingest', (req, res) => {
    try {
      const ev = req.body?.event;
      if (!ev || !ev.type) {
        res.status(400).json({ error: 'Neispravan događaj.' });
        return;
      }
      fs.mkdirSync(path.dirname(analyticsStorePath), { recursive: true });
      let existing: any[] = [];
      if (fs.existsSync(analyticsStorePath)) {
        try {
          existing = JSON.parse(fs.readFileSync(analyticsStorePath, 'utf-8'));
          if (!Array.isArray(existing)) existing = [];
        } catch {
          existing = [];
        }
      }
      existing.unshift(ev);
      fs.writeFileSync(analyticsStorePath, JSON.stringify(existing.slice(0, 1000), null, 2));
      res.json({ ok: true, count: existing.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Greška pri čuvanju analitike.' });
    }
  });

  app.get('/api/analytics/aggregate', (_req, res) => {
    try {
      if (!fs.existsSync(analyticsStorePath)) {
        res.json({ events: [] });
        return;
      }
      const events = JSON.parse(fs.readFileSync(analyticsStorePath, 'utf-8'));
      res.json({ events: Array.isArray(events) ? events : [] });
    } catch {
      res.json({ events: [] });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Commute Companion server running on http://0.0.0.0:${PORT}`);
    // Pre-warm news cluster snapshot immediately on server boot
    refreshServerNewsSnapshot().catch((err) =>
      console.warn('Initial news snapshot warm-up warning:', err)
    );
    // Keep crawling & ranking news in the background every 8 minutes while idle (time.rs model)
    setInterval(() => {
      refreshServerNewsSnapshot().catch((err) =>
        console.warn('Scheduled background news refresh warning:', err)
      );
    }, 8 * 60 * 1000);
  });
}

startServer();
