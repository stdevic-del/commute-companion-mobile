import { createHash } from 'node:crypto';
import { parse as parseHtml } from 'node-html-parser';
import { cyrillicToLatin } from '../../../shared/transliterate.ts';

export { cyrillicToLatin };

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  sbquo: '‚',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  bull: '•',
  middot: '·',
  deg: '°',
  sect: '§',
};

const KNOWN_PORTAL_SUFFIXES = [
  'rts',
  'rts vesti',
  'danas',
  'dnevni list danas',
  'nova\\.rs',
  'nova',
  'nova s',
  'n1',
  'n1 info',
  'n1 srbija',
  'blic',
  'blic\\.rs',
  'kurir',
  'kurir\\.rs',
  'politika',
  'politika online',
  'novosti',
  'večernje novosti',
  'vecernje novosti',
  'b92',
  'b92\\.net',
  'telegraf',
  'telegraf\\.rs',
  'bizlife',
  'startit',
  'radar',
  'insajder',
  'euronews srbija',
  'euronews',
  'bbc news na srpskom',
  'bbc na srpskom',
  'bbc',
  'radio slobodna evropa',
  'slobodna evropa',
  'klix\\.ba',
  'klix',
  'index\\.hr',
  'vijesti',
  'techcrunch',
  'the verge',
  'google news',
  'google vesti',
];

const KNOWN_SUFFIX_RE = new RegExp(
  `\\s*(?:\\||::|—|–|\\s-\\s)\\s*(?:${KNOWN_PORTAL_SUFFIXES.join('|')})\\s*$`,
  'i'
);

const ABBREV_END_RE =
  /(?:\b(?:dr|mr|prof|br|tj|npr|itd|sl|god|hilj|mln|mld|ul|st|sv|gosp|gđa|g-đa|srp|eng|lat|tzv|oko|cca|min|max|br\.|str)|(?:\b\d{1,2}))\.$/i;

function decodeOnce(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    const low = code.toLowerCase();
    if (low.startsWith('#x')) {
      const cp = Number.parseInt(low.slice(2), 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
    }
    if (low.startsWith('#')) {
      const cp = Number.parseInt(low.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
    }
    return NAMED_ENTITIES[low] ?? match;
  });
}

export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes('&')) return input;
  const once = decodeOnce(input);
  // Neki feedovi (npr. Google News) dvostruko kodiraju entitete (&amp;quot;)
  return once.includes('&') ? decodeOnce(once) : once;
}

export function collapseWhitespace(input: string): string {
  return input
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripHtmlTags(input: string): string {
  if (!input) return '';
  const decoded = decodeHtmlEntities(input);
  if (!decoded.includes('<')) {
    return collapseWhitespace(decoded);
  }

  // Dodaj razmak oko blokovskih tagova da se rečenice ne spoje
  const spaced = decoded
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|br|li|h[1-6]|blockquote|tr|td|th)\b[^>]*>/gi, ' ');

  const root = parseHtml(spaced, { comment: false });
  return collapseWhitespace(decodeHtmlEntities(root.text));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Čisti naslov za prikaz i ujednačava pismo na srpsku latinicu,
 * uklanja HTML, entitete, višak razmaka i sufikse portala tipa " - RTS" / " | Danas".
 */
export function cleanTitle(rawTitle: string, sourceName?: string | null): string {
  let title = cyrillicToLatin(stripHtmlTags(rawTitle));
  if (!title) return '';

  // 1. Ako znamo ime izvora, skini sufiks sa tim imenom (na latinici)
  if (sourceName && sourceName.trim().length >= 2) {
    const cleanSource = sourceName.replace(/\s*\(signal\)\s*/i, '').trim();
    const variants = Array.from(new Set([cleanSource, cyrillicToLatin(cleanSource)])).filter(Boolean);
    for (const v of variants) {
      const re = new RegExp(`\\s*(?:\\||::|—|–|\\s-\\s)\\s*${escapeRegExp(v)}\\s*$`, 'i');
      const stripped = title.replace(re, '').trim();
      if (stripped.length >= 10) {
        title = stripped;
      }
    }
  }

  // 2. Skini poznate sufikse portala (npr. " - RTS" / " | Danas")
  const suffixMatch = title.match(KNOWN_SUFFIX_RE);
  if (suffixMatch && suffixMatch.index !== undefined && suffixMatch.index >= 10) {
    title = title.slice(0, suffixMatch.index).trim();
  }

  return collapseWhitespace(title);
}

/**
 * Normalizovana verzija teksta za poređenje, `title_hash` i klasterovanje:
 * 1. ćirilica → latinica (lj, nj, dž, đ...)
 * 2. mala slova
 * 3. đ → dj, skidanje svih dijakritika (č/ć → c, š → s, ž → z, é → e...)
 * 4. samo slova i cifre razdvojene jednim razmakom
 */
export function normalizeForComparison(input: string): string {
  if (!input) return '';
  const latin = cyrillicToLatin(stripHtmlTags(input)).toLowerCase();
  const folded = latin
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return folded
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function sha1Hex(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex');
}

function stripFeedBoilerplate(text: string): string {
  return text
    .replace(/\bThe post\b[\s\S]*?\bappeared first on\b[\s\S]*$/i, '')
    .replace(/\bČlanak\b[\s\S]*?\bse pojavljuje prvo na\b[\s\S]*$/i, '')
    .replace(/(?:\s*(?:Opširnije|Pročitajte više|Čitajte više|Read more|Continue reading|Detaljnije)\s*(?:\.{2,3}|…|→|»)?\s*)+$/i, '')
    .trim();
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    // Preskoči elipsu "..."
    if (ch === '.' && (text[i + 1] === '.' || text[i - 1] === '.')) continue;

    // Mora biti kraj teksta ili praćeno razmakom / navodnikom pa razmakom
    const next = text[i + 1];
    if (next && !/[\s"”»')\]]/.test(next)) continue;

    const candidate = text.slice(start, i + 1).trim();
    if (ch === '.' && ABBREV_END_RE.test(candidate)) {
      continue;
    }

    if (candidate.length >= 12) {
      sentences.push(candidate);
      start = i + 1;
      while (start < text.length && /[\s"”»')\]]/.test(text[start])) {
        start += 1;
      }
      i = start - 1;
    }
  }

  const tail = text.slice(start).trim();
  if (tail.length > 0) {
    sentences.push(tail);
  }

  return sentences;
}

function truncateAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > Math.floor(maxChars * 0.6) ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:\-–—\s]+$/, '')}…`;
}

/**
 * Gradi čist uvod (snippet) od 1–2 rečenice (<= maxChars znakova) na srpskoj latinici.
 * Uklanja HTML, WordPress šablone i ponavljanje naslova na početku uvoda.
 */
export function buildSnippet(
  rawDescription: string,
  cleanTitleText: string,
  maxChars: number = 280
): string {
  let clean = stripFeedBoilerplate(cyrillicToLatin(stripHtmlTags(rawDescription)));
  if (!clean) return '';

  // Ako uvod ponavlja isti naslov na početku, skini taj duplikat
  const normTitle = normalizeForComparison(cleanTitleText);
  const normClean = normalizeForComparison(clean);
  if (normTitle.length >= 12) {
    if (normClean === normTitle) return '';
    if (normClean.startsWith(`${normTitle} `) && clean.length > cleanTitleText.length + 10) {
      const possibleRemainder = clean.slice(cleanTitleText.length).replace(/^[\s.:–—-]+/, '').trim();
      if (possibleRemainder.length >= 15) {
        clean = possibleRemainder;
      }
    }
  }

  const sentences = splitSentences(clean);
  if (sentences.length === 0) {
    return truncateAtWord(clean, maxChars);
  }

  let out = sentences[0];
  if (sentences.length >= 2 && out.length + 1 + sentences[1].length <= maxChars) {
    out = `${out} ${sentences[1]}`;
  }

  return truncateAtWord(out, maxChars);
}
