export const CANONICAL_CATEGORIES = [
  'Politika',
  'Društvo',
  'Biznis i Finansije',
  'Hronika',
  'Region',
  'Svet',
  'Tehnologija',
  'Kultura',
  'Sport',
  'Vreme',
] as const;

export type CategoryName = (typeof CANONICAL_CATEGORIES)[number];

export const CATEGORY_SLUGS: Record<CategoryName, string> = {
  Politika: 'politika',
  Društvo: 'drustvo',
  'Biznis i Finansije': 'biznis-i-finansije',
  Hronika: 'hronika',
  Region: 'region',
  Svet: 'svet',
  Tehnologija: 'tehnologija',
  Kultura: 'kultura',
  Sport: 'sport',
  Vreme: 'vreme',
};

export function categoryToSlug(category: CategoryName): string {
  return CATEGORY_SLUGS[category];
}

export interface ClassifyHints {
  url?: string | null;
  rssCategories?: string[];
  sourceGroup?: string;
}

const CANONICAL_SET = new Set<string>(CANONICAL_CATEGORIES);

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

function toLowerLatin(input: string): string {
  const low = input.toLowerCase();
  let out = '';
  for (let i = 0; i < low.length; i += 1) {
    const ch = low[i];
    out += CYR_TO_LAT[ch] ?? ch;
  }
  return out;
}

function toAsciiFolded(input: string): string {
  return toLowerLatin(input)
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isCanonicalCategory(value: string | null | undefined): value is CategoryName {
  return typeof value === 'string' && CANONICAL_SET.has(value);
}

const URL_SEGMENT_TO_CATEGORY: Array<{ pattern: RegExp; category: CategoryName }> = [
  { pattern: /^\/(?:[^/]+\/)*(?:sport|fudbal|kosarka|tenis|odbojka|rukomet|vaterpolo|atletika)(?:\/|$)/i, category: 'Sport' },
  { pattern: /^\/(?:[^/]+\/)*(?:vreme|vremenska-prognoza|meteo)(?:\/|$)/i, category: 'Vreme' },
  { pattern: /^\/(?:[^/]+\/)*(?:hronika|crna-hronika)(?:\/|$)/i, category: 'Hronika' },
  { pattern: /^\/(?:[^/]+\/)*(?:kultura|umetnost|pozoriste|knjizevnost|film|muzika)(?:\/|$)/i, category: 'Kultura' },
  { pattern: /^\/(?:[^/]+\/)*(?:biznis|ekonomija|finansije|privreda|novac|trziste|berza)(?:\/|$)/i, category: 'Biznis i Finansije' },
  { pattern: /^\/(?:[^/]+\/)*(?:tehnologija|tech|it|digital|startapi|ai|nauka-i-tehnologija)(?:\/|$)/i, category: 'Tehnologija' },
  { pattern: /^\/(?:[^/]+\/)*(?:region|regija|balkan|bih|hrvatska|crna-gora)(?:\/|$)/i, category: 'Region' },
  { pattern: /^\/(?:[^/]+\/)*(?:svet|svijet|planeta|globus|world)(?:\/|$)/i, category: 'Svet' },
  { pattern: /^\/(?:[^/]+\/)*politika(?:\/|$)/i, category: 'Politika' },
  { pattern: /^\/(?:[^/]+\/)*(?:drustvo|beograd|saobracaj)(?:\/|$)/i, category: 'Društvo' },
];

const RSS_CATEGORY_TO_CANONICAL: Record<string, CategoryName> = {
  sport: 'Sport',
  fudbal: 'Sport',
  kosarka: 'Sport',
  tenis: 'Sport',
  odbojka: 'Sport',
  rukomet: 'Sport',
  vaterpolo: 'Sport',
  atletika: 'Sport',
  vreme: 'Vreme',
  'vremenska prognoza': 'Vreme',
  meteo: 'Vreme',
  hronika: 'Hronika',
  'crna hronika': 'Hronika',
  kultura: 'Kultura',
  umetnost: 'Kultura',
  film: 'Kultura',
  muzika: 'Kultura',
  pozoriste: 'Kultura',
  knjizevnost: 'Kultura',
  biznis: 'Biznis i Finansije',
  ekonomija: 'Biznis i Finansije',
  finansije: 'Biznis i Finansije',
  privreda: 'Biznis i Finansije',
  'biznis i finansije': 'Biznis i Finansije',
  'ekonomija i biznis': 'Biznis i Finansije',
  trziste: 'Biznis i Finansije',
  berza: 'Biznis i Finansije',
  tehnologija: 'Tehnologija',
  tech: 'Tehnologija',
  it: 'Tehnologija',
  ai: 'Tehnologija',
  startapi: 'Tehnologija',
  digital: 'Tehnologija',
  'nauka i tehnologija': 'Tehnologija',
  region: 'Region',
  regija: 'Region',
  balkan: 'Region',
  bih: 'Region',
  hrvatska: 'Region',
  'crna gora': 'Region',
  slovenija: 'Region',
  svet: 'Svet',
  svijet: 'Svet',
  planeta: 'Svet',
  globus: 'Svet',
  world: 'Svet',
  politika: 'Politika',
  drustvo: 'Društvo',
  beograd: 'Društvo',
  saobracaj: 'Društvo',
};

export function classifyFromUrlPath(url: string | null | undefined): CategoryName | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = toAsciiFolded(new URL(url).pathname);
  } catch {
    pathname = toAsciiFolded(url);
  }

  for (const rule of URL_SEGMENT_TO_CATEGORY) {
    if (rule.pattern.test(pathname)) {
      return rule.category;
    }
  }
  return null;
}

export function classifyFromRssCategories(
  rssCategories: string[] | undefined
): CategoryName | null {
  if (!Array.isArray(rssCategories) || rssCategories.length === 0) return null;

  for (const raw of rssCategories) {
    const clean = toAsciiFolded(raw).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!clean) continue;
    const direct = RSS_CATEGORY_TO_CANONICAL[clean];
    if (direct) return direct;
  }
  return null;
}

/**
 * Zajednički klasifikator vesti u 10 kanonskih kategorija (koriste ga i ingest worker i frontend).
 * Prioritet:
 * 1. URL putanja (npr. /sport/, /biznis/, /politika/, /hronika/...)
 * 2. RSS <category> tagovi
 * 3. Srpski prefiksni koreni reči u naslovu i uvodu (ćirilica i latinica)
 * 4. Podrazumevana kategorija izvora (`defaultCat`)
 */
export function classifyNewsCategory(
  title: string,
  summary: string = '',
  sourceGroupOrHints?: string | ClassifyHints,
  defaultCat: string = 'Društvo'
): CategoryName {
  const hints: ClassifyHints =
    typeof sourceGroupOrHints === 'string'
      ? { sourceGroup: sourceGroupOrHints }
      : sourceGroupOrHints ?? {};

  // 1. Primarni signal: URL putanja
  const fromUrl = classifyFromUrlPath(hints.url);
  if (fromUrl) {
    return fromUrl;
  }

  // 2. Sekundarni signal: RSS <category> tagovi
  const fromRss = classifyFromRssCategories(hints.rssCategories);
  if (fromRss) {
    return fromRss;
  }

  // 3. Klasifikacija po rečima (bez okidanja na puka lična imena)
  const text = ` ${toLowerLatin(title)} ${toLowerLatin(summary)} `;
  const hasStem = (pattern: RegExp) => pattern.test(text);

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(fudbal|košark|kosark|tenis|atp|wta|masters|grend slem|grand slam|vimbldon|rolan garos|us open|australijan open|đoković|djokovic|zverev|siner|sinner|alkaraz|alcaraz|medvedev|nadal|jokić|jokic|crvena zvezda|zvezd[aeiu]|partizan|bešiktaš|besiktas|utakmic|liga šampiona|liga sampiona|evrolig|aba lig|nba|olimpijsk|reprezentacij|sport|trener|selektor|golman|odbojk|rukomet|vaterpol|atletik|premijer lig|bundeslig|la lig|serij[aeu] a|šampionat|sampionat|turnir|četvrtfinal|cetvrtfinal|polufinal|finalist|final[eu](?:[^a-zčćžšđ]|$)|produžetk|produzetk|evrobasket|mundijal|fifa|uefa|derbi|trofej|stadion|penal[a-z]*|setovim)/i
    )
  ) {
    return 'Sport';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(vremensk[aeiuo]|prognoza vremena|rhmz|meteoalarm|kiš[aeiu]|kis[aeiu]|sneg|oluj[aeiu]|hladno|toplo vreme|meteo|pljuskov|nepogod|mraz|košav|kosav|maksimalna temperatura|jutarnja temperatura)/i
    )
  ) {
    return 'Vreme';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(uhapšen|uhapsen|policij|nesreć|nesrec|sudar|požar|pozar|ubistv|ubijen|tužilaštv|tuzilastv|pritvor|hronik|zaplen|ranjen|optužnic|optuznic|suđenj|sudjenj|mup|kriminal|pljačk|pljack|saobraćajn[aeiu] nesreć|saobracajn[aeiu] nesrec|istrag[aeiu]|osumnjičen|osumnjicen)/i
    )
  ) {
    return 'Hronika';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(kultur|pozorišt|pozorist|izložb|izlozb|koncert|muzej|knjig|književn|knjizevn|filmsk|festival|glumac|glumic|oper[aeiu]|bioskop|filharmonij|slikar|umetnik|umetnost|premijer[aeiu] predstave)/i
    )
  ) {
    return 'Kultura';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(ekonomij|biznis|finansij|nbs|narodn[ae] bank|devizn|inflacij|kredit|kamatn|bank[aeiu](?:[^a-zčćžšđ]|$)|berz[aeiu]|volstrit|wall street|kurs dinara|cena goriva|cene goriva|goriv[oa]|bdp|investic|porez|poresk|privred|prosečn[aeiu] plat|prosecn[aeiu] plat|minimaln[aeiu] plat|minimaln[aeiu] zarad|prosečn[aeiu] zarad|prosecn[aeiu] zarad|penzij|budžet|budzet|kompanij|tržišt|trzist|izvoz|uvoz|akcij[aeu]\s+(?:kompanij|bank|na berz)|cen[aeu]\s+akcij|trgovanj[a-z]*\s+akcij)/i
    )
  ) {
    return 'Biznis i Finansije';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(amss|beoinfo|gazel[aiu]|brankov[a-z]* most|autokomand|e-?uprav|javn[aeiu] uprav|gradsk[iog] prevoz|gsp|škol[aeiu]|skol[aeiu]|univerzitet|bolnic|kliničk[iog] centr|klinick[iog] centr|dom zdravlja|zdravstv)/i
    )
  ) {
    return 'Društvo';
  }

  if (
    hints.sourceGroup === 'it_tech' ||
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(ai(?:[^a-zčćžšđ]|$)|veštačk[aeiu] inteligenc|vestack[aeiu] inteligenc|tehnolog|softver|aplikacij|startap|apple|google|microsoft|openai|čipov|cipov|mikročip|mikrocip|cyber|sajber|it sektor|robot|algoritm)/i
    )
  ) {
    return 'Tehnologija';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(hrvatsk|zagreb|crn[aeiuo] gor|podgoric|bosn[aeiu]|sarajev|banjaluk|republik[aeiu] srpsk|slovenij|ljubljan|severn[aeiuo] makedonij|skoplj|region[au]|zapadn[iog] balkan)/i
    )
  ) {
    return 'Region';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(vašington|vasington|brisel|moskv|peking|tramp|trump|putin|makron|macron|blisk[iog] istok|ujedinjen[eih] nacij|nato|pentagon|evropsk[aeiu] unij|bel[ae] kuć|bel[ae] kuc|kremlj|bundestag|ukrajin|izrael|pojas[a-z]* gaz[aeiu]|iran|bliskoistočn|bliskoistocn)/i
    )
  ) {
    return 'Svet';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(politik|političk|politick|skupštin|skupstin|poslanic|poslaničk|poslanick|vlad[aeiu] srbije|predsednik|predsednič|predsednic|izbor[aeiu]|izborn|rik(?:[^a-zčćžšđ]|$)|ministar|ministr|strank[aeiu]|opozicij|koalicij|ustav|ambasador|glasanje|mandat|premijer(?!\w*\s+lig)|diplomatij|sankcij)/i
    )
  ) {
    return 'Politika';
  }

  if (isCanonicalCategory(defaultCat)) {
    return defaultCat;
  }
  return 'Društvo';
}
