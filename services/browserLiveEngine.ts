import {
  UserPreferences,
  NewsReport,
  StreetRouteGeometry,
  ScrapedArticle,
  SourceGroupId,
  WeatherSummary,
} from '../types';
import {
  buildThreePointServiceRadar,
  getLiveServiceFeedMeta,
  refreshLiveServiceFeed,
  resolveBelgradeLocation,
} from './serviceRadarEngine';
import {
  buildArticleBriefingScript,
  fetchStaticNewsFeed,
  readCachedStaticFeed,
  readCachedWeather,
  readListenedArticleMap,
  saveCachedBriefingPackage,
  saveCachedWeather,
  sortArticlesForFeed,
} from './newsFeedClient';
import { classifyNewsCategory } from '../shared/categories';
export { classifyNewsCategory };

function ensureSpecificArticleUrl(rawUrl: string, title: string, sourceName: string): string {
  const trimmed = (rawUrl || '').trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname.length > 3) {
      return trimmed;
    }
  } catch {
    // fallback below
  }
  const cleanSource = sourceName.replace(/\s*\(\+\d+\s*medija\)/i, '').trim();
  return `https://news.google.com/search?q=${encodeURIComponent(
    `${title} ${cleanSource}`
  )}&hl=sr&gl=RS&ceid=RS%3Asr`;
}

export const INITIAL_SNAPSHOT_ARTICLES: ScrapedArticle[] = [
  // 1. POLITIKA
  {
    id: 'snap-pol-1',
    title: 'RIK doneo rešenja o dodeli mandata novim narodnim poslanicima u Skupštini Srbije',
    sourceName: 'RTS (+14 medija)',
    sourceGroup: 'domaci_info',
    category: 'Politika',
    summary: 'Republička izborna komisija usvojila je rešenja o popunjavanju poslaničkih mesta u skladu sa zakonskim rokovima.',
    url: ensureSpecificArticleUrl(
      '',
      'RIK doneo rešenja o dodeli mandata novim narodnim poslanicima',
      'RTS'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 15,
    relatedSources: ['RTS', 'N1', 'Tanjug', 'Danas', 'Blic', 'Politika', 'RTV', '021.rs', 'Nova.rs', 'B92', 'Kurir', 'Euronews', 'Beta', 'Fonet', 'Insajder'],
    importanceScore: 99,
    isBreakingCluster: true,
  },
  {
    id: 'snap-pol-2',
    title: 'Vanredna sednica Vlade Srbije o ključnim infrastrukturnim i energetskim sporazumima',
    sourceName: 'Tanjug (+11 medija)',
    sourceGroup: 'domaci_info',
    category: 'Politika',
    summary: 'Ministarstva su usaglasila predloge zakona i međunarodnih ugovora koji ulaze u skupštinsku proceduru ove nedelje.',
    url: ensureSpecificArticleUrl(
      '',
      'Sednica Vlade Srbije o infrastrukturnim i energetskim sporazumima',
      'Tanjug'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 12,
    relatedSources: ['Tanjug', 'RTS', 'Politika', 'Blic', 'Euronews', 'N1', 'Danas', 'RTV', 'B92', 'Novosti', 'Kurir', 'Beta'],
    importanceScore: 94,
    isBreakingCluster: true,
  },
  // 2. DRUŠTVO
  {
    id: 'snap-dru-1',
    title: 'AMSS i Beoinfo: Pojačan intenzitet saobraćaja na Gazeli, Brankovom mostu i Autokomandi',
    sourceName: 'RTS (+13 medija)',
    sourceGroup: 'saobracaj_servisi',
    category: 'Društvo',
    summary: 'Vozačima se savetuje oprez zbog zadržavanja na prilazima beogradskim mostovima i glavnim gradskim saobraćajnicama.',
    url: ensureSpecificArticleUrl(
      '',
      'AMSS Beoinfo Pojačan intenzitet saobraćaja na Gazeli Brankovom mostu',
      'RTS'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 14,
    relatedSources: ['RTS', 'AMSS', 'Beoinfo', 'Tanjug', 'N1', 'Blic', 'Nova.rs', 'Danas', 'B92', 'Kurir', 'Telegraf', 'Mondo', '021.rs', 'Studio B'],
    importanceScore: 96,
    isBreakingCluster: true,
  },
  {
    id: 'snap-dru-2',
    title: 'Nove elektronske usluge eUprave dostupne građanima bez odlaska na šaltere u svim opštinama',
    sourceName: 'Danas (+9 medija)',
    sourceGroup: 'domaci_info',
    category: 'Društvo',
    summary: 'Modernizacija javne uprave omogućava brže izdavanje izvoda, uverenja i prijava za građane širom Srbije.',
    url: ensureSpecificArticleUrl(
      '',
      'Nove elektronske usluge eUprave dostupne građanima bez odlaska na šaltere',
      'Danas'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 10,
    relatedSources: ['Danas', 'RTS', 'Nova.rs', '021.rs', 'N1', 'Tanjug', 'Blic', 'Politika', 'Euronews', 'RTV'],
    importanceScore: 89,
    isBreakingCluster: true,
  },
  // 3. BIZNIS I FINANSIJE
  {
    id: 'snap-biz-1',
    title: 'Brutalna rasprodaja akcija kompanija povezanih s veštačkom inteligencijom uzdrmala Volstrit i evropske berze',
    sourceName: 'BizLife (+12 medija)',
    sourceGroup: 'domaci_info',
    category: 'Biznis i Finansije',
    summary: 'Investitori preispituju valuacije velikih tehnoloških giganata nakon najnovijih kvartalnih izveštaja i rasta prinosa.',
    url: ensureSpecificArticleUrl(
      '',
      'Brutalna rasprodaja akcija kompanija povezanih s veštačkom inteligencijom uzdrmala Volstrit',
      'BizLife'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 13,
    relatedSources: ['BizLife', 'N1', 'RTS', 'Tanjug', 'B92', 'Blic', 'Danas', 'Politika', 'Bloomberg Adria', 'Forbes Srbija', 'Nova Ekonomija', 'Kamatica', 'Euronews'],
    importanceScore: 97,
    isBreakingCluster: true,
  },
  {
    id: 'snap-biz-2',
    title: 'NBS: Devizne rezerve na rekordnom nivou, kurs dinara i cene goriva na pumpama stabilni',
    sourceName: 'N1 (+10 medija)',
    sourceGroup: 'domaci_info',
    category: 'Biznis i Finansije',
    summary: 'Narodna banka Srbije saopštila je da finansijski sistem funkcioniše stabilno uz nepromenjene maloprodajne cene derivata.',
    url: ensureSpecificArticleUrl(
      '',
      'NBS Devizne rezerve na rekordnom nivou kurs dinara stabilan',
      'N1'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 11,
    relatedSources: ['N1', 'RTS', 'Tanjug', 'Blic', 'BizPortal', 'Danas', 'Politika', 'Bloomberg Adria', 'B92', 'RTV', '021.rs'],
    importanceScore: 92,
    isBreakingCluster: true,
  },
  // 4. HRONIKA
  {
    id: 'snap-hro-1',
    title: 'MUP Srbije: Velika akcija pojačane kontrole brzine i bezbednosti saobraćaja na svim magistralnim pravcima',
    sourceName: 'Tanjug (+11 medija)',
    sourceGroup: 'domaci_info',
    category: 'Hronika',
    summary: 'Saobraćajna policija sprovodi međunarodnu akciju kontrole radarskim uređajima i presretačima na prilazima gradovima.',
    url: ensureSpecificArticleUrl(
      '',
      'MUP Srbije pojačana kontrola brzine i bezbednosti saobraćaja',
      'Tanjug'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 12,
    relatedSources: ['Tanjug', 'RTS', 'Blic', 'N1', 'Nova.rs', 'Kurir', 'Politika', 'Danas', 'B92', 'Telegraf', '021.rs', 'RTV'],
    importanceScore: 93,
    isBreakingCluster: true,
  },
  {
    id: 'snap-hro-2',
    title: 'Tužilaštvo za visokotehnološki kriminal upozorilo građane na novu talas SMS i fišing prevara u platnom prometu',
    sourceName: 'RTS (+8 medija)',
    sourceGroup: 'domaci_info',
    category: 'Hronika',
    summary: 'Nadležni organi apeluju na građane da ne unose podatke sa platnih kartica na sumnjivim linkovima za dostavu pošiljki.',
    url: ensureSpecificArticleUrl(
      '',
      'Tužilaštvo za visokotehnološki kriminal upozorilo građane na SMS prevare',
      'RTS'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 9,
    relatedSources: ['RTS', 'N1', 'Danas', 'Blic', 'Nova.rs', 'Tanjug', '021.rs', 'Politika', 'B92'],
    importanceScore: 87,
    isBreakingCluster: true,
  },
  // 5. REGION
  {
    id: 'snap-reg-1',
    title: 'Novi režim integrisanih graničnih prelaza u regionu skraćuje čekanje teretnih i putničkih vozila za trećinu',
    sourceName: 'RTS (+10 medija)',
    sourceGroup: 'domaci_info',
    category: 'Region',
    summary: 'Zajedničke kontrole na prelazima u regionu Zapadnog Balkana ubrzale su protok putnika i robe.',
    url: ensureSpecificArticleUrl(
      '',
      'Novi režim integrisanih graničnih prelaza u regionu skraćuje čekanje vozila',
      'RTS'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 11,
    relatedSources: ['RTS', 'Tanjug', 'Al Jazeera', 'N1', 'Danas', 'Blic', 'Politika', 'RTV', 'Vijesti', 'Index.hr', 'Klix.ba'],
    importanceScore: 90,
    isBreakingCluster: true,
  },
  {
    id: 'snap-reg-2',
    title: 'Regionalni energetski forum u Beogradu i Zagrebu: Zajednička ulaganja u prenosnu mrežu i skladišta gasa',
    sourceName: 'N1 (+7 medija)',
    sourceGroup: 'domaci_info',
    category: 'Region',
    summary: 'Ministri energetike zemalja regiona dogovorili su koordinisane mere za stabilnost snabdevanja tokom sezone.',
    url: ensureSpecificArticleUrl(
      '',
      'Regionalni energetski forum zajednička ulaganja u prenosnu mrežu',
      'N1'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 8,
    relatedSources: ['N1', 'RTS', 'Tanjug', 'Bloomberg Adria', 'Al Jazeera', 'Danas', 'HRT', 'RTV'],
    importanceScore: 84,
    isBreakingCluster: true,
  },
  // 6. SVET
  {
    id: 'snap-sve-1',
    title: 'Brisel i Vašington najavili novi sporazum o regulaciji globalne trgovine, carina i energetske bezbednosti',
    sourceName: 'N1 (+11 medija)',
    sourceGroup: 'domaci_info',
    category: 'Svet',
    summary: 'Lideri Evropske unije i SAD razmatraju zajedničke mere za stabilizaciju globalnih lanaca snabdevanja.',
    url: ensureSpecificArticleUrl(
      '',
      'Brisel i Vašington novi okvir za regulaciju globalne trgovine',
      'N1'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 12,
    relatedSources: ['N1', 'RTS', 'Danas', 'BBC', 'Euronews', 'Tanjug', 'Politika', 'Blic', 'Al Jazeera', 'RSE', 'DW', 'Nova.rs'],
    importanceScore: 91,
    isBreakingCluster: true,
  },
  {
    id: 'snap-sve-2',
    title: 'Samit u Ženevi: Diplomatska inicijativa Ujedinjenih nacija za deeskalaciju globalnih geopolitičkih tenzija',
    sourceName: 'RTS (+8 medija)',
    sourceGroup: 'domaci_info',
    category: 'Svet',
    summary: 'Generalni sekretar UN pozvao je vodeće svetske sile na hitan nastavak pregovora o bezbednosnim garancijama.',
    url: ensureSpecificArticleUrl(
      '',
      'Samit u Ženevi diplomatska inicijativa Ujedinjenih nacija',
      'RTS'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 9,
    relatedSources: ['RTS', 'Tanjug', 'Politika', 'N1', 'Danas', 'BBC', 'Euronews', 'Blic', 'RTV'],
    importanceScore: 86,
    isBreakingCluster: true,
  },
  // 7. TEHNOLOGIJA
  {
    id: 'snap-teh-1',
    title: 'Novi talas AI agenata i glasovnih kopilota za automobile menja iskustvo vožnje u 2026.',
    sourceName: 'TechCrunch (+8 medija)',
    sourceGroup: 'it_tech',
    category: 'Tehnologija',
    summary: 'Integracija multimodalnih modela u automobilski kokpit donosi personalizovane audio brifinge u realnom vremenu.',
    url: ensureSpecificArticleUrl(
      '',
      'AI voice copilot automotive in-car assistant 2026',
      'TechCrunch'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 9,
    relatedSources: ['TechCrunch', 'The Verge', 'Startit', 'Netokracija', 'Benchmark', 'PC Press', 'B92 Tehnopolis', 'SmartLife', 'RTS'],
    importanceScore: 88,
    isBreakingCluster: true,
  },
  {
    id: 'snap-teh-2',
    title: 'Evropska unija i vodeće IT kompanije uvode nove standarde za bezbednost čipova i AI modela',
    sourceName: 'Startit (+6 medija)',
    sourceGroup: 'it_tech',
    category: 'Tehnologija',
    summary: 'Novi tehnički protokoli donose veću zaštitu privatnosti korisnika na mobilnim uređajima i u klaud servisima.',
    url: ensureSpecificArticleUrl(
      '',
      'Evropska unija IT kompanije novi standardi bezbednost AI modela',
      'Startit'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 7,
    relatedSources: ['Startit', 'Netokracija', 'TechCrunch', 'The Verge', 'Benchmark', 'Danas', 'N1'],
    importanceScore: 83,
    isBreakingCluster: true,
  },
  // 8. KULTURA
  {
    id: 'snap-kul-1',
    title: 'Velika jesenja izložba i premijere u Narodnom pozorištu i Muzeju savremene umetnosti u Beogradu',
    sourceName: 'Danas (+7 medija)',
    sourceGroup: 'domaci_info',
    category: 'Kultura',
    summary: 'Kulturne institucije u Beogradu najavile su bogat repertoar predstava, koncerata i retrospektivnih izložbi.',
    url: ensureSpecificArticleUrl(
      '',
      'Izložba i premijere u Narodnom pozorištu i Muzeju savremene umetnosti u Beogradu',
      'Danas'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 8,
    relatedSources: ['Danas', 'RTS', 'Politika', 'N1', 'Nova.rs', 'Blic', 'Tanjug', 'Seecult'],
    importanceScore: 85,
    isBreakingCluster: true,
  },
  {
    id: 'snap-kul-2',
    title: 'Beogradska filharmonija i Kolarac najavili seriju gala koncerata sa gostujućim dirigentima iz Evrope',
    sourceName: 'Politika (+5 medija)',
    sourceGroup: 'domaci_info',
    category: 'Kultura',
    summary: 'Ulaznice za novi ciklus simfonijskih koncerata izazvale su rekordno interesovanje beogradske publike.',
    url: ensureSpecificArticleUrl(
      '',
      'Beogradska filharmonija i Kolarac gala koncerti',
      'Politika'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 6,
    relatedSources: ['Politika', 'RTS', 'Danas', 'Tanjug', 'Blic', 'Nova.rs'],
    importanceScore: 80,
    isBreakingCluster: true,
  },
  // 9. SPORT
  {
    id: 'snap-spo-1',
    title: 'Evroliga i reprezentativni nastupi: Večiti rivali pred ključnim evropskim duelima u prepunoj Areni',
    sourceName: 'Nova.rs (+12 medija)',
    sourceGroup: 'domaci_info',
    category: 'Sport',
    summary: 'Košarkaši Partizana i Crvene zvezde nastavljaju borbu za vrh tabele Evrolige uz ogromno interesovanje navijača.',
    url: ensureSpecificArticleUrl(
      '',
      'Evroliga košarkaši Partizana i Crvene zvezde evropski dueli',
      'Nova.rs'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 13,
    relatedSources: ['Nova.rs', 'SportKlub', 'Danas', 'RTS', 'B92', 'Mozzart Sport', 'Blic Sport', 'Kurir', 'Telegraf', 'Mondo', 'N1', 'Tanjug', 'Arena Sport'],
    importanceScore: 94,
    isBreakingCluster: true,
  },
  {
    id: 'snap-spo-2',
    title: 'Nikola Jokić i Novak Đoković ponovo u centru pažnje svetskih sportskih medija nakon novih rekorda',
    sourceName: 'RTS (+10 medija)',
    sourceGroup: 'domaci_info',
    category: 'Sport',
    summary: 'Srpski asovi nastavljaju dominaciju na međunarodnoj sceni uz pohvale vodećih svetskih analitičara.',
    url: ensureSpecificArticleUrl(
      '',
      'Nikola Jokić i Novak Đoković novi rekordi',
      'RTS'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 11,
    relatedSources: ['RTS', 'SportKlub', 'B92', 'Mozzart Sport', 'Blic', 'Nova.rs', 'Danas', 'Tanjug', 'N1', 'Mondo', 'Kurir'],
    importanceScore: 90,
    isBreakingCluster: true,
  },
  // 10. VREME
  {
    id: 'snap-vre-1',
    title: 'RHMZ najnovija prognoza i meteo-upozorenje: Smena sunčanih intervala i pojačanog vetra u košavskom području',
    sourceName: 'RTS (+8 medija)',
    sourceGroup: 'domaci_info',
    category: 'Vreme',
    summary: 'Republički hidrometeorološki zavod objavio je detaljnu prognozu po satima za Beograd i sve regione Srbije.',
    url: ensureSpecificArticleUrl(
      '',
      'RHMZ prognoza vremena Beograd Srbija košava temperatura',
      'RTS'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 9,
    relatedSources: ['RTS', 'Tanjug', 'Danas', 'Blic', 'N1', 'Nova.rs', 'B92', '021.rs', 'RTV'],
    importanceScore: 84,
    isBreakingCluster: true,
  },
  {
    id: 'snap-vre-2',
    title: 'Izgledi vremena za narednih sedam dana: Stabilizacija atmosfere i prijatne dnevne temperature za ovo doba godine',
    sourceName: 'Tanjug (+5 medija)',
    sourceGroup: 'domaci_info',
    category: 'Vreme',
    summary: 'Meteorolozi najavljuju povoljne biometeorološke prilike i dobru vidljivost na svim putnim pravcima.',
    url: ensureSpecificArticleUrl(
      '',
      'Izgledi vremena za narednih sedam dana RHMZ Srbija',
      'Tanjug'
    ),
    publishedAt: 'Danas',
    selected: true,
    mediaCount: 6,
    relatedSources: ['Tanjug', 'RTS', 'Blic', 'Danas', 'Politika', 'Euronews'],
    importanceScore: 78,
    isBreakingCluster: false,
  },
];

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Đ', Е: 'E', Ж: 'Ž', З: 'Z', И: 'I',
  Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', Ћ: 'Ć', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'Č', Џ: 'Dž', Ш: 'Š',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

export function cyrillicToLatin(text: string): string {
  return text.replace(/[А-Яа-яЂђЖжЗзЉљЊњЋћЧчЏџШшЈј]/g, (ch) => CYRILLIC_TO_LATIN_MAP[ch] || ch);
}

const osrmRouteCache = new Map<string, StreetRouteGeometry>();

export async function scrapeNewsInBrowser(
  _sourceGroups: SourceGroupId[],
  forceRefresh = false
): Promise<{
  articles: ScrapedArticle[];
  lastSyncedAt: string;
  fromCache: boolean;
  isOfflineFallback?: boolean;
}> {
  const live = await fetchStaticNewsFeed({ forceRefresh });
  if (live && live.articles.length > 0) {
    return {
      articles: live.articles,
      lastSyncedAt: live.lastSyncedAt,
      fromCache: live.fromCache,
      isOfflineFallback: live.isOfflineFallback,
    };
  }

  const cached = readCachedStaticFeed();
  if (cached && cached.articles.length > 0) {
    return {
      articles: cached.articles,
      lastSyncedAt: cached.lastSyncedAt,
      fromCache: true,
      isOfflineFallback: true,
    };
  }

  return {
    articles: INITIAL_SNAPSHOT_ARTICLES,
    lastSyncedAt: 'offline snimak',
    fromCache: true,
    isOfflineFallback: true,
  };
}

export async function fetchWeatherInBrowser(lat = 44.8176, lng = 20.4633): Promise<WeatherSummary> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,wind_speed_10m,weather_code,precipitation&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    const cur = data?.current || {};
    const tempC = typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : 16;
    const windKmh = typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : 11;
    const code = Number(cur.weather_code ?? 1);
    let condition = 'Umereno oblačno';
    let roadCondition = 'Suvi kolovozi, dobra vidljivost na svim pravcima';
    if (code === 0) condition = 'Vedro i sunčano';
    else if (code >= 51) {
      condition = 'Kiša i mestimični pljuskovi';
      roadCondition = 'Mokri kolovozi, prilagodite brzinu uslovima na putu';
    }
    const summary: WeatherSummary = { condition, tempC, windKmh, roadCondition };
    saveCachedWeather(summary);
    return summary;
  } catch {
    const cached = readCachedWeather();
    if (cached) {
      return cached;
    }
    return {
      condition: 'Umereno oblačno',
      tempC: 16,
      windKmh: 11,
      roadCondition: 'Suvi kolovozi, dobra vidljivost',
    };
  }
}

export async function fetchStreetRouteInBrowser(
  startCoords: { lat: number; lng: number },
  endCoords: { lat: number; lng: number }
): Promise<StreetRouteGeometry> {
  const cacheKey = `${startCoords.lat.toFixed(4)},${startCoords.lng.toFixed(4)}->${endCoords.lat.toFixed(4)},${endCoords.lng.toFixed(4)}`;
  const cached = osrmRouteCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(osrmUrl);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (route?.geometry?.coordinates) {
      const steps = route?.legs?.[0]?.steps || [];
      const streetNames = Array.from(
        new Set<string>(
          steps
            .map((s: any) => String(s?.name || '').trim())
            .filter((n: string) => n.length >= 3)
        )
      );
      const result: StreetRouteGeometry = {
        coordinates: route.geometry.coordinates.map((p: [number, number]) => [p[1], p[0]]),
        distanceKm: Number((route.distance / 1000).toFixed(1)),
        durationMinutes: Math.max(1, Math.round(route.duration / 60)),
        streetNames,
      };
      if (osrmRouteCache.size > 30) {
        const firstKey = osrmRouteCache.keys().next().value;
        if (firstKey) osrmRouteCache.delete(firstKey);
      }
      osrmRouteCache.set(cacheKey, result);
      return result;
    }
  } catch {
    // fallback arc
  }
  const coords: Array<[number, number]> = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    coords.push([
      startCoords.lat + (endCoords.lat - startCoords.lat) * t,
      startCoords.lng + (endCoords.lng - startCoords.lng) * t,
    ]);
  }
  // Pravi procenjeni podaci (vazdušna linija × 1.3 za ulice, ~25 km/h gradski prosek).
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(endCoords.lat - startCoords.lat);
  const dLng = toRad(endCoords.lng - startCoords.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(startCoords.lat)) * Math.cos(toRad(endCoords.lat)) * Math.sin(dLng / 2) ** 2;
  const airKm = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  const roadKm = Number((airKm * 1.3).toFixed(1));
  return {
    coordinates: coords,
    distanceKm: roadKm,
    durationMinutes: Math.max(1, Math.round((roadKm / 25) * 60)),
    // Namerno prazno: bez stvarnih ulica radar ne sme da nagađa preseke sa putanjom.
    streetNames: [],
    isApproximate: true,
  } as StreetRouteGeometry;
}

export async function geocodeInBrowser(
  query: string
): Promise<{ found: boolean; lat?: number; lng?: number; displayName?: string }> {
  // 1) Instant local lookup in our 13,885 Belgrade street & landmark gazetteer
  try {
    const localHit = await resolveBelgradeLocation(query);
    if (localHit.found && typeof localHit.lat === 'number' && typeof localHit.lng === 'number') {
      return localHit;
    }
  } catch {
    // continue to fallback
  }

  // 2) Fallback to Photon API (OpenStreetMap-based, fast, CORS-friendly)
  try {
    const q = query.includes('Srbija') || query.includes('Beograd') ? query : `${query}, Beograd`;
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`
    );
    const data = await res.json();
    const feat = data?.features?.[0];
    if (feat?.geometry?.coordinates) {
      const [lng, lat] = feat.geometry.coordinates;
      const name = feat.properties?.name || feat.properties?.street || query;
      return {
        found: true,
        lat: Number(lat),
        lng: Number(lng),
        displayName: name,
      };
    }
  } catch {
    // ignore
  }
  return { found: false };
}

function formatClusterLead(article?: ScrapedArticle): string {
  const count = Number(article?.mediaCount || 1);
  const primary = article?.sourceName || 'Portal';
  if (count >= 2) {
    return `${primary} (+${count - 1} medija)`;
  }
  return primary;
}

export async function generateNewsReportInBrowser(
  prefs: UserPreferences,
  selectedArticles?: ScrapedArticle[]
): Promise<NewsReport> {
  const startCoords = prefs.startCoords || prefs.coords || { lat: 44.8176, lng: 20.4569 };
  const endCoords = prefs.endCoords || startCoords;

  const [weather, scrapedRes, routeGeo] = await Promise.all([
    fetchWeatherInBrowser(startCoords.lat, startCoords.lng),
    Array.isArray(selectedArticles) && selectedArticles.length > 0
      ? Promise.resolve({ articles: selectedArticles })
      : scrapeNewsInBrowser(prefs.sourceGroups, false),
    prefs.endCoords
      ? fetchStreetRouteInBrowser(startCoords, endCoords)
      : Promise.resolve({
          coordinates: [[startCoords.lat, startCoords.lng] as [number, number]],
          distanceKm: 0,
          durationMinutes: 0,
          streetNames: [],
        }),
    !getLiveServiceFeedMeta().loaded ? refreshLiveServiceFeed() : Promise.resolve(null),
  ]);

  const listenedMap = readListenedArticleMap();
  const articles = sortArticlesForFeed(
    scrapedRes.articles || INITIAL_SNAPSHOT_ARTICLES,
    'important',
    listenedMap
  );
  const destTrimmed = (prefs.destination || '').trim();
  const startTrimmed = (prefs.startPoint || '').trim();
  const homeTrimmed = (prefs.homeAddress || '').trim();
  const workTrimmed = (prefs.workAddress || '').trim();
  const matchesAddr = (a: string, b: string) => {
    if (!a || !b) return false;
    const na = a.toLowerCase();
    const nb = b.toLowerCase();
    return na === nb || na.includes(nb.split(',')[0].trim()) || nb.includes(na.split(',')[0].trim());
  };

  const hasExplicitDestination = Boolean(destTrimmed);
  const hasCustomStart = Boolean(
    startTrimmed &&
      startTrimmed.toLowerCase() !== 'moja lokacija' &&
      startTrimmed.toLowerCase() !== 'beograd'
  );

  const routeTitle = (() => {
    if (hasExplicitDestination) {
      const isDestWork = matchesAddr(destTrimmed, workTrimmed);
      const isDestHome = matchesAddr(destTrimmed, homeTrimmed);
      const isStartHome = matchesAddr(startTrimmed, homeTrimmed);
      const isStartWork = matchesAddr(startTrimmed, workTrimmed);

      if (isDestWork && (isStartHome || !hasCustomStart)) {
        return 'Kuća → Posao';
      }
      if (isDestHome && (isStartWork || !hasCustomStart)) {
        return 'Posao → Kuća';
      }
      if (isDestWork && hasCustomStart) {
        return `${startTrimmed} → Posao`;
      }
      if (isDestHome && hasCustomStart) {
        return `${startTrimmed} → Kuća`;
      }
      return hasCustomStart ? `${startTrimmed} → ${destTrimmed}` : destTrimmed;
    }
    if (homeTrimmed && workTrimmed) {
      return 'Kuća → Posao';
    }
    return hasCustomStart ? startTrimmed : 'Moja lokacija';
  })();

  const spokenRouteTitle = routeTitle.replace(/\s*→\s*/g, ' ka ');

  const pacingMode = prefs.pacingMode || 'commute_adaptive';
  const commuteMins = Number(prefs.estimatedCommuteMinutes) || routeGeo.durationMinutes || 18;
  const effectiveDuration =
    pacingMode === 'express_90s'
      ? 2
      : pacingMode === 'all_breaking'
      ? 6
      : prefs.adaptiveDuration !== false
      ? commuteMins <= 14
        ? 2
        : commuteMins >= 22
        ? 6
        : 4
      : Number(prefs.duration) || 4;

  const isLongCommute = effectiveDuration >= 6;

  // Build 3-Point Spatial Service Radar from recnik.csv + eds.csv + GSP/BVK
  const radar = buildThreePointServiceRadar({
    prefs,
    routeCoords: routeGeo.coordinates,
    routeStreetNames: routeGeo.streetNames || [],
    userCurrentCoords: prefs.coords || startCoords,
  });

  // Poglavlje 1: Servisni štit u 3 tačke + vreme (kratko 20-30s + prošireni blok na klik)
  const routeIntroPhrase =
    hasExplicitDestination || (homeTrimmed && workTrimmed)
      ? `za relaciju ${spokenRouteTitle}, procenjeno vreme vožnje je oko ${commuteMins} minuta`
      : `za vašu trenutnu lokaciju (${spokenRouteTitle})`;
  const ch1Text =
    prefs.hostFormat === 'duo'
      ? [
          `Jelena: Dobrodošli u vaš putni vodič ${routeIntroPhrase}. Temperatura u Beogradu je ${weather.tempC} stepeni, uz ${weather.condition.toLowerCase()}.`,
          `Milan: ${radar.spokenChapterIntro}`,
        ].join('\n')
      : `Vaš putni vodič ${routeIntroPhrase}, temperatura ${weather.tempC} stepeni. ${radar.spokenChapterIntro}`;

  const ch1Expanded =
    prefs.hostFormat === 'duo'
      ? `Jelena: Slušate kompletan izveštaj Servisnog radara u 3 tačke (Polazište, Trasa, Cilj).\nMilan: ${radar.spokenChapterExpanded}`
      : `Kompletan izveštaj Servisnog radara po tačkama vaše rute: ${radar.spokenChapterExpanded}`;

  // Poglavlje 2: Udarne teme dana — kratak 20-30s blok (naslov + 2 rečenice) + ceo blok na klik!
  const domArticles = articles.filter(
    (a) => a.sourceGroup === 'domaci_info' || a.sourceGroup === 'custom_urls' || a.sourceGroup === 'saobracaj_servisi'
  );
  const techArticles = articles.filter((a) => a.sourceGroup === 'it_tech');
  const top1 = domArticles[0] || articles[0];
  const top2 = domArticles[1] || articles[1];
  const top3 = domArticles[2] || articles[2];
  const top4 = domArticles[3] || articles[3];

  const ch2Text =
    prefs.hostFormat === 'duo'
      ? [
          top1 ? `Jelena: U kratkom preseku udarnih vesti — ${formatClusterLead(top1)}: ${top1.title}.` : '',
          top2 ? `Milan: Druga ključna vest dana — ${formatClusterLead(top2)}: ${top2.title}. (Kliknite „Čuj ceo blok“ za šire detalje).` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : [
          top1 ? buildArticleBriefingScript(top1) : '',
          top2 ? `Takođe u fokusu: ${top2.title}.` : '',
        ]
          .filter(Boolean)
          .join(' ');

  const ch2Expanded = [
    top1 ? buildArticleBriefingScript(top1) : '',
    top2 ? buildArticleBriefingScript(top2) : '',
    top3 ? buildArticleBriefingScript(top3) : '',
    top4 ? buildArticleBriefingScript(top4) : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const rawChapters: Array<{
    id: string;
    title: string;
    category: string;
    text: string;
    expandedText?: string;
    expandedTitle?: string;
    articleUrl?: string;
    sourceName?: string;
    leadTitle?: string;
    articleIds?: string[];
  }> = [
    {
      id: 'ch-1',
      title: '1. Servisni radar (Polazište · Trasa · Cilj)',
      category: 'Servisne Informacije',
      text: ch1Text,
      expandedTitle: 'Kompletan Servisni Radar u 3 tačke (EDS, BVK, GSP)',
      expandedText: ch1Expanded,
      sourceName: radar.alerts[0]?.sourceName || 'Servisni radar Beograd (EDS · BVK · GSP)',
      leadTitle:
        radar.alerts[0]?.title ||
        `Prohodnost i servisi na relaciji ${routeTitle} (${weather.tempC}°C)`,
    },
    {
      id: 'ch-2',
      title: '2. Udarne teme dana (Kratak presek 25s)',
      category: 'Udarne Vesti',
      text: ch2Text,
      expandedTitle: 'Ceo blok udarnih vesti dana (svi klasteri)',
      expandedText: ch2Expanded,
      articleUrl: top1?.url,
      sourceName: top1 ? formatClusterLead(top1) : 'Redakcija',
      leadTitle: top1?.title || 'Pregled najvažnijih udarnih vesti dana',
      articleIds: [top1?.id, top2?.id].filter((id): id is string => Boolean(id)),
    },
  ];

  // Pravilo 3: Dinamička poglavlja po izabranim kategorijama korisnika (ništa nije zakucano!)
  const thematicInterests = (prefs.interests || []).filter(
    (i) => i !== 'Saobraćaj i prohodnost' && i !== 'Vremenska prognoza' && i !== 'Vreme'
  );
  const activeThemes =
    thematicInterests.length > 0 ? thematicInterests : ['Biznis i Finansije', 'Tehnologija'];

  const maxThemeChapters =
    pacingMode === 'express_90s' ? 1 : isLongCommute ? Math.min(3, activeThemes.length) : Math.min(2, activeThemes.length);

  for (let idx = 0; idx < maxThemeChapters; idx++) {
    const themeName = activeThemes[idx];
    const matchingCategoryArticles = articles.filter(
      (a) => a.category && a.category.toLowerCase() === themeName.toLowerCase()
    );
    const isTechTheme = themeName.toLowerCase().includes('tehnolog');
    const pool =
      matchingCategoryArticles.length > 0
        ? matchingCategoryArticles
        : isTechTheme && techArticles.length > 0
        ? techArticles
        : domArticles.slice(2 + idx).concat(techArticles);

    const a1 = pool[0] || articles[(idx + 2) % Math.max(1, articles.length)];
    const a2 = pool[1] || articles[(idx + 3) % Math.max(1, articles.length)];
    const a3 = pool[2] || articles[(idx + 4) % Math.max(1, articles.length)];

    const chNum = rawChapters.length + 1;
    const shortBlock =
      prefs.hostFormat === 'duo'
        ? [
            a1
              ? `Jelena: Iz vaše izabrane oblasti „${themeName}“ (${formatClusterLead(a1)}): ${a1.title}.`
              : '',
            a2
              ? `Milan: Još jedan naslov iz rubrike ${themeName}: ${a2.title}.`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : `${themeName} — kratak pregled: ${a1 ? `${a1.title}.` : ''} ${a2 ? `Takođe: ${a2.title}.` : ''}`;

    const fullBlock = [
      a1 ? `1) ${a1.title} (${a1.sourceName}): ${a1.summary}` : '',
      a2 ? `2) ${a2.title} (${a2.sourceName}): ${a2.summary}` : '',
      a3 ? `3) ${a3.title} (${a3.sourceName}): ${a3.summary}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    rawChapters.push({
      id: `ch-${chNum}`,
      title: `${chNum}. ${themeName} (Kratak blok 25s)`,
      category: themeName,
      text: shortBlock,
      expandedTitle: `Ceo blok za oblast: ${themeName}`,
      expandedText: fullBlock,
      articleUrl: a1?.url,
      sourceName: a1 ? formatClusterLead(a1) : themeName,
      leadTitle: a1?.title || `Pregled vesti iz oblasti ${themeName}`,
      articleIds: [a1?.id, a2?.id].filter((id): id is string => Boolean(id)),
    });
  }

  const transcript = rawChapters.map((c) => c.text).join('\n\n');
  const total = transcript.length || 1;
  let running = 0;
  const chapters = rawChapters.map((c, idx) => {
    const startRatio = idx === 0 ? 0 : Number((running / total).toFixed(3));
    running += c.text.length + 2;
    const endRatio = idx === rawChapters.length - 1 ? 1 : Number(Math.min(1, running / total).toFixed(3));
    return { ...c, startRatio, endRatio };
  });

  const builtReport: NewsReport = {
    id: `rep-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }),
    routeTitle,
    hostFormat: prefs.hostFormat,
    transcript,
    chapters,
    scrapedArticles: articles,
    trafficNodes:
      radar.trafficNodes.length > 0
        ? radar.trafficNodes
        : [
            {
              id: 'node-1',
              title: 'Polazna zona',
              locationName: prefs.startPoint || 'Novi Beograd',
              severity: 'prohodno',
              delayMinutes: 0,
              description: 'Redovna prohodnost u zoni polazišta.',
              progressRatio: 0.15,
            },
          ],
    serviceRadar: radar.alerts,
    routeStreetNames: routeGeo.streetNames,
    routeCoordinates: routeGeo.coordinates,
    weather,
    sources: articles.slice(0, 5).map((a) => ({ title: `${a.sourceName}: ${a.title}`, uri: a.url })),
    startCoords,
    endCoords,
    audioData: '',
  };

  saveCachedBriefingPackage(builtReport);
  return builtReport;
}

export function convertReportHostFormat(
  report: NewsReport,
  nextFormat: 'duo' | 'solo'
): NewsReport {
  if (report.hostFormat === nextFormat) return report;

  const transformScript = (raw: string): string => {
    if (!raw) return raw;
    if (nextFormat === 'solo') {
      return raw
        .split(/\n+/)
        .map((line) => line.replace(/^(Jelena|Milan):\s*/i, '').trim())
        .filter(Boolean)
        .join(' ');
    }
    // Convert Solo script into Jelena / Milan alternating lines
    const clean = raw.replace(/^(Jelena|Milan):\s*/gim, '').trim();
    const sentences = (clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean])
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length <= 1) {
      return `Jelena: ${clean}`;
    }
    const mid = Math.ceil(sentences.length / 2);
    const jelenaPart = sentences.slice(0, mid).join(' ');
    const milanPart = sentences.slice(mid).join(' ');
    return `Jelena: ${jelenaPart}\nMilan: ${milanPart}`;
  };

  const nextChapters = (report.chapters || []).map((ch) => ({
    ...ch,
    text: transformScript(ch.text),
    expandedText: ch.expandedText ? transformScript(ch.expandedText) : ch.expandedText,
  }));

  const nextTranscript =
    nextChapters.length > 0
      ? nextChapters.map((c) => c.text).join('\n\n')
      : transformScript(report.transcript);

  return {
    ...report,
    hostFormat: nextFormat,
    chapters: nextChapters,
    transcript: nextTranscript,
    audioData: undefined,
  };
}
