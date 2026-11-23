const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

function normalizeForComparison(input: string): string {
  const low = (input || '').toLowerCase();
  let latin = '';
  for (let i = 0; i < low.length; i += 1) {
    const ch = low[i];
    latin += CYR_TO_LAT[ch] ?? ch;
  }
  return latin
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * URL putanje tabloidnog, rijaliti, domaćinstvo i lajfstajl/magazin sadržaja koji potpuno odbacujemo pre upisa u bazu.
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
  'domacinstvo',
  'kucni-saveti',
  'uradi-sam',
  'ciscenje',
  'basta',
  'vrt',
  'recepti',
  'kuvar',
  'gastro',
  'kuhinja',
  'trpeza',
  'horoskop',
  'astro',
  'astrologija',
  'saveti',
  'lepota',
  'ljubav',
  'ljubav-i-seks',
  'seks',
  'veze',
  'showbiz',
  'soubiz',
  'scena',
  'poznati',
  'celebrity',
  'vip',
  'moda',
  'zanimljivosti',
  'svastara',
  'razonoda',
  'bizar',
  'bizarno',
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
  'domacinstvo',
  'kucni saveti',
  'uradi sam',
  'ciscenje',
  'basta',
  'vrt',
  'recepti',
  'kuvar',
  'gastro',
  'kuhinja',
  'trpeza',
  'horoskop',
  'astrologija',
  'saveti',
  'saveti za domacinstvo',
  'lepota',
  'lepota i zdravlje',
  'zdravlje i lepota',
  'narodni lek',
  'ljubav',
  'ljubav i seks',
  'seks',
  'veze',
  'showbiz',
  'soubiz',
  'scena',
  'poznati',
  'celebrity',
  'vip',
  'moda',
  'zanimljivosti',
  'svastara',
  'razonoda',
  'bizar',
  'bizarno',
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
 * Održiva crna lista klikbejt obrazaca i senzacionalističkih udica (na normalizovanom ASCII tekstu).
 */
export const CLICKBAIT_BLOCKLIST: RegExp[] = [
  /\b(necete\s+verovati|necete\s+vjerovati|ne\s+mozete\s+ni\s+da\s+zamislite)\b/i,
  /\b(sokiracete\s+se|ostacete\s+bez\s+teksta|ostavlja\s+bez\s+daha|zanemecete|zaledicete\s+se|najezicete\s+se)\b/i,
  /\b(evo\s+sta\s+se\s+(?:desava|dogadja|desi|dogodi)\s+(?:ako|kada|u\s+telu)|evo\s+zasto\s+nikada\s+ne\s+(?:treba|smete|smijete)|evo\s+sta\s+znaci\s+kada)\b/i,
  /\b(ovo\s+je\s+prava\s+istina\s+o|ovo\s+sigurno\s+niste\s+znali|malo\s+ko\s+zna\s+da|retko\s+ko\s+zna\s+ovaj\s+trik|rijetko\s+ko\s+zna)\b/i,
  /\b(celog\s+zivota\s+(?:radite\s+)?pogresno|cijelog\s+zivota\s+(?:radite\s+)?pogresno|svi\s+prave\s+ovu\s+gresku|nikako\s+ne\s+radite\s+ovo)\b/i,
  /\b(odmah\s+izbacite\s+iz\s+kuce|nikada\s+ne\s+drzite\s+u\s+kuci|privlaci\s+nesrecu\s+u\s+dom|donosi\s+losu\s+energiju)\b/i,
  /\b(rasplakalo\s+(?:srbiju|region|balkan)|zapalilo\s+(?:mreze|internet|drustvene\s+mreze)|usijale\s+se\s+mreze|bruji\s+(?:srbija|region|internet|ceo\s+svet))\b/i,
  /\b(sok\s+u\s+programu|haos\s+u\s+studiju|skandal\s+na\s+estradi|pljuste\s+uvrede|javno\s+se\s+obracunali|isplivali\s+intimni\s+detalji|otkrila\s+sve\s+detalje\s+iz\s+kreveta)\b/i,
  /\b(foto\s+video\s+18|18\s*\+\s*foto|vruci\s+kadrovi|bez\s+cenzure\s+u\s+rijalitiju)\b/i,
];

/**
 * Ključne reči čistog tabloidnog, rijaliti, domaćinstvo/buđ i lajfstajl šuma (na normalizovanom ASCII tekstu).
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
    reason: 'domacinstvo/budj/ciscenje',
    re: /\b(budj\b|budji\b|protiv\s+budji|uklonite\s+budj|ocistite\s+budj|vlaga\s+u\s+(?:stanu|kuci|kupatilu|zidovima)|kondenzacij[a-z]+\s+na\s+prozor|kamenac\s+u\s+(?:kupatilu|wc|kuvalu|masini)|masnoc[a-z]+\s+sa\s+(?:rerne|sporeta|kuhinje)|neprijatan\s+miris\s+iz\s+(?:ves\s+masine|frizidera|odvoda|sudopere)|zapu[s]en\s+odvod|ves\s+masin[a-z]+\s+smrdi|sirce\s+i\s+soda|soda\s+bikarbona\s+za\s+ciscenje|limuntus\s+u\s+masin|stavite\s+u\s+(?:ves\s+masinu|frizider|rernu|wc\s+solju)|ocistite\s+(?:kupatilo|rernu|frizider|tepih|fuge|prozore|kamenac)|uklonite\s+(?:kamenac|tvrdokorne\s+mrlje|rdju|masnocu))\b/i,
  },
  {
    reason: 'lajfstajl/saveti/zdravlje-trikovi',
    re: /\b(bastovanstv[a-z]*|travnjak[a-z]*|sobne?\s+biljk[a-z]*|sobno\s+cvece|zalivanj[a-z]+\s+(?:cveca|biljaka|travnjaka)|orezivanj[a-z]+\s+(?:ruza|biljaka|cveca|grmlja)|recept\s+za|najbolji\s+recept|brzi\s+kolac|kako\s+da\s+(?:ocistite|uklonite|operete|smrsate|brze\s+zaspite|zaspite|zategnete|spremite|operete\s+ves|izbelite)|trik\s+(?:za\s+ciscenje|domacic|sa\s+sodom|sa\s+sircetom)|topla\s+kupka|tus\s+pre\s+spavanja|tus\s+prije\s+spavanja|brze\s+zaspite|nega\s+koze|nega\s+kose|protiv\s+bora|celulit[a-z]*|dijeta\s+za|skinuti\s+kilogram|ljubavni\s+savet|modni\s+trend|frizur[a-z]+\s+za|cisti\s+(?:jetru|krvne\s+sudove|creva|organizam\s+od\s+toksina)|detoksikacij[a-z]+\s+organizma|izbacuje\s+toksine|topi\s+(?:masne\s+naslage|kilograme|salo)|salo\s+na\s+stomaku|jedite\s+ovo\s+svakog\s+jutra|pijte\s+ovo\s+pre\s+spavanja|narodni\s+lek\s+za|ovaj\s+napitak\s+(?:topi|cisti|leci))\b/i,
  },
];

/**
 * Engleske funkcionalne i česte reči koje se ne javljaju kao reči u srpskom/regionalnom jeziku.
 * (Namerno izostavljene reči koje postoje i u srpskom: "in", "a", "i", "to", "on", "da", "ne", "no")
 */
const EN_ONLY_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'has',
  'had',
  'are',
  'was',
  'were',
  'will',
  'would',
  'could',
  'should',
  'about',
  'into',
  'over',
  'after',
  'before',
  'between',
  'under',
  'through',
  'during',
  'without',
  'within',
  'against',
  'among',
  'their',
  'there',
  'these',
  'those',
  'which',
  'while',
  'where',
  'when',
  'what',
  'who',
  'whom',
  'whose',
  'why',
  'how',
  'than',
  'then',
  'them',
  'they',
  'your',
  'our',
  'its',
  'his',
  'her',
  'you',
  'been',
  'being',
  'does',
  'did',
  'doing',
  'done',
  'can',
  'cannot',
  'might',
  'must',
  'shall',
  'such',
  'some',
  'any',
  'each',
  'every',
  'both',
  'more',
  'most',
  'other',
  'another',
  'only',
  'very',
  'just',
  'also',
  'even',
  'still',
  'already',
  'always',
  'never',
  'often',
  'however',
  'although',
  'because',
  'since',
  'unless',
  'until',
  'whether',
  'new',
  'first',
  'last',
  'best',
  'worst',
  'many',
  'much',
  'users',
  'features',
  'update',
  'updates',
  'announces',
  'announced',
  'launches',
  'launched',
  'reveals',
  'revealed',
  'discover',
  'discovered',
  'scientists',
  'researchers',
  'experts',
  'according',
  'report',
  'reports',
  'world',
  'company',
  'companies',
  'market',
  'markets',
  'available',
  'release',
  'released',
  'performance',
  'issues',
  'fix',
  'fixes',
  'rolling',
  'out',
  'now',
  'here',
]);

/**
 * Nemačke, francuske i španske funkcionalne reči za prepoznavanje ne-regionalnih članaka.
 */
const OTHER_FOREIGN_WORDS = new Set([
  'der',
  'die',
  'das',
  'und',
  'mit',
  'fur',
  'von',
  'auf',
  'ist',
  'sind',
  'nicht',
  'werden',
  'auch',
  'sich',
  'nach',
  'bei',
  'uber',
  'einer',
  'einem',
  'einen',
  'les',
  'des',
  'une',
  'dans',
  'pour',
  'avec',
  'sur',
  'sont',
  'cette',
  'mais',
  'comme',
  'los',
  'las',
  'del',
  'para',
  'con',
  'una',
  'por',
  'pero',
  'sus',
  'entre',
]);

/**
 * Srpske i regionalne (BCMS) funkcionalne reči i česti oblici.
 */
const SR_REGIONAL_WORDS = new Set([
  'u',
  'na',
  'za',
  'od',
  'do',
  'sa',
  'iz',
  'po',
  'ka',
  'kod',
  'bez',
  'kroz',
  'pred',
  'nad',
  'pod',
  'uz',
  'niz',
  'je',
  'su',
  'ce',
  'bi',
  'bio',
  'bila',
  'bilo',
  'bili',
  'biti',
  'nije',
  'nisu',
  'nece',
  'sto',
  'sta',
  'koji',
  'koja',
  'koje',
  'kojem',
  'kojih',
  'kojima',
  'kako',
  'kada',
  'gde',
  'gdje',
  'dok',
  'jer',
  'ili',
  'ali',
  'vec',
  'kao',
  'vise',
  'manje',
  'posle',
  'poslije',
  'pre',
  'prije',
  'tokom',
  'nakon',
  'prema',
  'protiv',
  'izmedju',
  'oko',
  'zbog',
  'ipak',
  'samo',
  'jos',
  'sve',
  'svih',
  'svoj',
  'svoju',
  'svoje',
  'ovaj',
  'ova',
  'ovo',
  'taj',
  'ta',
  'novi',
  'nova',
  'novo',
  'novog',
  'novom',
  'prvi',
  'prva',
  'prvo',
  'danas',
  'juce',
  'jucer',
  'sutra',
  'sada',
  'srbija',
  'srbije',
  'srbiji',
  'srbiju',
  'beograd',
  'beogradu',
  'beograda',
  'hrvatska',
  'hrvatske',
  'hrvatskoj',
  'bih',
  'sarajevo',
  'sarajevu',
  'zagreb',
  'zagrebu',
  'podgorica',
  'region',
  'regionu',
  'predsednik',
  'predsjednik',
  'vlada',
  'vlade',
  'ministar',
  'ministarstvo',
  'policija',
  'sud',
  'utakmica',
  'pobedio',
  'pobjedio',
  'osvojio',
  'najavio',
  'izjavio',
  'porucio',
  'otkriva',
  'saznaje',
  'godine',
  'godina',
  'evra',
  'dinara',
  'miliona',
]);

const SERBIAN_CYRILLIC_RE = /[а-шђжћчџА-ШЂЖЋЧЏ]/;
const SERBIAN_LATIN_DIACRITICS_RE = /[čćžšđČĆŽŠĐ]/;
const SERBIAN_MORPH_SUFFIX_RE =
  /\b[a-z]{4,}(?:anje|enje|inja|ovima|evima|iraju|ujuci|ovski|evski|istvo|izam|acija|skoj|skom|skih|skim|njem|stina|cina)\b/i;

function countLanguageSignals(rawText: string): {
  wordCount: number;
  enCount: number;
  otherForeignCount: number;
  srCount: number;
  hasCyrillic: boolean;
  hasSerbianDiacritics: boolean;
} {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return {
      wordCount: 0,
      enCount: 0,
      otherForeignCount: 0,
      srCount: 0,
      hasCyrillic: false,
      hasSerbianDiacritics: false,
    };
  }

  const hasCyrillic = SERBIAN_CYRILLIC_RE.test(trimmed);
  const hasSerbianDiacritics = SERBIAN_LATIN_DIACRITICS_RE.test(trimmed);
  const norm = normalizeForComparison(trimmed);
  const tokens = norm.split(/\s+/).filter((t) => t.length >= 1 && /[a-z]/.test(t));

  let enCount = 0;
  let otherForeignCount = 0;
  let srCount = 0;

  for (const tok of tokens) {
    if (SR_REGIONAL_WORDS.has(tok)) {
      srCount += 1;
    } else if (EN_ONLY_WORDS.has(tok)) {
      enCount += 1;
    } else if (OTHER_FOREIGN_WORDS.has(tok)) {
      otherForeignCount += 1;
    }
  }

  if (SERBIAN_MORPH_SUFFIX_RE.test(norm)) {
    srCount += 1;
  }

  return {
    wordCount: tokens.length,
    enCount,
    otherForeignCount,
    srCount,
    hasCyrillic,
    hasSerbianDiacritics,
  };
}

/**
 * Proverava da li su naslov i opis članka na srpskom ili regionalnom (BCMS) jeziku.
 * Odbacuje članke na engleskom ili drugim stranim jezicima koji povremeno upadnu iz tech/stranih fidova.
 */
export function isSerbianOrRegionalLanguage(title: string, snippet?: string): boolean {
  const tSig = countLanguageSignals(title);
  const sSig = countLanguageSignals(snippet ?? '');

  // 1) Provera naslova: ako naslov nema ćirilicu ni srpske dijakritike, a ima >= 2 engleske/strane funkcionalne reči bez srpskih markera
  if (!tSig.hasCyrillic) {
    const titleForeign = tSig.enCount + tSig.otherForeignCount;
    if (titleForeign >= 2 && tSig.srCount === 0 && !tSig.hasSerbianDiacritics) {
      return false;
    }
    if (titleForeign >= 3 && titleForeign > tSig.srCount * 2) {
      return false;
    }
  }

  // 2) Provera opisa (snippet-a), ako postoji: česti slučaj kod tech fidova gde je naslov samo ime proizvoda ("Windows 11 24H2"), a opis na engleskom
  if (sSig.wordCount >= 4 && !sSig.hasCyrillic) {
    const snippetForeign = sSig.enCount + sSig.otherForeignCount;
    if (snippetForeign >= 2 && sSig.srCount === 0 && !sSig.hasSerbianDiacritics) {
      return false;
    }
    if (snippetForeign >= 3 && snippetForeign > sSig.srCount * 2) {
      return false;
    }
  }

  // 3) Kombinovana provera naslova + opisa za kraće fraze
  if (!tSig.hasCyrillic && !sSig.hasCyrillic) {
    const totalForeign =
      tSig.enCount + tSig.otherForeignCount + sSig.enCount + sSig.otherForeignCount;
    const totalSr = tSig.srCount + sSig.srCount;
    if (
      totalForeign >= 3 &&
      totalSr === 0 &&
      !tSig.hasSerbianDiacritics &&
      !sSig.hasSerbianDiacritics
    ) {
      return false;
    }
  }

  return true;
}

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
 * Strogi filter za odbacivanje stranih jezika, klikbejta, tabloidnog, rijaliti, domaćinstvo/buđ i lajfstajl šuma pre upisa u bazu.
 * Vraća razlog odbacivanja (string) ako stavku treba odbaciti, ili `null` ako je vest relevantna.
 */
export function detectNoiseReason(input: NoiseCheckInput): string | null {
  // 0. Jezički filter (srpski / regionalni jezik)
  if (!isSerbianOrRegionalLanguage(input.title, input.snippet)) {
    return 'lang:non-serbian';
  }

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

  // 3. Održiva crna lista klikbejt obrazaca
  const combinedNorm = normalizeForComparison(`${input.title} ${input.snippet ?? ''}`);
  for (const cbRe of CLICKBAIT_BLOCKLIST) {
    if (cbRe.test(combinedNorm)) {
      return 'clickbait';
    }
  }

  // 4. Ključne reči tabloidnog, rijaliti, domaćinstvo/buđ i lajfstajl šuma
  for (const rule of NOISE_TEXT_PATTERNS) {
    if (rule.re.test(combinedNorm)) {
      return rule.reason;
    }
  }

  return null;
}

