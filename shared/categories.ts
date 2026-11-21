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

export function isCanonicalCategory(value: string | null | undefined): value is CategoryName {
  return typeof value === 'string' && CANONICAL_SET.has(value);
}

/**
 * Zajednički klasifikator vesti u 10 kanonskih kategorija (koriste ga i ingest worker i frontend).
 * Podržava srpsku ćirilicu, punu latinicu i ošišanu latinicu sa prefiksnim korenima reči.
 */
export function classifyNewsCategory(
  title: string,
  summary: string = '',
  sourceGroup?: string,
  defaultCat: string = 'Društvo'
): CategoryName {
  const text = ` ${toLowerLatin(title)} ${toLowerLatin(summary)} `;
  const hasStem = (pattern: RegExp) => pattern.test(text);

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(fudbal|košark|kosark|tenis|đoković|djokovic|jokić|jokic|crvena zvezda|zvezd[aeiu]|partizan|bešiktaš|besiktas|utakmic|liga šampiona|liga sampiona|evrolig|olimpijsk|reprezentacij|sport|trener|golman|odbojk|rukomet|vaterpol|atletik|premijer lig|bundeslig|šampionat|sampionat|turnir|četvrtfinal|cetvrtfinal|polufinal|final[eu]|produžetk|produzetk|evrobasket|mundijal|fifa|uefa|derbi)/i
    )
  ) {
    return 'Sport';
  }

  if (
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(vremensk[aeiuo]|prognoza vremena|rhmz|meteoalarm|kiš[aeiu]|kis[aeiu]|sneg|oluj[aeiu]|hladno|toplo|meteo|pljuskov|nepogod|mraz|košav|kosav|maksimalna temperatura|jutarnja temperatura)/i
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
      /(?:^|[^a-zčćžšđ0-9])(ekonomij|biznis|finansij|nbs|narodn[ae] bank|devizn|inflacij|kredit|kamatn|bank[aeiu]|akcij[aeu]|berz[aeiu]|volstrit|wall street|kurs dinara|cena goriva|cene goriva|goriv[oa]|bdp|investic|porez|poresk|privred|zarad[aeiu]|plat[aeiu]|penzij|budžet|budzet|kompanij|tržišt|trzist|izvoz|uvoz)/i
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
    sourceGroup === 'it_tech' ||
    hasStem(
      /(?:^|[^a-zčćžšđ0-9])(ai|veštačk[aeiu] inteligenc|vestack[aeiu] inteligenc|tehnolog|softver|aplikacij|startap|apple|google|microsoft|openai|čipov|cipov|mikročip|mikrocip|cyber|sajber|it sektor|robot|algoritm)/i
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
      /(?:^|[^a-zčćžšđ0-9])(politik|političk|politick|skupštin|skupstin|poslanic|poslaničk|poslanick|vlad[aeiu] srbije|predsednik|predsednič|predsednic|izbor[aeiu]|izborn|rik|ministar|ministr|strank[aeiu]|opozicij|koalicij|ustav|ambasador|glasanje|mandat|premijer|diplomatij|sankcij)/i
    )
  ) {
    return 'Politika';
  }

  if (isCanonicalCategory(defaultCat)) {
    return defaultCat;
  }
  return 'Društvo';
}
