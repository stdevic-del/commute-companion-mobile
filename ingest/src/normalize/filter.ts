import { normalizeForComparison } from './text.ts';

/**
 * URL putanje tabloidnog, rijaliti i lajfstajl/magazin sadržaja koji potpuno odbacujemo pre upisa u bazu.
 */
const BLOCKED_URL_SEGMENTS = new Set([
  'zabava',
  'estrada',
  'rijaliti',
  'jetset',
  'jet-set',
  'magazin',
  'lifestyle',
  'lajfstajl',
  'slobodno-vreme',
  'slobodno_vreme',
  'zena',
  'dom',
  'dom-i-basta',
  'dom-i-vrt',
  'kuca-i-basta',
  'basta',
  'vrt',
  'recepti',
  'kuvar',
  'gastro',
  'kuhinja',
  'horoskop',
  'astro',
  'astrologija',
  'saveti',
  'lepota',
  'ljubav',
  'ljubav-i-seks',
  'seks',
  'showbiz',
  'soubiz',
  'scena',
  'poznati',
  'moda',
  'zanimljivosti',
  'viral',
  'kviz',
  'enterijer',
  'fitnes',
  'fitness',
  'dijeta',
  'ljubimci',
  'putovanja',
  'roditeljstvo',
  'brak',
]);

/**
 * RSS <category> vrednosti (normalizovane u ASCII mala slova) koje potpuno odbacujemo.
 */
const BLOCKED_RSS_CATEGORIES = new Set([
  'zabava',
  'estrada',
  'rijaliti',
  'jetset',
  'jet set',
  'magazin',
  'lifestyle',
  'lajfstajl',
  'slobodno vreme',
  'zena',
  'dom',
  'dom i basta',
  'dom i vrt',
  'kuca i basta',
  'basta',
  'vrt',
  'recepti',
  'kuvar',
  'gastro',
  'kuhinja',
  'horoskop',
  'astrologija',
  'saveti',
  'lepota',
  'lepota i zdravlje',
  'ljubav',
  'ljubav i seks',
  'seks',
  'showbiz',
  'soubiz',
  'scena',
  'poznati',
  'moda',
  'zanimljivosti',
  'viral',
  'enterijer',
  'fitnes',
  'dijeta',
  'ljubimci',
  'zivot',
  'life',
  'porodica',
]);

/**
 * Ključne reči čistog tabloidnog, rijaliti i lajfstajl šuma (na normalizovanom ASCII tekstu).
 */
const NOISE_TEXT_PATTERNS: Array<{ reason: string; re: RegExp }> = [
  {
    reason: 'tabloid/rijaliti',
    re: /\b(starlet[a-z]*|zadrug[a-z]*|rijaliti[a-z]*|elita\s*[789]|parovi\s+rijaliti|zvezde\s+granda|pinkove\s+zvezd|veliki\s+brat|estradn[a-z]*|estrada|paparaco|u\s+bikiniju|vruce\s+fotk|sok\s+fotk|razvod\s+godine)\b/i,
  },
  {
    reason: 'horoskop/ezoterija',
    re: /\b(horoskop[a-z]*|zodijak[a-z]*|tarot[a-z]*|retrogradn[a-z]+\s+merkur|numerologij[a-z]*|sanovnik)\b/i,
  },
  {
    reason: 'lajfstajl/saveti',
    re: /\b(bastovanstv[a-z]*|travnjak[a-z]*|sobne?\s+biljk[a-z]*|sobno\s+cvece|zalivanj[a-z]+\s+(?:cveca|biljaka|travnjaka)|orezivanj[a-z]+\s+(?:ruza|biljaka|cveca|grmlja)|recept\s+za|najbolji\s+recept|brzi\s+kolac|kako\s+da\s+(?:ocistite|uklonite|operete|smrsate|brze\s+zaspite|zaspite|zategnete|spremite|operete\s+ves|izbelite)|trik\s+(?:za\s+ciscenje|domacic|sa\s+sodom|sa\s+sircetom)|topla\s+kupka|tus\s+pre\s+spavanja|tus\s+prije\s+spavanja|brze\s+zaspite|nega\s+koze|nega\s+kose|protiv\s+bora|celulit[a-z]*|dijeta\s+za|skinuti\s+kilogram|ljubavni\s+savet|modni\s+trend|frizur[a-z]+\s+za)\b/i,
  },
];

function extractUrlSegments(rawUrl: string | null | undefined): string[] {
  if (!rawUrl) return [];
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = rawUrl;
  }
  return pathname
    .toLowerCase()
    .split('/')
    .map((seg) =>
      seg
        .replace(/đ/g, 'dj')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
    )
    .filter(Boolean);
}

export interface NoiseCheckInput {
  url: string;
  canonicalUrl?: string;
  title: string;
  snippet?: string;
  rssCategories?: string[];
}

/**
 * Strogi filter za odbacivanje tabloidnog, rijaliti i lajfstajl/magazin šuma pre upisa u bazu.
 * Vraća razlog odbacivanja (string) ako stavku treba odbaciti, ili `null` ako je vest relevantna.
 */
export function detectNoiseReason(input: NoiseCheckInput): string | null {
  // 1. URL putanja (proveravamo i sirovi i kanonski URL)
  const segments = new Set([
    ...extractUrlSegments(input.url),
    ...extractUrlSegments(input.canonicalUrl),
  ]);
  for (const seg of segments) {
    if (BLOCKED_URL_SEGMENTS.has(seg)) {
      return `url:/${seg}/`;
    }
  }

  // 2. RSS <category> tagovi
  if (Array.isArray(input.rssCategories)) {
    for (const rawCat of input.rssCategories) {
      const normCat = normalizeForComparison(rawCat);
      if (!normCat) continue;
      if (BLOCKED_RSS_CATEGORIES.has(normCat)) {
        return `rss-cat:${normCat}`;
      }
      // Proveri i pojedinačne delove složenih kategorija (npr. "Zabava / Estrada")
      for (const part of rawCat.split(/[\/|,>]/)) {
        const normPart = normalizeForComparison(part);
        if (normPart && BLOCKED_RSS_CATEGORIES.has(normPart)) {
          return `rss-cat:${normPart}`;
        }
      }
    }
  }

  // 3. Ključne reči u naslovu i uvodu
  const combinedNorm = normalizeForComparison(`${input.title} ${input.snippet ?? ''}`);
  for (const rule of NOISE_TEXT_PATTERNS) {
    if (rule.re.test(combinedNorm)) {
      return rule.reason;
    }
  }

  return null;
}
