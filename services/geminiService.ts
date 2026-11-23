import {
  UserPreferences,
  NewsReport,
  StreetRouteGeometry,
  ScrapedArticle,
  SourceGroupId,
  ServiceAlertItem,
} from '../types';
import {
  scrapeNewsInBrowser,
  generateNewsReportInBrowser,
  fetchStreetRouteInBrowser,
  geocodeInBrowser,
  fetchWeatherInBrowser,
} from './browserLiveEngine';
import {
  buildArticleBriefingScript,
  fetchStaticNewsFeed,
} from './newsFeedClient';

const isStaticDeployment = (): boolean =>
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:');

export interface ScrapedArticlesResponse {
  articles: ScrapedArticle[];
  lastSyncedAt?: string;
  generatedAt?: string | null;
  fromCache?: boolean;
  isOfflineFallback?: boolean;
}

export const fetchScrapedArticlesWithMeta = async (
  sourceGroups: SourceGroupId[],
  _customUrls: string[],
  forceRefresh = false
): Promise<ScrapedArticlesResponse> => {
  // Sloj 1 i Sloj 4: aplikacija čita isključivo unapred rangirani statički JSON feed (< 200ms),
  // nikada ne pokreće scraping tokom korisničkog zahteva.
  const staticFeed = await fetchStaticNewsFeed({ forceRefresh });
  if (staticFeed && staticFeed.articles.length > 0) {
    return {
      articles: staticFeed.articles,
      lastSyncedAt: staticFeed.lastSyncedAt,
      generatedAt: staticFeed.generatedAt,
      fromCache: staticFeed.fromCache,
      isOfflineFallback: staticFeed.isOfflineFallback,
    };
  }
  return scrapeNewsInBrowser(sourceGroups, forceRefresh);
};

export const fetchScrapedArticles = async (
  sourceGroups: SourceGroupId[],
  customUrls: string[],
  forceRefresh = false
): Promise<ScrapedArticle[]> => {
  const res = await fetchScrapedArticlesWithMeta(sourceGroups, customUrls, forceRefresh);
  return res.articles;
};

export const scrapeCustomUrl = async (url: string): Promise<ScrapedArticle[]> => {
  const cleanUrl = url.trim();
  const host = cleanUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || 'Portal';
  return [
    {
      id: `custom-${Date.now()}`,
      title: `Direktno dodat članak sa portala ${host}`,
      sourceName: host,
      sourceGroup: 'custom_urls',
      category: 'Društvo',
      summary: `Članak sa adrese ${cleanUrl} je uključen u vaš lični izbor za audio brifing.`,
      url: /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`,
      publishedAt: 'upravo sad',
      publishedAtIso: new Date().toISOString(),
      selected: true,
      mediaCount: 1,
      relatedSources: [host],
      importanceScore: 76,
    },
  ];
};

export const generateDeepDiveAudio = async (
  article: ScrapedArticle,
  _prefs: UserPreferences
): Promise<{
  title: string;
  sourceName: string;
  url: string;
  transcript: string;
  audioData: string;
}> => {
  // Sloj 5 + F7: koristi unapred sintetisani aiBriefing (ili čist fallback: izvor + naslov + uvod)
  const transcript = buildArticleBriefingScript(article);
  return {
    title: article.title,
    sourceName: article.sourceName,
    url: article.url,
    transcript,
    audioData: '',
  };
};

export const generateNewsReport = async (
  prefs: UserPreferences,
  selectedArticles?: ScrapedArticle[]
): Promise<NewsReport> => {
  try {
    const response = await fetch('/api/news/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs, selectedArticles }),
    });

    if (response.ok) {
      return response.json();
    }
  } catch {
    // fallback below
  }
  return generateNewsReportInBrowser(prefs, selectedArticles);
};

export const answerFollowUp = async (
  question: string,
  prefs: UserPreferences,
  currentRouteTitle?: string,
  currentReport?: NewsReport | null,
  liveContext?: {
    articles?: ScrapedArticle[];
    urgentAlerts?: ServiceAlertItem[];
    routeSummary?: { distanceKm?: number; durationMinutes?: number; streets?: string[] };
    coords?: { lat: number; lng: number };
  }
): Promise<{ text: string; audioData: string; sources?: Array<{ title: string; uri: string }> }> => {
  if (!isStaticDeployment()) {
    try {
      const response = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, prefs, currentRouteTitle }),
      });

      if (response.ok) {
        return response.json();
      }
    } catch {
      // fallback below
    }
  }

  const qLower = question.toLowerCase();
  const radarAlerts = [
    ...(currentReport?.serviceRadar || []),
    ...(liveContext?.urgentAlerts || []),
  ];
  const trafficNodes = currentReport?.trafficNodes || [];
  const articles =
    currentReport?.scrapedArticles && currentReport.scrapedArticles.length > 0
      ? currentReport.scrapedArticles
      : liveContext?.articles && liveContext.articles.length > 0
      ? liveContext.articles
      : (await scrapeNewsInBrowser(prefs.sourceGroups, false)).articles || [];

  // 1) Pitanja o struji, vodi, komunalnim kvarovima
  if (/(struj|eds|vod|bvk|kvar|iskljuc|isključ)/.test(qLower)) {
    const utilAlerts = radarAlerts.filter(
      (a) => a.category === 'struja' || a.category === 'voda'
    );
    if (utilAlerts.length > 0) {
      return {
        text: `Servisni radar beleži ${utilAlerts.length} komunalnih stavki: ${utilAlerts
          .slice(0, 3)
          .map((a) => a.spokenText || a.title)
          .join(' ')}`,
        audioData: '',
        sources: [],
      };
    }
    return {
      text: `Za vašu kućnu adresu (${prefs.homeAddress || 'Beograd'}) i aktivnu putanju trenutno nema prijavljenih isključenja struje niti kvarova na vodovodnoj mreži.`,
      audioData: '',
      sources: [],
    };
  }

  // 2) Pitanja o GSP prevozu, linijama, trolejbusima, autobusima
  if (/(gsp|prevoz|autobus|trolejbus|tramvaj|linij)/.test(qLower)) {
    const transitAlerts = radarAlerts.filter((a) => a.category === 'prevoz');
    if (transitAlerts.length > 0) {
      return {
        text: `Izveštaj za javni prevoz: ${transitAlerts
          .slice(0, 3)
          .map((a) => a.spokenText || a.title)
          .join(' ')}`,
        audioData: '',
        sources: [],
      };
    }
    return {
      text: `Praćene GSP linije (${(prefs.favoriteTransitLines || ['25', '71', '65']).join(', ')}) trenutno nemaju prijavljenih izmena na vašoj trasi.`,
      audioData: '',
      sources: [],
    };
  }

  // 3) Pitanja o vremenu (uvek povlači realnu Open-Meteo prognozu ako već nije učitana)
  if (/(vrem|kiš|kis|temperatur|prognoz|kolovoz|hladn|toplo|sneg|vetar)/.test(qLower)) {
    const weather =
      currentReport?.weather ||
      (await fetchWeatherInBrowser(liveContext?.coords?.lat, liveContext?.coords?.lng));
    return {
      text: `Trenutna temperatura (${currentRouteTitle || 'Beograd'}) je ${weather.tempC}°C (${weather.condition.toLowerCase()}), vetar ${weather.windKmh} km/h. ${weather.roadCondition}.`,
      audioData: '',
      sources: [],
    };
  }

  // 4) Pitanja o mostovima, gužvi, ruti ili alternativi (bez izmišljenih zastoja)
  if (/(most|gazel|brankov|slavij|gužv|guzv|saobraćaj|saobracaj|alternativ|brž|brz|stanje|put|rut)/.test(qLower)) {
    const roadAlerts = radarAlerts.filter(
      (a) => a.isAhead !== false && (a.category === 'saobracaj' || a.category === 'radovi')
    );
    const routeStats = liveContext?.routeSummary?.distanceKm
      ? `Aktivna putanja (${currentRouteTitle || 'Beograd'}): ${liveContext.routeSummary.distanceKm} km, procena vožnje oko ${liveContext.routeSummary.durationMinutes} min. `
      : '';

    if (roadAlerts.length > 0) {
      return {
        text: `${routeStats}Aktivna upozorenja na trasi: ${roadAlerts
          .slice(0, 3)
          .map((a) => a.spokenText || a.title)
          .join(' ')}`,
        audioData: '',
        sources: [],
      };
    }

    if (trafficNodes.length > 0) {
      const totalDelay = trafficNodes.reduce((sum, n) => sum + (n.delayMinutes || 0), 0);
      const radarNote = trafficNodes.map((n) => `${n.title}: ${n.description}`).join(' ');
      return {
        text: `${routeStats}Stanje na relaciji ${currentRouteTitle || 'vaša ruta'} (zadržavanje ~${totalDelay} min): ${radarNote}`,
        audioData: '',
        sources: [],
      };
    }

    return {
      text: `${routeStats}Na vašoj trasi trenutno nema prijavljenih radova niti blokada. Ako unesete odredište iznad mape, odmah ćete videti tačnu trasu i eventualne radove na putu.`,
      audioData: '',
      sources: [],
    };
  }

  // 5) Pretraga vesti po ključnim rečima iz upita (ekonomija, tehnologija, itd.)
  const stopWords = new Set(['šta', 'sta', 'ima', 'kakve', 'kakvo', 'vesti', 'danas', 'najnovije', 'nesto', 'nešto', 'recite', 'kazi', 'kaži', 'koje', 'su']);
  const keywords = qLower
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  let matched = articles;
  if (keywords.length > 0) {
    const scored = articles
      .map((art) => {
        const hay = `${art.title} ${art.summary || ''} ${art.category || ''} ${art.sourceName || ''}`.toLowerCase();
        const score = keywords.reduce((acc, kw) => acc + (hay.includes(kw.slice(0, 5)) ? 1 : 0), 0);
        return { art, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0) {
      matched = scored.map((x) => x.art);
    }
  }

  const top1 = matched[0];
  const top2 = matched[1];
  return {
    text: `Kratki presek za pitanje „${question}“: 1) ${top1 ? `${top1.title} (${top1.sourceName})${top1.summary ? ` — ${top1.summary}` : ''}` : 'Trenutno nema učitanih vesti.'}${
      top2 ? ` 2) ${top2.title} (${top2.sourceName}).` : ''
    }`,
    audioData: '',
    sources: [],
  };
};

export const generateAudio = async (
  text: string,
  languageVariant: string,
  hostFormat: 'solo' | 'duo' = 'solo'
): Promise<string> => {
  if (isStaticDeployment()) {
    return '';
  }
  try {
    const response = await fetch('/api/audio/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, languageVariant, hostFormat }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.audioData || '';
    }
  } catch {
    // Web Speech API fallback in AudioPlayerHUD handles empty audioData
  }
  return '';
};

export const geocodeAddress = async (
  query: string
): Promise<{ found: boolean; lat?: number; lng?: number; displayName?: string }> => {
  const localOrBrowser = await geocodeInBrowser(query);
  if (localOrBrowser.found) return localOrBrowser;
  try {
    const res = await fetch(`/api/geo/search?q=${encodeURIComponent(query)}`);
    if (res.ok) return res.json();
  } catch {
    // fallback already attempted
  }
  return localOrBrowser;
};

export const fetchStreetRoute = async (
  startCoords: { lat: number; lng: number },
  endCoords: { lat: number; lng: number }
): Promise<StreetRouteGeometry> => {
  try {
    const params = new URLSearchParams({
      startLat: String(startCoords.lat),
      startLng: String(startCoords.lng),
      endLat: String(endCoords.lat),
      endLng: String(endCoords.lng),
    });
    const res = await fetch(`/api/geo/route?${params.toString()}`);
    if (res.ok) return res.json();
  } catch {
    // fallback below
  }
  return fetchStreetRouteInBrowser(startCoords, endCoords);
};

export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const isWav =
    data.length > 44 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46;

  if (isWav) {
    try {
      const arrayBufferCopy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      return await ctx.decodeAudioData(arrayBufferCopy as ArrayBuffer);
    } catch {
      const pcmSlice = data.subarray(44);
      const dataInt16 = new Int16Array(
        pcmSlice.buffer,
        pcmSlice.byteOffset,
        Math.floor(pcmSlice.byteLength / 2)
      );
      const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }
      return buffer;
    }
  }

  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}
