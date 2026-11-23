import { BriefingPacingMode, HostFormat, TransportMode } from '../types';

export type TelemetryEventType =
  | 'session_started'
  | 'tab_viewed'
  | 'briefing_started'
  | 'audio_play_toggled'
  | 'audio_completed'
  | 'playback_rate_changed'
  | 'radio_mix_toggled'
  | 'chapter_jumped'
  | 'chapter_skipped'
  | 'chapter_expanded'
  | 'service_alert_inspected'
  | 'transport_mode_changed'
  | 'pacing_mode_changed'
  | 'location_radar_ping'
  | 'deep_dive_triggered'
  | 'voice_question_asked'
  | 'autodock_opened'
  | 'scraper_action'
  | 'smart_optimization_applied'
  | 'route_reversed'
  | 'proactive_alert_spoken'
  | 'article_summary_played'
  | 'quick_commute_work'
  | 'quick_commute_home'
  | 'street_autocomplete_selected'
  | 'article_briefing_played'
  | 'onboarding_completed'
  | 'onboarding_skipped';

export interface TelemetryEvent {
  id: string;
  deviceId: string;
  type: TelemetryEventType;
  timestamp: string;
  isoTime: string;
  hourOfDay: number;
  label: string;
  meta?: Record<string, any>;
}

export interface ProductRecommendation {
  id: string;
  area: 'opste_ponasanje' | 'audio_retencija' | 'servisni_radar' | 'kategorije_vesti';
  title: string;
  finding: string;
  actionLabel?: string;
  suggestedPatch?: {
    transportMode?: TransportMode;
    pacingMode?: BriefingPacingMode;
    hostFormat?: HostFormat;
    addInterests?: string[];
  };
}

export interface AnalyticsSummary {
  // Osnovni brojači (kompatibilni sa prethodnim prikazom)
  totalBriefings: number;
  totalChapterExpansions: number;
  totalServiceInteractions: number;
  locationRadarPings: number;

  // 1) Opšte korišćenje aplikacije (sesije, doba dana, ekrani, funkcije)
  totalSessions: number;
  totalEvents: number;
  timeSlotCounts: {
    jutarnji_spic: number; // 06-10h
    sredina_dana: number; // 10-15h
    popodnevni_spic: number; // 15-19h
    vece_noc: number; // 19-06h
  };
  tabVisitCounts: {
    setup: number;
    scraper: number;
    hud: number;
    routes: number;
    autodock: number;
  };
  audioEngagement: {
    playStarts: number;
    completions: number;
    completionRatePct: number;
    chapterJumps: number;
    chapterSkips: number;
    preferredRate: string;
  };
  featureUsage: {
    voiceQuestions: number;
    autoDockOpens: number;
    deepDives: number;
    scraperActions: number;
  };
  hostFormatCounts: { duo: number; solo: number };
  topRoutes: Array<{ route: string; count: number }>;

  // 2) Specifična analitika brifinga, kategorija i Servisnog radara u 3 tačke
  transportModeCounts: { car: number; transit: number };
  pacingModeCounts: { commute_adaptive: number; all_breaking: number; express_90s: number };
  serviceZoneCounts: { start: number; route: number; destination: number };
  topExpandedCategories: Array<{ category: string; count: number }>;
  topSkippedCategories: Array<{ category: string; count: number }>;
  topServiceCategories: Array<{ category: string; count: number }>;

  // 3) Automatski uvidi i preporuke za unapređenje proizvoda
  recommendations: ProductRecommendation[];
  recentEvents: TelemetryEvent[];
}

const ANALYTICS_STORAGE_KEY = 'commute_companion_telemetry_v1';
const DEVICE_ID_STORAGE_KEY = 'commute_companion_device_id_v1';

function getAnonDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      id = `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'cc-anon';
  }
}

function loadEvents(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events: TelemetryEvent[]) {
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(events.slice(0, 400)));
  } catch {
    // ignore storage errors
  }
}

export function trackAppEvent(
  type: TelemetryEventType,
  label: string,
  meta?: Record<string, any>
): void {
  const now = new Date();
  const ev: TelemetryEvent = {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    deviceId: getAnonDeviceId(),
    type,
    timestamp: now.toLocaleTimeString('sr-RS', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    isoTime: now.toISOString(),
    hourOfDay: now.getHours(),
    label,
    meta,
  };

  const current = loadEvents();
  saveEvents([ev, ...current]);

  // Asinhrono pošalji na backend prijemnik (ako je aktivan) bez blokiranja UI-a
  try {
    if (typeof fetch !== 'undefined') {
      fetch('/api/analytics/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: ev }),
      }).catch(() => {});
    }
  } catch {
    // ignore network errors in static mode
  }
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const events = loadEvents();
  let totalBriefings = 0;
  let totalChapterExpansions = 0;
  let totalServiceInteractions = 0;
  let locationRadarPings = 0;
  let totalSessions = 0;

  const timeSlotCounts = {
    jutarnji_spic: 0,
    sredina_dana: 0,
    popodnevni_spic: 0,
    vece_noc: 0,
  };

  const tabVisitCounts = {
    setup: 0,
    scraper: 0,
    hud: 0,
    routes: 0,
    autodock: 0,
  };

  let playStarts = 0;
  let completions = 0;
  let chapterJumps = 0;
  let chapterSkips = 0;
  const rateCounts = new Map<string, number>();

  let voiceQuestions = 0;
  let autoDockOpens = 0;
  let deepDives = 0;
  let scraperActions = 0;

  const hostFormatCounts = { duo: 0, solo: 0 };
  const transportModeCounts = { car: 0, transit: 0 };
  const pacingModeCounts = { commute_adaptive: 0, all_breaking: 0, express_90s: 0 };
  const serviceZoneCounts = { start: 0, route: 0, destination: 0 };

  const expandedCatMap = new Map<string, number>();
  const skippedCatMap = new Map<string, number>();
  const serviceCatMap = new Map<string, number>();
  const routeMap = new Map<string, number>();

  for (const ev of events) {
    const h = typeof ev.hourOfDay === 'number' ? ev.hourOfDay : 8;
    if (h >= 6 && h < 10) timeSlotCounts.jutarnji_spic++;
    else if (h >= 10 && h < 15) timeSlotCounts.sredina_dana++;
    else if (h >= 15 && h < 19) timeSlotCounts.popodnevni_spic++;
    else timeSlotCounts.vece_noc++;

    switch (ev.type) {
      case 'session_started':
        totalSessions++;
        break;
      case 'tab_viewed': {
        const tab = String(ev.meta?.tab || ev.label);
        if (tab in tabVisitCounts) {
          tabVisitCounts[tab as keyof typeof tabVisitCounts]++;
        }
        break;
      }
      case 'briefing_started': {
        totalBriefings++;
        const tm = ev.meta?.transportMode === 'transit' ? 'transit' : 'car';
        transportModeCounts[tm]++;
        const pm = ev.meta?.pacingMode || 'commute_adaptive';
        if (pm in pacingModeCounts) {
          pacingModeCounts[pm as keyof typeof pacingModeCounts]++;
        }
        const hf = ev.meta?.hostFormat === 'solo' ? 'solo' : 'duo';
        hostFormatCounts[hf]++;
        const rName = String(ev.meta?.route || '').trim();
        if (rName) {
          routeMap.set(rName, (routeMap.get(rName) || 0) + 1);
        }
        break;
      }
      case 'audio_play_toggled':
        if (ev.meta?.playing) playStarts++;
        break;
      case 'audio_completed':
        completions++;
        break;
      case 'playback_rate_changed': {
        const r = String(ev.meta?.rate || ev.label || '1x');
        rateCounts.set(r, (rateCounts.get(r) || 0) + 1);
        break;
      }
      case 'chapter_jumped':
        chapterJumps++;
        break;
      case 'chapter_skipped': {
        chapterSkips++;
        const sCat = String(ev.meta?.category || ev.label || '');
        if (sCat) skippedCatMap.set(sCat, (skippedCatMap.get(sCat) || 0) + 1);
        break;
      }
      case 'chapter_expanded': {
        totalChapterExpansions++;
        const cat = String(ev.meta?.category || ev.label || 'Udarne Teme');
        expandedCatMap.set(cat, (expandedCatMap.get(cat) || 0) + 1);
        break;
      }
      case 'service_alert_inspected': {
        totalServiceInteractions++;
        const cat = String(ev.meta?.category || 'prevoz');
        serviceCatMap.set(cat, (serviceCatMap.get(cat) || 0) + 1);
        const z = String(ev.meta?.zone || 'route');
        if (z in serviceZoneCounts) {
          serviceZoneCounts[z as keyof typeof serviceZoneCounts]++;
        }
        break;
      }
      case 'location_radar_ping':
        locationRadarPings++;
        break;
      case 'deep_dive_triggered': {
        deepDives++;
        const dCat = String(ev.meta?.category || ev.label || '');
        if (dCat) expandedCatMap.set(dCat, (expandedCatMap.get(dCat) || 0) + 1);
        break;
      }
      case 'voice_question_asked':
        voiceQuestions++;
        break;
      case 'autodock_opened':
        autoDockOpens++;
        tabVisitCounts.autodock++;
        break;
      case 'scraper_action':
        scraperActions++;
        break;
      default:
        break;
    }
  }

  const topExpandedCategories = Array.from(expandedCatMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topSkippedCategories = Array.from(skippedCatMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const topServiceCategories = Array.from(serviceCatMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topRoutes = Array.from(routeMap.entries())
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const preferredRate =
    Array.from(rateCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '1.0x';

  const denom = Math.max(1, totalBriefings, playStarts);
  const completionRatePct =
    totalBriefings > 0 || completions > 0
      ? Math.min(100, Math.round((completions / denom) * 100))
      : 0;

  // Generiši konkretne produktne uvide i preporuke iz ponašanja
  const recommendations: ProductRecommendation[] = [];

  // 1) Uvid o temama koje korisnik najviše proširuje ("+ Čuj ceo blok" / Deep-Dive)
  if (topExpandedCategories.length > 0) {
    const topCat = topExpandedCategories[0];
    recommendations.push({
      id: 'rec-category-focus',
      area: 'kategorije_vesti',
      title: `Visoko interesovanje za oblast: ${topCat.category}`,
      finding: `Korisnici su ${topCat.count}x tražili „+ Čuj ceo blok” ili Deep-Dive iz oblasti „${topCat.category}”. Ovu oblast vredi prioritizovati u osnovnom brifingu.`,
      actionLabel: `Dodaj „${topCat.category}” u primarne teme`,
      suggestedPatch: {
        addInterests: [topCat.category],
      },
    });
  }

  // 2) Uvid o preskakanju poglavlja i trajanju brifinga
  if (chapterSkips >= 2 && topSkippedCategories.length > 0) {
    const skipped = topSkippedCategories[0];
    recommendations.push({
      id: 'rec-skip-pattern',
      area: 'audio_retencija',
      title: `Preskakanje poglavlja (${skipped.category})`,
      finding: `Zabeleženo je ${chapterSkips} preskakanja poglavlja (najčešće: ${skipped.category}). Kraći uvodni blokovi ili režim „Po trajanju puta” smanjuju potrebu za ručnim preskakanjem u vožnji.`,
      actionLabel: 'Uključi adaptivno trajanje po ruti',
      suggestedPatch: {
        pacingMode: 'commute_adaptive',
      },
    });
  } else if (totalChapterExpansions >= 3 && totalBriefings > 0) {
    recommendations.push({
      id: 'rec-deep-listener',
      area: 'audio_retencija',
      title: 'Korisnik često traži proširene blokove',
      finding: `U proseku se proširuje ${(totalChapterExpansions / Math.max(1, totalBriefings)).toFixed(1)} blokova po brifingu — korisniku prija dublji presek glavnih vesti.`,
      actionLabel: 'Prebaci na „Sve udarne teme”',
      suggestedPatch: {
        pacingMode: 'all_breaking',
      },
    });
  }

  // 3) Uvid o Servisnom radaru u 3 tačke (Polazište / Na trasi / Cilj)
  if (totalServiceInteractions > 0) {
    const bestZone =
      serviceZoneCounts.start >= serviceZoneCounts.route &&
      serviceZoneCounts.start >= serviceZoneCounts.destination
        ? '1. Polazište (kućni broj / kvart)'
        : serviceZoneCounts.destination >= serviceZoneCounts.route
        ? '3. Cilj (dolazna zona / parking)'
        : '2. Na trasi (izmena linija i radovi)';
    const topSrv = topServiceCategories[0]?.category || 'prevoz';
    recommendations.push({
      id: 'rec-service-radar',
      area: 'servisni_radar',
      title: `Najvažnija tačka radara: ${bestZone}`,
      finding: `Od ${totalServiceInteractions} interakcija sa Servisnim radarom, najviše pažnje privlači zona „${bestZone}” (kategorija: ${topSrv.toUpperCase()}).`,
      ...(topSrv === 'prevoz'
        ? {
            actionLabel: 'Prioritizuj GSP režim prevoza',
            suggestedPatch: { transportMode: 'transit' },
          }
        : {}),
    });
  }

  // 4) Uvid o opštem načinu korišćenja po dobu dana i ekranima
  const maxSlot = Object.entries(timeSlotCounts).sort((a, b) => b[1] - a[1])[0];
  if (events.length > 0 && maxSlot && maxSlot[1] > 0) {
    const slotLabel =
      maxSlot[0] === 'jutarnji_spic'
        ? 'Jutarnji špic (06–10h)'
        : maxSlot[0] === 'popodnevni_spic'
        ? 'Popodnevni špic (15–19h)'
        : maxSlot[0] === 'sredina_dana'
        ? 'Sredina dana (10–15h)'
        : 'Večernji termin (19–06h)';
    recommendations.push({
      id: 'rec-general-habit',
      area: 'opste_ponasanje',
      title: `Glavni termin korišćenja: ${slotLabel}`,
      finding: `Najviše aktivnosti je u terminu „${slotLabel}” (${maxSlot[1]} akcija). Auto-Dock je otvoren ${autoDockOpens}x, a glasovni kopilot korišćen ${voiceQuestions}x.`,
    });
  }

  return {
    totalBriefings,
    totalChapterExpansions,
    totalServiceInteractions,
    locationRadarPings,
    totalSessions: Math.max(1, totalSessions),
    totalEvents: events.length,
    timeSlotCounts,
    tabVisitCounts,
    audioEngagement: {
      playStarts,
      completions,
      completionRatePct,
      chapterJumps,
      chapterSkips,
      preferredRate,
    },
    featureUsage: {
      voiceQuestions,
      autoDockOpens,
      deepDives,
      scraperActions,
    },
    hostFormatCounts,
    topRoutes,
    transportModeCounts,
    pacingModeCounts,
    serviceZoneCounts,
    topExpandedCategories,
    topSkippedCategories,
    topServiceCategories,
    recommendations,
    recentEvents: events.slice(0, 12),
  };
}

export function exportAnalyticsPayload(): string {
  const summary = getAnalyticsSummary();
  const events = loadEvents();
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      deviceId: getAnonDeviceId(),
      summary,
      events,
    },
    null,
    2
  );
}

export function clearAnalyticsEvents(): void {
  try {
    localStorage.removeItem(ANALYTICS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
