import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Compass,
  MapPin,
  Flag,
  ExternalLink,
  Radio,
  RefreshCw,
  AlertCircle,
  Check,
  Users,
  User,
  History,
  Maximize2,
  Newspaper,
  Headphones,
  Zap,
  Droplets,
  Bus,
  Car,
  Home,
  Briefcase,
  Search,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Crosshair,
  Lock,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import {
  UserPreferences,
  NewsReport,
  RoutePreset,
  ConversationTurn,
  ScrapedArticle,
  SourceGroupId,
  AudioChapter,
  TransportMode,
  BriefingPacingMode,
  ServiceAlertItem,
  StreetRouteGeometry,
} from './types';
import {
  generateNewsReport,
  answerFollowUp,
  geocodeAddress,
  fetchStreetRoute,
  fetchScrapedArticlesWithMeta,
  scrapeCustomUrl,
} from './services/geminiService';
import {
  buildThreePointServiceRadar,
  haversineMeters,
  refreshLiveServiceFeed,
  getLiveServiceFeedMeta,
  loadOsmBelgradeStreets,
} from './services/serviceRadarEngine';
import {
  convertReportHostFormat,
  INITIAL_SNAPSHOT_ARTICLES,
  classifyNewsCategory,
} from './services/browserLiveEngine';
import {
  buildContinuousBriefingFromArticle,
  isArticleListened,
  markArticlesAsListened,
  NewsSortMode,
  ONBOARDING_DONE_KEY,
  readCachedBriefingPackage,
  readCachedStaticFeed,
  readListenedArticleMap,
  saveCachedBriefingPackage,
  sortArticlesForFeed,
} from './services/newsFeedClient';
import { trackAppEvent } from './services/analyticsService';
import { AudioPlayerHUD } from './components/AudioPlayerHUD';
import { InteractiveRouteMap } from './components/InteractiveRouteMap';
import { RadioMixSpotifyDeck } from './components/RadioMixSpotifyDeck';
import { StreetAutocompleteInput, LockedStreet } from './components/StreetAutocompleteInput';
import { OnboardingModal, OnboardingCompletionResult } from './components/OnboardingModal';
import {
  enforceArticleSourceDiversity,
  NewsFeedSection,
} from './components/NewsFeedSection';
import { ProfileView } from './components/ProfileView';
import { DriveModeView, PlaybackProgressInfo } from './components/DriveModeView';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '4.57.0';

const INTERESTS = [
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
];

const DEFAULT_ROUTE_PRESETS: RoutePreset[] = [
  {
    id: 'vracar-slavija',
    label: 'Vračar (Kalenić) → Trg Slavija',
    startPoint: 'Kalenić pijaca, Vračar',
    destination: 'Trg Slavija, Centar',
    distanceKm: 2.4,
    estimatedMinutes: 11,
    startCoords: { lat: 44.8012, lng: 20.4783 },
    endCoords: { lat: 44.8025, lng: 20.4664 },
  },
  {
    id: 'nbg-centar',
    label: 'Novi Beograd → Trg Republike',
    startPoint: 'Novi Beograd (Opština)',
    destination: 'Trg Republike, Centar',
    distanceKm: 6.4,
    estimatedMinutes: 18,
    startCoords: { lat: 44.8206, lng: 20.4144 },
    endCoords: { lat: 44.8162, lng: 20.4603 },
  },
  {
    id: 'zemun-slavija',
    label: 'Zemun (Kej) → Trg Slavija',
    startPoint: 'Zemunski Kej, Zemun',
    destination: 'Trg Slavija, Vračar',
    distanceKm: 8.9,
    estimatedMinutes: 24,
    startCoords: { lat: 44.8453, lng: 20.4119 },
    endCoords: { lat: 44.8025, lng: 20.4664 },
  },
  {
    id: 'banovo-airport',
    label: 'Banovo Brdo → Aerodrom Nikola Tesla',
    startPoint: 'Požeška, Banovo Brdo',
    destination: 'Aerodrom Beograd, Surčin',
    distanceKm: 17.5,
    estimatedMinutes: 26,
    startCoords: { lat: 44.7789, lng: 20.4167 },
    endCoords: { lat: 44.8184, lng: 20.3091 },
  },
];

function computeAdaptiveDuration(commuteMinutes?: number): number {
  const mins = Number(commuteMinutes) || 18;
  if (mins <= 14) return 2;
  if (mins >= 22) return 6;
  return 4;
}

const STORAGE_KEYS = {
  PREFS: 'commute_companion_prefs_v3',
  REPORT_HISTORY: 'commute_companion_history_v3',
};

const App: React.FC = () => {

  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const defaultInterests = [...INTERESTS];
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PREFS);
      if (saved) {
        const parsed = JSON.parse(saved);
        const rawInterests: string[] = Array.isArray(parsed.interests) ? parsed.interests : [];
        const migratedInterests = Array.from(
          new Set(
            rawInterests
              .map((i) => {
                if (i === 'Ekonomija') return 'Biznis i Finansije';
                if (i === 'Lokalne vesti' || i === 'Saobraćaj i prohodnost') return 'Društvo';
                if (i === 'Vremenska prognoza') return 'Vreme';
                return i;
              })
              .filter((i) => INTERESTS.includes(i))
          )
        );
        // Ensure all users transition cleanly to the canonical 10-category sequence:
        // 1. Politika -> 2. Društvo -> 3. Biznis i Finansije -> 4. Hronika -> 5. Region -> 6. Svet -> 7. Tehnologija -> 8. Kultura -> 9. Sport -> 10. Vreme
        const hasV453CategoryOrder = parsed.categoryOrderVersion === 'v4.53';
        const hasV456ThemeSync = parsed.themeSyncVersion === 'v4.56';
        const isCurrentlyLightDom =
          typeof document !== 'undefined' &&
          document.documentElement.classList.contains('light-app-theme');
        const resolvedDarkTheme = hasV456ThemeSync
          ? parsed.darkMapTheme !== false
          : !isCurrentlyLightDom;
        const finalInterests =
          !hasV453CategoryOrder || migratedInterests.length === 0
            ? defaultInterests
            : migratedInterests;
        return {
          adaptiveDuration: true,
          pacingMode: 'commute_adaptive',
          transportMode: 'car',
          backgroundLocationEnabled: true,
          proactiveAudioAlerts: true,
          favoriteTransitLines: ['25', '71', '65'],
          savedStreets: [],
          estimatedCommuteMinutes: 18,
          homeAddress: parsed.homeAddress || DEFAULT_ROUTE_PRESETS[1].startPoint,
          homeCoords: parsed.homeCoords || DEFAULT_ROUTE_PRESETS[1].startCoords,
          workAddress: parsed.workAddress || DEFAULT_ROUTE_PRESETS[1].destination,
          workCoords: parsed.workCoords || DEFAULT_ROUTE_PRESETS[1].endCoords,
          ...parsed,
          categoryOrderVersion: 'v4.53',
          themeSyncVersion: 'v4.56',
          hostFormat: 'solo',
          darkMapTheme: resolvedDarkTheme,
          interests: finalInterests,
          startPoint: parsed.startPoint || 'Moja lokacija',
          destination: parsed.destination || '',
          endCoords: parsed.destination ? parsed.endCoords : undefined,
        };
      }
    } catch {
      // ignore
    }
    return {
      mode: 'manual',
      transportMode: 'car',
      pacingMode: 'commute_adaptive',
      backgroundLocationEnabled: true,
      proactiveAudioAlerts: true,
      darkMapTheme: true,
      favoriteTransitLines: ['25', '71', '65'],
      savedStreets: [],
      hostFormat: 'solo',
      location: 'Beograd',
      startPoint: 'Moja lokacija',
      destination: '',
      homeAddress: DEFAULT_ROUTE_PRESETS[1].startPoint,
      homeCoords: DEFAULT_ROUTE_PRESETS[1].startCoords,
      workAddress: DEFAULT_ROUTE_PRESETS[1].destination,
      workCoords: DEFAULT_ROUTE_PRESETS[1].endCoords,
      interests: defaultInterests,
      sourceGroups: ['domaci_info', 'it_tech', 'saobracaj_servisi'],
      customUrls: [],
      duration: 4,
      adaptiveDuration: true,
      estimatedCommuteMinutes: 18,
      languageVariant: 'ekavica',
      radioMixEnabled: true,
      autoScanOnLoad: true,
      coords: { lat: 44.8176, lng: 20.4569 },
      startCoords: { lat: 44.8176, lng: 20.4569 },
      endCoords: undefined,
    };
  });

  const [reportHistory, setReportHistory] = useState<NewsReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.REPORT_HISTORY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeTab, setActiveTab] = useState<'setup' | 'hud'>('hud');
  const [loading, setLoading] = useState(false);
  const [isRoutingSearch, setIsRoutingSearch] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<NewsReport | null>(null);

  const [liveRouteCoords, setLiveRouteCoords] = useState<Array<[number, number]>>([]);
  const [liveRouteStreets, setLiveRouteStreets] = useState<string[]>([]);
  const [startSearchInput, setStartSearchInput] = useState<string>(
    () => prefs.startPoint || 'Moja lokacija'
  );
  const [destSearchInput, setDestSearchInput] = useState<string>(() => prefs.destination || '');
  const [isEditingStartPoint, setIsEditingStartPoint] = useState<boolean>(false);

  const parseSavedLockedStreet = (
    addr?: string,
    coords?: { lat: number; lng: number }
  ): LockedStreet | null => {
    if (!addr || !coords) return null;
    const parts = addr.split(',').map((s) => s.trim());
    const first = parts[0] || addr;
    const numMatch = first.match(/^(?!blok\s+\d+$)(.+?)\s+(\d+[a-zA-Z]?(?:\/\d+)?)$/i);
    return {
      label: addr,
      street: numMatch ? numMatch[1] : first,
      houseNumber: numMatch ? numMatch[2] : undefined,
      opstina: parts[1] || undefined,
      lat: coords.lat,
      lng: coords.lng,
    };
  };

  const [lockedDest, setLockedDest] = useState<LockedStreet | null>(() =>
    parseSavedLockedStreet(prefs.destination, prefs.endCoords)
  );
  const [lockedStart, setLockedStart] = useState<LockedStreet | null>(null);
  const [lockedHome, setLockedHome] = useState<LockedStreet | null>(() =>
    parseSavedLockedStreet(prefs.homeAddress, prefs.homeCoords)
  );
  const [lockedWork, setLockedWork] = useState<LockedStreet | null>(() =>
    parseSavedLockedStreet(prefs.workAddress, prefs.workCoords)
  );
  const [routeLockedFlash, setRouteLockedFlash] = useState<string | null>(null);
  const [hostFormatToast, setHostFormatToast] = useState<string | null>(null);
  const audioRequestSeqRef = useRef<number>(0);
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState<boolean>(false);
  const [activeAudioData, setActiveAudioData] = useState<string | undefined>(undefined);
  const [activeTranscript, setActiveTranscript] = useState<string>('');
  const [activeAudioTitle, setActiveAudioTitle] = useState<string>(() =>
    prefs.destination
      ? `${prefs.startPoint || 'Moja lokacija'} → ${prefs.destination}`
      : prefs.startPoint || 'Moja lokacija'
  );
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [isAutoDockOpen, setIsAutoDockOpen] = useState(false);
  const [isHudPlaying, setIsHudPlaying] = useState(false);
  const isHudPlayingRef = useRef(false);
  const [autoPlayTrigger, setAutoPlayTrigger] = useState(0);
  const [externalTogglePlaySeq, setExternalTogglePlaySeq] = useState(0);
  const [externalPauseSeq, setExternalPauseSeq] = useState(0);
  const [externalResumeSeq, setExternalResumeSeq] = useState(0);
  const [externalNextSeq, setExternalNextSeq] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState<PlaybackProgressInfo>({
    currentTime: 0,
    duration: 0,
    activeChapterIndex: 0,
    activeChapter: null,
  });

  // Throttled GPS state
  const lastGpsUpdateMsRef = useRef<number>(0);
  const lastGpsCoordsRef = useRef<{ lat: number; lng: number } | null>(prefs.coords || null);
  const spokenAlertIdsRef = useRef<Set<string>>(new Set());
  const [proactiveBeaconAlert, setProactiveBeaconAlert] = useState<ServiceAlertItem | null>(null);
  const [transitLinesInput, setTransitLinesInput] = useState<string>(() =>
    (prefs.favoriteTransitLines || ['25', '71', '65']).join(', ')
  );
  const [savedStreetsInput, setSavedStreetsInput] = useState<string>(() =>
    (prefs.savedStreets || []).join(', ')
  );
  const refreshAnalytics = () => {};

  const playRadioBeaconChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = () => {
        try {
          ctx.close();
        } catch {
          // ignore
        }
      };
      osc.start(now);
      osc.stop(now + 0.29);
    } catch {
      // ignore audio context restrictions
    }
  };

  const checkAndTriggerProactiveBeacon = (
    alerts: ServiceAlertItem[],
    proactiveEnabled: boolean
  ) => {
    if (!proactiveEnabled) return;
    const hit = alerts.find(
      (a) =>
        a.isAhead !== false &&
        a.urgencyLevel === 1 &&
        a.distanceMeters !== undefined &&
        a.distanceMeters <= 500 &&
        !spokenAlertIdsRef.current.has(a.id)
    );
    if (!hit) return;
    spokenAlertIdsRef.current.add(hit.id);
    setProactiveBeaconAlert(hit);
    playRadioBeaconChime();
    trackAppEvent('proactive_alert_spoken', `${hit.category}: ${hit.ulica}`, {
      alertId: hit.id,
      distanceMeters: hit.distanceMeters,
    });
    refreshAnalytics();

    try {
      if ('speechSynthesis' in window) {
        const wasMainHudPlaying = isHudPlayingRef.current;
        if (wasMainHudPlaying) {
          setExternalPauseSeq((s) => s + 1);
        }
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
        const utter = new SpeechSynthesisUtterance(
          `Pažnja na trasi ispred vas, na manje od 500 metara: ${hit.spokenText}`
        );
        utter.lang = 'sr-RS';
        utter.rate = 1.04;
        const resumeIfNeeded = () => {
          if (wasMainHudPlaying) {
            setExternalResumeSeq((s) => s + 1);
          }
        };
        utter.onend = resumeIfNeeded;
        utter.onerror = resumeIfNeeded;
        window.speechSynthesis.speak(utter);
      }
    } catch {
      // ignore speech errors
    }
  };

  // News Feed State (učitava odmah iz lokalnog keša statičkog feeda za <200ms i offline podršku)
  const [scrapedArticles, setScrapedArticles] = useState<ScrapedArticle[]>(() => {
    const cached = readCachedStaticFeed();
    return cached && cached.articles.length > 0 ? cached.articles : INITIAL_SNAPSHOT_ARTICLES;
  });
  const [isScraping, setIsScraping] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    const cached = readCachedStaticFeed();
    return cached?.lastSyncedAt || null;
  });
  const [isOfflineFeed, setIsOfflineFeed] = useState<boolean>(() => {
    const cached = readCachedStaticFeed();
    return Boolean(cached?.isOfflineFallback);
  });
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      const doneFlag =
        localStorage.getItem(ONBOARDING_DONE_KEY) === '1' ||
        localStorage.getItem('commute_companion_onboarding_done_v1') === '1';
      if (doneFlag) return false;

      const rawPrefs = localStorage.getItem(STORAGE_KEYS.PREFS);
      if (rawPrefs) {
        const parsed = JSON.parse(rawPrefs);
        const hasCustomHome =
          Boolean(parsed.homeAddress) &&
          parsed.homeAddress !== DEFAULT_ROUTE_PRESETS[1].startPoint;
        const hasCustomWork =
          Boolean(parsed.workAddress) &&
          parsed.workAddress !== DEFAULT_ROUTE_PRESETS[1].destination;
        const hasCustomTopicOrder =
          Array.isArray(parsed.interests) &&
          parsed.interests.length > 0 &&
          parsed.interests.join('|') !== INTERESTS.join('|');
        if (hasCustomHome || hasCustomWork || hasCustomTopicOrder) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  });
  const lastSyncMsRef = useRef<number>(0);
  const [deepDiveLoadingId, setDeepDiveLoadingId] = useState<string | null>(null);

  const [liveFeedMeta, setLiveFeedMeta] = useState(() => getLiveServiceFeedMeta());
  const [isRefreshingServices, setIsRefreshingServices] = useState(false);

  const liveRadar = useMemo(() => {
    return buildThreePointServiceRadar({
      prefs,
      routeCoords: liveRouteCoords,
      routeStreetNames: liveRouteStreets,
      userCurrentCoords: lastGpsCoordsRef.current || prefs.coords,
    });
  }, [prefs, liveRouteCoords, liveRouteStreets, liveFeedMeta]);

  const displayedServiceRadar = liveRadar.alerts;

  // Trigger Glasovni alarm (<500m) on live route radar even when audio Briefing hasn't been started
  useEffect(() => {
    if (displayedServiceRadar.length > 0 && prefs.proactiveAudioAlerts !== false) {
      checkAndTriggerProactiveBeacon(displayedServiceRadar, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedServiceRadar, prefs.proactiveAudioAlerts]);
  const [dismissedHomeAlertIds, setDismissedHomeAlertIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('cc_dismissed_home_alerts_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const dismissHomeAlert = (id: string) => {
    setDismissedHomeAlertIds((prev) => {
      const next = Array.from(new Set([...prev, id]));
      try {
        localStorage.setItem('cc_dismissed_home_alerts_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const homeUrgentAlerts = useMemo(
    () =>
      displayedServiceRadar.filter(
        (a) =>
          (a.category === 'struja' || a.category === 'voda') &&
          !dismissedHomeAlertIds.includes(a.id)
      ),
    [displayedServiceRadar, dismissedHomeAlertIds]
  );

  const routeDirectAlerts = useMemo(
    () =>
      displayedServiceRadar.filter(
        (a) => a.category !== 'struja' && a.category !== 'voda'
      ),
    [displayedServiceRadar]
  );

  const displayedParkingGarages = useMemo(
    () =>
      (prefs.transportMode || 'car') === 'car' ? liveRadar.parkingGarages || [] : [],
    [prefs.transportMode, liveRadar.parkingGarages]
  );

  const mapRadarItems = useMemo(
    () => [...routeDirectAlerts, ...displayedParkingGarages],
    [routeDirectAlerts, displayedParkingGarages]
  );
  const displayedTrafficNodes =
    liveRadar.trafficNodes.length > 0 ? liveRadar.trafficNodes : report?.trafficNodes || [];
  const currentRouteTitle = prefs.destination
    ? `${prefs.startPoint || 'Moja lokacija'} → ${prefs.destination}`
    : prefs.startPoint || 'Beograd';

  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false);
  const [customSourceUrlInput, setCustomSourceUrlInput] = useState('');
  const [isAddingCustomSource, setIsAddingCustomSource] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const requestHomeNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const res = await Notification.requestPermission();
      setNotifPermission(res);
    } catch {
      // ignore
    }
  };

  // Pošalji pravo sistemsko obaveštenje na telefon kada struja/voda pogađa kućnu adresu
  useEffect(() => {
    if (homeUrgentAlerts.length === 0 || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    let notifiedIds: string[] = [];
    try {
      const raw = localStorage.getItem('cc_notified_home_alerts_v1');
      notifiedIds = raw ? JSON.parse(raw) : [];
    } catch {
      notifiedIds = [];
    }

    const fresh = homeUrgentAlerts.filter((a) => !notifiedIds.includes(a.id));
    if (fresh.length === 0) return;

    const nextIds = Array.from(new Set([...notifiedIds, ...fresh.map((a) => a.id)]));
    try {
      localStorage.setItem('cc_notified_home_alerts_v1', JSON.stringify(nextIds));
    } catch {
      // ignore
    }

    for (const alert of fresh) {
      const title = `Kućna adresa · ${alert.title}`;
      const options: NotificationOptions = {
        body: alert.spokenText,
        icon: './icon.svg',
        badge: './icon.svg',
        tag: `home-alert-${alert.id}`,
      };
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification(title, options))
          .catch(() => {
            try {
              new Notification(title, options);
            } catch {
              // ignore
            }
          });
      } else {
        try {
          new Notification(title, options);
        } catch {
          // ignore
        }
      }
    }
  }, [homeUrgentAlerts]);

  // Lokacijska detekcija: ako sam kod kuće, ne nudi mi prečicu za Kuću (već za Posao);
  // ako sam na poslu, ne nudi mi prečicu za Posao (već za Kuću).
  const isCurrentlyAtHome = useMemo(() => {
    const homeAddr = (prefs.homeAddress || '').trim().toLowerCase();
    const startAddr = (prefs.startPoint || '').trim().toLowerCase();
    if (homeAddr && startAddr && (startAddr === homeAddr || startAddr.includes(homeAddr.split(',')[0]))) {
      return true;
    }
    const activeOrigin = prefs.startCoords || lastGpsCoordsRef.current || prefs.coords;
    if (activeOrigin && prefs.homeCoords) {
      return haversineMeters(activeOrigin, prefs.homeCoords) <= 350;
    }
    return false;
  }, [prefs.homeAddress, prefs.startPoint, prefs.startCoords, prefs.coords, prefs.homeCoords]);

  const isCurrentlyAtWork = useMemo(() => {
    const workAddr = (prefs.workAddress || '').trim().toLowerCase();
    const startAddr = (prefs.startPoint || '').trim().toLowerCase();
    if (workAddr && startAddr && (startAddr === workAddr || startAddr.includes(workAddr.split(',')[0]))) {
      return true;
    }
    const activeOrigin = prefs.startCoords || lastGpsCoordsRef.current || prefs.coords;
    if (activeOrigin && prefs.workCoords) {
      return haversineMeters(activeOrigin, prefs.workCoords) <= 350;
    }
    return false;
  }, [prefs.workAddress, prefs.startPoint, prefs.startCoords, prefs.coords, prefs.workCoords]);

  const [homeNewsCategoryFilter, setHomeNewsCategoryFilter] = useState<string>('all');
  const [newsSortMode, setNewsSortMode] = useState<NewsSortMode>('important');
  const [listenedArticleMap, setListenedArticleMap] = useState<Record<string, number>>(() =>
    readListenedArticleMap()
  );
  const lastTrackedChapterIdxRef = useRef<number>(-1);
  const lastTrackedChapterObjRef = useRef<AudioChapter | null>(null);

  // Visible category tabs after "Sve vesti": only the first 5 categories chosen/ordered by the user so the bar is never cluttered
  const homeNewsCategories = useMemo(() => {
    const activeOrdered = (prefs.interests || []).filter((c) => INTERESTS.includes(c));
    const sourceList = activeOrdered.length > 0 ? activeOrdered : INTERESTS;
    return sourceList.slice(0, 5);
  }, [prefs.interests]);

  const normalizedAllArticles = useMemo(() => {
    const base =
      scrapedArticles.length > 0 ? scrapedArticles : report?.scrapedArticles || [];
    const hasStaticFeed = base.some((a) => a.fromStaticFeed || a.id?.startsWith('clu_'));

    if (hasStaticFeed) {
      return base.map((art) => ({
        ...art,
        category: INTERESTS.includes(art.category)
          ? art.category
          : classifyNewsCategory(art.title, art.summary || '', art.sourceGroup, 'Društvo'),
      }));
    }

    const mapped = base.map((art) => {
      if (art.id?.startsWith('snap-') && INTERESTS.includes(art.category)) {
        return art;
      }
      const normalizedCat = classifyNewsCategory(
        art.title,
        art.summary || '',
        art.sourceGroup,
        INTERESTS.includes(art.category) ? art.category : 'Društvo'
      );
      return {
        ...art,
        category: normalizedCat,
      };
    });

    const getMediaCount = (a: ScrapedArticle) =>
      Math.max(Number(a.mediaCount) || 1, a.relatedSources?.length || 1);

    const mergedByTitle = new Map<string, ScrapedArticle>();
    for (const art of [...mapped.filter((a) => getMediaCount(a) >= 4), ...INITIAL_SNAPSHOT_ARTICLES]) {
      const key = art.title.toLowerCase().slice(0, 42);
      const existing = mergedByTitle.get(key);
      if (!existing || getMediaCount(art) > getMediaCount(existing)) {
        mergedByTitle.set(key, art);
      }
    }
    return Array.from(mergedByTitle.values());
  }, [scrapedArticles, report?.scrapedArticles]);

  const markChapterArticlesAsListened = useCallback(
    (chapter: AudioChapter | null | undefined) => {
      if (!chapter || chapter.id === 'ch-1') return;
      const ids = new Set<string>(chapter.articleIds || []);
      if (chapter.leadTitle || chapter.articleUrl) {
        for (const art of normalizedAllArticles) {
          if (
            (chapter.leadTitle && art.title === chapter.leadTitle) ||
            (chapter.articleUrl && art.url && art.url === chapter.articleUrl)
          ) {
            ids.add(art.id);
          }
        }
      }
      if (ids.size > 0) {
        const toMark = Array.from(ids).filter((id) => !isArticleListened(id, listenedArticleMap));
        if (toMark.length > 0) {
          setListenedArticleMap(markArticlesAsListened(toMark));
        }
      }
    },
    [normalizedAllArticles, listenedArticleMap]
  );

  // Kada audio brifing završi čitanje određene vesti/poglavlja (ili pređe >= 75% poglavlja), zabeleži njen ID u localStorage
  useEffect(() => {
    if (!playbackProgress || playbackProgress.duration <= 0) return;
    const currentCh = playbackProgress.activeChapter;
    const currentIdx = playbackProgress.activeChapterIndex;

    // Ako je plejer prešao na naredno poglavlje dok je čitao, prethodno poglavlje je preslušano
    if (
      lastTrackedChapterObjRef.current &&
      currentIdx > lastTrackedChapterIdxRef.current &&
      lastTrackedChapterIdxRef.current >= 0
    ) {
      markChapterArticlesAsListened(lastTrackedChapterObjRef.current);
    }

    lastTrackedChapterIdxRef.current = currentIdx;
    lastTrackedChapterObjRef.current = currentCh;

    if (currentCh && currentCh.id !== 'ch-1') {
      const overallRatio = Math.min(1, playbackProgress.currentTime / playbackProgress.duration);
      const span = Math.max(0.05, currentCh.endRatio - currentCh.startRatio);
      const chapterRatio = (overallRatio - currentCh.startRatio) / span;
      if (chapterRatio >= 0.75) {
        markChapterArticlesAsListened(currentCh);
      }
    }
  }, [playbackProgress, markChapterArticlesAsListened]);

  const homeFeedArticles = useMemo(() => {
    const getMediaCount = (a: ScrapedArticle) =>
      Math.max(Number(a.mediaCount) || 1, a.relatedSources?.length || 1);

    const effectiveFilter =
      homeNewsCategoryFilter !== 'all' && homeNewsCategories.includes(homeNewsCategoryFilter)
        ? homeNewsCategoryFilter
        : 'all';

    const candidatePool =
      effectiveFilter !== 'all'
        ? normalizedAllArticles.filter((a) => a.category === effectiveFilter)
        : normalizedAllArticles.filter((a) => {
            if (a.category !== 'Vreme') return true;
            return (
              /(upozorenj|nepogod|oluj|meteoalarm|crveni|nevrem|poplav|orkansk|mećav)/i.test(
                `${a.title} ${a.summary || ''}`
              ) || getMediaCount(a) >= 3
            );
          });

    const sorted = sortArticlesForFeed(candidatePool, newsSortMode, listenedArticleMap);

    if (newsSortMode === 'important') {
      const unlistened = sorted.filter((a) => !isArticleListened(a.id, listenedArticleMap));
      const listened = sorted.filter((a) => isArticleListened(a.id, listenedArticleMap));
      return [
        ...enforceArticleSourceDiversity(unlistened, 2),
        ...enforceArticleSourceDiversity(listened, 2),
      ].slice(0, 24);
    }

    return enforceArticleSourceDiversity(sorted, 2).slice(0, 24);
  }, [normalizedAllArticles, homeNewsCategoryFilter, homeNewsCategories, newsSortMode, listenedArticleMap]);

  const handlePlayArticleSummary = (art: ScrapedArticle) => {
    const summaryText = art.summary
      ? `${art.sourceName}. ${art.title}. ${art.summary}`
      : `${art.sourceName}. ${art.title}.`;
    setActiveAudioTitle(art.title);
    setActiveAudioData(undefined);
    setActiveTranscript(summaryText);
    setAutoPlayTrigger((t) => t + 1);
    trackAppEvent('article_summary_played', `${art.sourceName}: ${art.title}`);
  };

  const handleRouteGeometryResolved = useCallback((geo: StreetRouteGeometry) => {
    if (geo.coordinates && geo.coordinates.length > 1) {
      setLiveRouteCoords((prev) =>
        prev.length === geo.coordinates.length &&
        prev[0]?.[0] === geo.coordinates[0]?.[0] &&
        prev[prev.length - 1]?.[0] === geo.coordinates[geo.coordinates.length - 1]?.[0]
          ? prev
          : geo.coordinates
      );
    }
    if (geo.streetNames && geo.streetNames.length > 0) {
      setLiveRouteStreets((prev) =>
        prev.join('|') === geo.streetNames!.join('|') ? prev : geo.streetNames!
      );
    }
  }, []);

  const flashRouteConfirmation = (label: string) => {
    setRouteLockedFlash(label);
    window.setTimeout(() => {
      setRouteLockedFlash((curr) => (curr === label ? null : curr));
    }, 3200);
  };

  const applyRouteEndpoints = async (
    nextStart: string,
    nextEnd: string,
    nextStartCoords: { lat: number; lng: number },
    nextEndCoords: { lat: number; lng: number },
    presetId?: string
  ) => {
    const nextPrefs: UserPreferences = {
      ...prefs,
      mode: 'manual',
      startPoint: nextStart,
      destination: nextEnd,
      coords: nextStartCoords,
      startCoords: nextStartCoords,
      endCoords: nextEndCoords,
      selectedPresetId: presetId,
    };

    const newTitle = `${nextStart} → ${nextEnd}`;
    setStartSearchInput(nextStart);
    setDestSearchInput(nextEnd);
    setPrefs(nextPrefs);
    lastGpsCoordsRef.current = nextStartCoords;
    flashRouteConfirmation(newTitle);
    setActiveAudioTitle((prevTitle) =>
      !report || prevTitle === report.routeTitle || prevTitle === 'Beograd'
        ? newTitle
        : prevTitle
    );

    try {
      const streetRoute = await fetchStreetRoute(nextStartCoords, nextEndCoords);
      setLiveRouteCoords(streetRoute.coordinates);
      setLiveRouteStreets(streetRoute.streetNames || []);
      const updatedRadar = buildThreePointServiceRadar({
        prefs: nextPrefs,
        routeCoords: streetRoute.coordinates,
        routeStreetNames: streetRoute.streetNames || [],
        userCurrentCoords: nextStartCoords,
      });
      setPrefs((p) => ({
        ...p,
        estimatedCommuteMinutes: streetRoute.durationMinutes,
        duration:
          p.adaptiveDuration !== false
            ? computeAdaptiveDuration(streetRoute.durationMinutes)
            : p.duration,
      }));
      setReport((prevReport) => {
        if (!prevReport) return prevReport;
        return {
          ...prevReport,
          routeTitle: newTitle,
          startCoords: nextStartCoords,
          endCoords: nextEndCoords,
          routeCoordinates: streetRoute.coordinates,
          routeStreetNames: streetRoute.streetNames || [],
          serviceRadar: updatedRadar.alerts,
          trafficNodes:
            updatedRadar.trafficNodes.length > 0
              ? updatedRadar.trafficNodes
              : prevReport.trafficNodes,
        };
      });
    } catch {
      // keep instant coordinates if offline
    }
  };

  // Izbor odredišta iz padajućeg menija: odmah zaključaj i postavi putanju na mapi
  const handleSelectLockedDestination = async (selected: LockedStreet) => {
    setLockedDest(selected);
    setDestSearchInput(selected.label);
    trackAppEvent('street_autocomplete_selected', selected.label);
    const startCoords = lockedStart
      ? { lat: lockedStart.lat, lng: lockedStart.lng }
      : prefs.startCoords || prefs.coords || { lat: 44.8206, lng: 20.4144 };
    const startLabel = lockedStart?.label || prefs.startPoint || 'Moja lokacija';

    let destCoords = { lat: selected.lat, lng: selected.lng };
    if (selected.houseNumber) {
      try {
        const g = await geocodeAddress(selected.label);
        if (g.found && typeof g.lat === 'number' && typeof g.lng === 'number') {
          destCoords = { lat: g.lat, lng: g.lng };
          setLockedDest({ ...selected, lat: g.lat, lng: g.lng });
        }
      } catch {
        // fallback to street center coords
      }
    }

    await applyRouteEndpoints(startLabel, selected.label, startCoords, destCoords);
  };

  // Izbor polazišta iz padajućeg menija: zaključaj i odmah ažuriraj putanju
  const handleSelectLockedStart = async (selected: LockedStreet) => {
    setLockedStart(selected);
    setStartSearchInput(selected.label);
    trackAppEvent('street_autocomplete_selected', `Start: ${selected.label}`);
    const endCoords = lockedDest
      ? { lat: lockedDest.lat, lng: lockedDest.lng }
      : prefs.endCoords || { lat: 44.8162, lng: 20.4603 };
    const endLabel = lockedDest?.label || prefs.destination || 'Trg Republike, Centar';
    await applyRouteEndpoints(
      selected.label,
      endLabel,
      { lat: selected.lat, lng: selected.lng },
      endCoords
    );
    setIsEditingStartPoint(false);
  };

  const handleRouteSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetDest = (lockedDest?.label || destSearchInput).trim();
    const targetStart =
      (lockedStart?.label || startSearchInput).trim() || prefs.startPoint || 'Moja lokacija';
    if (!targetDest || isRoutingSearch) return;

    setIsRoutingSearch(true);
    setErrorMsg(null);
    try {
      const [startGeo, endGeo] = await Promise.all([
        lockedStart
          ? Promise.resolve({
              found: true,
              lat: lockedStart.lat,
              lng: lockedStart.lng,
              displayName: lockedStart.label,
            })
          : targetStart.toLowerCase().includes('moja lokacija')
          ? Promise.resolve({
              found: true,
              lat: (lastGpsCoordsRef.current || prefs.coords || { lat: 44.8206, lng: 20.4144 }).lat,
              lng: (lastGpsCoordsRef.current || prefs.coords || { lat: 44.8206, lng: 20.4144 }).lng,
              displayName: 'Moja lokacija',
            })
          : geocodeAddress(targetStart),
        lockedDest
          ? Promise.resolve({
              found: true,
              lat: lockedDest.lat,
              lng: lockedDest.lng,
              displayName: lockedDest.label,
            })
          : geocodeAddress(targetDest),
      ]);

      const resolvedStartCoords =
        startGeo.found && typeof startGeo.lat === 'number' && typeof startGeo.lng === 'number'
          ? { lat: startGeo.lat, lng: startGeo.lng }
          : prefs.startCoords || prefs.coords || { lat: 44.8206, lng: 20.4144 };

      const resolvedEndCoords =
        endGeo.found && typeof endGeo.lat === 'number' && typeof endGeo.lng === 'number'
          ? { lat: endGeo.lat, lng: endGeo.lng }
          : prefs.endCoords || { lat: 44.8162, lng: 20.4603 };

      const cleanStartLabel = startGeo.displayName || targetStart;
      const cleanDestLabel = endGeo.displayName || targetDest;

      // Zaključaj prepoznatu ulicu tako da korisnik jasno vidi da je uneta promena registrovana
      if (!lockedDest && endGeo.found) {
        const parts = cleanDestLabel.split(',').map((s) => s.trim());
        setLockedDest({
          label: cleanDestLabel,
          street: parts[0] || cleanDestLabel,
          opstina: parts[1] || undefined,
          lat: resolvedEndCoords.lat,
          lng: resolvedEndCoords.lng,
        });
      }

      await applyRouteEndpoints(
        cleanStartLabel,
        cleanDestLabel,
        resolvedStartCoords,
        resolvedEndCoords
      );
      setIsEditingStartPoint(false);
    } finally {
      setIsRoutingSearch(false);
    }
  };

  const handleGoToWork = async () => {
    const workAddr = prefs.workAddress || 'Trg Republike, Centar';
    let workCoords = prefs.workCoords;
    if (!workCoords) {
      const g = await geocodeAddress(workAddr);
      workCoords =
        g.found && g.lat && g.lng ? { lat: g.lat, lng: g.lng } : { lat: 44.8162, lng: 20.4603 };
    }
    const startC = lockedStart
      ? { lat: lockedStart.lat, lng: lockedStart.lng }
      : lastGpsCoordsRef.current || prefs.startCoords || prefs.coords || { lat: 44.8176, lng: 20.4569 };
    const startLabel = lockedStart?.label || prefs.startPoint || 'Moja lokacija';
    const parts = workAddr.split(',').map((s) => s.trim());
    setLockedDest({
      label: workAddr,
      street: parts[0] || workAddr,
      opstina: parts[1] || undefined,
      lat: workCoords.lat,
      lng: workCoords.lng,
    });
    trackAppEvent('quick_commute_work', `${startLabel} → ${workAddr}`);
    await applyRouteEndpoints(startLabel, workAddr, startC, workCoords);
  };

  const handleGoHome = async () => {
    const homeAddr = prefs.homeAddress || 'Novi Beograd (Opština)';
    let homeCoords = prefs.homeCoords;
    if (!homeCoords) {
      const g = await geocodeAddress(homeAddr);
      homeCoords =
        g.found && g.lat && g.lng ? { lat: g.lat, lng: g.lng } : { lat: 44.8206, lng: 20.4144 };
    }
    const startC = lockedStart
      ? { lat: lockedStart.lat, lng: lockedStart.lng }
      : lastGpsCoordsRef.current || prefs.startCoords || prefs.coords || { lat: 44.8176, lng: 20.4569 };
    const startLabel = lockedStart?.label || prefs.startPoint || 'Moja lokacija';
    const parts = homeAddr.split(',').map((s) => s.trim());
    setLockedDest({
      label: homeAddr,
      street: parts[0] || homeAddr,
      opstina: parts[1] || undefined,
      lat: homeCoords.lat,
      lng: homeCoords.lng,
    });
    trackAppEvent('quick_commute_home', `${startLabel} → ${homeAddr}`);
    await applyRouteEndpoints(startLabel, homeAddr, startC, homeCoords);
  };

  // Resetuje mapu i polazište na moju trenutnu lokaciju (ako cilj nije zadat, ostavlja čistu mapu oko mene)
  const handleResetToMyLocation = async (clearDest = false) => {
    setLockedStart(null);
    let myCoords = lastGpsCoordsRef.current || prefs.coords || { lat: 44.8176, lng: 20.4569 };
    try {
      const pos = await getCurrentPosition();
      myCoords = {
        lat: Number(pos.coords.latitude.toFixed(5)),
        lng: Number(pos.coords.longitude.toFixed(5)),
      };
      lastGpsCoordsRef.current = myCoords;
    } catch {
      // koristi poslednju poznatu lokaciju
    }

    if (clearDest || !prefs.endCoords) {
      setLockedDest(null);
      setDestSearchInput('');
      setStartSearchInput('Moja lokacija');
      setLiveRouteCoords([]);
      setLiveRouteStreets([]);
      setRouteLockedFlash(null);
      setPrefs((p) => ({
        ...p,
        startPoint: 'Moja lokacija',
        destination: '',
        coords: myCoords,
        startCoords: myCoords,
        endCoords: undefined,
      }));
      return;
    }

    await applyRouteEndpoints(
      'Moja lokacija',
      destSearchInput.trim() || prefs.destination || '',
      myCoords,
      prefs.endCoords
    );
  };

  const handleUseMyLocationAsStart = () => handleResetToMyLocation(false);

  const handleReverseRouteDirection = async () => {
    if (!prefs.destination || !prefs.endCoords) return;
    const nextStart = prefs.destination;
    const nextEnd = prefs.startPoint || 'Moja lokacija';
    const nextStartCoords = prefs.endCoords;
    const nextEndCoords = prefs.startCoords || prefs.coords || { lat: 44.8176, lng: 20.4569 };

    const parts = nextEnd.split(',').map((s) => s.trim());
    setLockedDest({
      label: nextEnd,
      street: parts[0] || nextEnd,
      opstina: parts[1] || undefined,
      lat: nextEndCoords.lat,
      lng: nextEndCoords.lng,
    });
    setLockedStart(null);

    trackAppEvent('route_reversed', `${nextStart} → ${nextEnd}`);
    await applyRouteEndpoints(nextStart, nextEnd, nextStartCoords, nextEndCoords);
  };

  const handleRefreshServiceSources = async (triggerBackend = false) => {
    setIsRefreshingServices(true);
    try {
      await refreshLiveServiceFeed({ triggerBackendScrape: triggerBackend });
      setLiveFeedMeta(getLiveServiceFeedMeta());
      setReport((prevReport) => {
        if (!prevReport) return prevReport;
        const updatedRadar = buildThreePointServiceRadar({
          prefs,
          routeCoords: prevReport.routeCoordinates,
          routeStreetNames: prevReport.routeStreetNames || [],
          userCurrentCoords: lastGpsCoordsRef.current || prefs.coords,
        });
        checkAndTriggerProactiveBeacon(
          updatedRadar.alerts,
          prefs.proactiveAudioAlerts !== false
        );
        return {
          ...prevReport,
          serviceRadar: updatedRadar.alerts,
          trafficNodes:
            updatedRadar.trafficNodes.length > 0
              ? updatedRadar.trafficNodes
              : prevReport.trafficNodes,
        };
      });
    } finally {
      setIsRefreshingServices(false);
    }
  };

  const [isOffline, setIsOffline] = useState<boolean>(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  );

  useEffect(() => {
    trackAppEvent('session_started', 'Nova sesija');
    loadOsmBelgradeStreets();
    handleRefreshServiceSources(false);

    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    trackAppEvent('tab_viewed', activeTab, { tab: activeTab });
  }, [activeTab]);

  useEffect(() => {
    if (isAutoDockOpen) {
      trackAppEvent('autodock_opened', 'Auto-Dock režim vožnje');
    }
  }, [isAutoDockOpen]);

  // Persist user preferences & synchronize dark/light CSS theme class on <html>
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify(prefs));
    } catch {
      // ignore storage quota errors
    }
    if (typeof document !== 'undefined') {
      const isDark = prefs.darkMapTheme !== false;
      document.documentElement.classList.toggle('light-app-theme', !isDark);
    }
  }, [prefs]);

  // Battery-friendly throttled GPS watcher (45s / 180m threshold, 0% server cost)
  useEffect(() => {
    if (prefs.backgroundLocationEnabled === false || !('geolocation' in navigator)) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const nextCoords = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        const prevCoords = lastGpsCoordsRef.current;
        const movedMeters = prevCoords
          ? haversineMeters(prevCoords, nextCoords)
          : 9999;

        // Throttle updates: at least 45s elapsed OR moved >= 180m
        if (now - lastGpsUpdateMsRef.current < 45000 && movedMeters < 180) {
          return;
        }

        lastGpsUpdateMsRef.current = now;
        lastGpsCoordsRef.current = nextCoords;
        trackAppEvent('location_radar_ping', `${nextCoords.lat}, ${nextCoords.lng}`);

        setPrefs((prev) => ({
          ...prev,
          coords: nextCoords,
        }));

        // Dynamically re-prioritize 3-Point Service Radar ("Pravilo Šoferšajbne": Ispred vas vs. Prošli ste)
        setReport((prevReport) => {
          if (!prevReport) return prevReport;
          const updatedRadar = buildThreePointServiceRadar({
            prefs: {
              ...prefs,
              coords: nextCoords,
              startCoords: prevReport.startCoords || prefs.startCoords || nextCoords,
              endCoords: prevReport.endCoords || prefs.endCoords || nextCoords,
            },
            routeCoords: prevReport.routeCoordinates,
            routeStreetNames: prevReport.routeStreetNames || [],
            userCurrentCoords: nextCoords,
          });
          checkAndTriggerProactiveBeacon(
            updatedRadar.alerts,
            prefs.proactiveAudioAlerts !== false
          );
          return {
            ...prevReport,
            serviceRadar: updatedRadar.alerts,
            trafficNodes: updatedRadar.trafficNodes,
          };
        });
      },
      () => {
        // GPS unavailable in browser — street route remains active
      },
      {
        enableHighAccuracy: false,
        maximumAge: 45000,
        timeout: 12000,
      }
    );

    return () => {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.backgroundLocationEnabled, prefs.transportMode]);

  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) {
        return rej(new Error('Geolokacija nije podržana u ovom pretraživaču.'));
      }
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 });
    });
  };

  const handleToggleSourceGroup = (group: SourceGroupId) => {
    setPrefs((prev) => {
      const current = prev.sourceGroups || ['domaci_info', 'it_tech', 'saobracaj_servisi'];
      const exists = current.includes(group);
      if (exists && current.length === 1) return prev;
      return {
        ...prev,
        sourceGroups: exists ? current.filter((g) => g !== group) : [...current, group],
      };
    });
  };

  const handleScanPortals = async (options?: { forceRefresh?: boolean; silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    const forceRefresh = Boolean(options?.forceRefresh);
    if (!silent) {
      setIsScraping(true);
      setErrorMsg(null);
    }
    try {
      const res = await fetchScrapedArticlesWithMeta(
        prefs.sourceGroups || ['domaci_info', 'it_tech', 'saobracaj_servisi'],
        prefs.customUrls || [],
        forceRefresh
      );
      setScrapedArticles((prev) => {
        if (!silent || prev.length === 0) return res.articles;
        // Preserve user manual deselections/selections during silent background sync
        const prevSelectionByTitle = new Map<string, boolean>(
          prev.map((a): [string, boolean] => [a.title, a.selected])
        );
        return res.articles.map((a) =>
          prevSelectionByTitle.has(a.title)
            ? { ...a, selected: Boolean(prevSelectionByTitle.get(a.title)) }
            : a
        );
      });
      if (res.lastSyncedAt) {
        setLastSyncedAt(res.lastSyncedAt);
      }
      setIsOfflineFeed(Boolean(res.isOfflineFallback));
      lastSyncMsRef.current = Date.now();
    } catch (err: any) {
      setIsOfflineFeed(true);
      if (!silent) {
        setErrorMsg(err?.message || 'Greška pri učitavanju vesti.');
      }
    } finally {
      if (!silent) {
        setIsScraping(false);
      }
    }
  };

  // Industry-standard background sync:
  // 1) Instant snapshot fetch on app entry
  // 2) Silent polling every 8 minutes while idle
  // 3) Revalidation on screen wake / tab visibilitychange (if > 4 mins since last sync)
  // 4) Respects user toggle (autoScanOnLoad) and browser Data Saver (navigator.connection.saveData)
  useEffect(() => {
    const isSystemDataSaver = Boolean((navigator as any)?.connection?.saveData);
    if (prefs.autoScanOnLoad === false || isSystemDataSaver) {
      return;
    }

    // Initial instant load from server snapshot cache
    if (lastSyncMsRef.current === 0) {
      handleScanPortals({ forceRefresh: false, silent: scrapedArticles.length > 0 });
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleScanPortals({ forceRefresh: true, silent: true });
      }
    }, 3 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastSyncMsRef.current > 3 * 60 * 1000
      ) {
        handleScanPortals({ forceRefresh: true, silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.autoScanOnLoad, prefs.sourceGroups]);

  const handleAddCustomUrl = async (url: string) => {
    setErrorMsg(null);
    try {
      const extracted = await scrapeCustomUrl(url);
      if (extracted.length > 0) {
        setScrapedArticles((prev) => [...extracted, ...prev]);
        setPrefs((prev) => ({
          ...prev,
          customUrls: Array.from(new Set([url, ...(prev.customUrls || [])])).slice(0, 10),
        }));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Neuspešno učitavanje članka sa unetog linka.');
    }
  };

  const handleToggleArticleSelect = (id: string) => {
    setScrapedArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a))
    );
  };

  const handleSelectAllArticles = (selectAll: boolean) => {
    setScrapedArticles((prev) => prev.map((a) => ({ ...a, selected: selectAll })));
  };

  const handleSelectBreakingArticles = () => {
    setScrapedArticles((prev) =>
      prev.map((a, idx) => ({
        ...a,
        selected: Boolean(
          a.isBreakingCluster || (a.mediaCount && a.mediaCount >= 2) || (a.importanceScore && a.importanceScore >= 72) || idx < 5
        ),
      }))
    );
  };

  const handleToggleHostFormat = (targetFormat?: 'duo' | 'solo') => {
    const nextFormat = targetFormat || (prefs.hostFormat === 'duo' ? 'solo' : 'duo');
    if (nextFormat === prefs.hostFormat && targetFormat) return;

    setPrefs((p) => ({ ...p, hostFormat: nextFormat }));
    const toastLabel =
      nextFormat === 'duo'
        ? 'Duo režim: 2 spikera (Jelena i Milan)'
        : 'Solo režim: 1 spiker';
    setHostFormatToast(toastLabel);
    window.setTimeout(() => {
      setHostFormatToast((curr) => (curr === toastLabel ? null : curr));
    }, 2800);

    if (report) {
      const converted = convertReportHostFormat(report, nextFormat);
      setReport(converted);
      const isMainReportActive =
        !activeAudioTitle ||
        activeAudioTitle === report.routeTitle ||
        activeAudioTitle === 'Personalizovani Audio Izveštaj';
      if (isMainReportActive) {
        setActiveAudioData(undefined);
        setActiveTranscript(converted.transcript);
        if (isHudPlayingRef.current) {
          setAutoPlayTrigger((t) => t + 1);
        }
      }
    }
  };

  const handleTriggerDeepDive = (article: ScrapedArticle) => {
    if (deepDiveLoadingId) return;
    ++audioRequestSeqRef.current;
    setErrorMsg(null);

    if (article.id) {
      setListenedArticleMap(markArticlesAsListened(article.id));
    }

    const queueSource = homeFeedArticles.length > 0 ? homeFeedArticles : normalizedAllArticles;
    const continuous = buildContinuousBriefingFromArticle(article, queueSource, 6);

    const turn: ConversationTurn = {
      id: `dd-${Date.now()}`,
      role: 'assistant',
      text: `[BRIFING · ${article.sourceName}] ${continuous.transcript}`,
      timestamp: new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }),
      audioData: '',
    };
    setConversation((prev) => [turn, ...prev]);
    setActiveAudioTitle(continuous.title);
    setActiveAudioData('');
    setActiveTranscript(continuous.transcript);
    setAutoPlayTrigger((t) => t + 1);
    setActiveTab('hud');
    trackAppEvent(
      'article_briefing_played',
      `${article.sourceName}: ${article.title} (${article.aiBriefing ? 'AI' : 'fallback'})`
    );
  };

  const handleCompleteOnboarding = (result: OnboardingCompletionResult) => {
    const nextHomeAddr = result.homeAddress || prefs.homeAddress;
    const nextHomeCoords = result.homeLocked
      ? { lat: result.homeLocked.lat, lng: result.homeLocked.lng }
      : prefs.homeCoords;
    const nextWorkAddr = result.workAddress || prefs.workAddress;
    const nextWorkCoords = result.workLocked
      ? { lat: result.workLocked.lat, lng: result.workLocked.lng }
      : prefs.workCoords;

    if (result.homeLocked) {
      setLockedHome(result.homeLocked);
    }
    if (result.workLocked) {
      setLockedWork(result.workLocked);
    }

    setPrefs((prev) => ({
      ...prev,
      interests: result.orderedCategories,
      homeAddress: nextHomeAddr,
      homeCoords: nextHomeCoords,
      workAddress: nextWorkAddr,
      workCoords: nextWorkCoords,
      categoryOrderVersion: 'v4.53',
    }));
    setShowOnboarding(false);
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
      localStorage.setItem('commute_companion_onboarding_done_v1', '1');
    } catch {
      // ignore
    }
    trackAppEvent('onboarding_completed', result.orderedCategories.slice(0, 5).join(', '));
    if (result.startBriefing) {
      window.setTimeout(() => {
        handleStartBriefing();
      }, 60);
    }
  };

  const handleSkipOnboarding = () => {
    setShowOnboarding(false);
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
      localStorage.setItem('commute_companion_onboarding_done_v1', '1');
    } catch {
      // ignore
    }
    trackAppEvent('onboarding_skipped', 'default');
  };

  const [isQuickOrderingCategories, setIsQuickOrderingCategories] = useState(false);
  const [quickOrderedCategories, setQuickOrderedCategories] = useState<string[]>([]);

  const toggleInterest = (interest: string) => {
    setPrefs((prev) => {
      const exists = prev.interests.includes(interest);
      if (exists && prev.interests.length === 1) return prev;
      return {
        ...prev,
        interests: exists
          ? prev.interests.filter((item) => item !== interest)
          : [...prev.interests, interest],
      };
    });
  };

  const moveCategoryPriority = (interest: string, direction: 'up' | 'down') => {
    setPrefs((prev) => {
      const currentList = prev.interests.length > 0 ? [...prev.interests] : [...INTERESTS];
      const idx = currentList.indexOf(interest);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentList.length) return prev;
      const nextList = [...currentList];
      const [moved] = nextList.splice(idx, 1);
      nextList.splice(targetIdx, 0, moved);
      return {
        ...prev,
        interests: nextList,
      };
    });
  };

  const handleQuickOrderCategoryTap = (interest: string) => {
    setQuickOrderedCategories((prevOrder) => {
      const exists = prevOrder.includes(interest);
      const nextOrder = exists
        ? prevOrder.filter((item) => item !== interest)
        : [...prevOrder, interest];
      if (nextOrder.length > 0) {
        setPrefs((p) => ({
          ...p,
          interests: nextOrder,
        }));
      }
      return nextOrder;
    });
  };

  const resetDefaultCategoryOrder = () => {
    setIsQuickOrderingCategories(false);
    setQuickOrderedCategories([]);
    setPrefs((prev) => ({
      ...prev,
      interests: [...INTERESTS],
    }));
  };

  const handleStartBriefing = async (
    overridePreset?: RoutePreset,
    useCuratedArticles?: ScrapedArticle[],
    openAutoDockWhenReady = false
  ) => {
    const reqId = ++audioRequestSeqRef.current;
    setLoading(true);
    setErrorMsg(null);
    setStatusMessage('Učitavanje najnovijih vesti sa odabranih portala...');

    try {
      const currentPrefs: UserPreferences = overridePreset
        ? {
            ...prefs,
            mode: 'manual',
            selectedPresetId: overridePreset.id,
            startPoint: overridePreset.startPoint,
            destination: overridePreset.destination,
            coords: overridePreset.startCoords,
            startCoords: overridePreset.startCoords,
            endCoords: overridePreset.endCoords,
          }
        : { ...prefs };

      if (currentPrefs.mode === 'live') {
        setStatusMessage('Preuzimanje GPS lokacije...');
        try {
          const pos = await getCurrentPosition();
          currentPrefs.coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          currentPrefs.startCoords = currentPrefs.coords;
        } catch {
          currentPrefs.coords = currentPrefs.coords || { lat: 44.8176, lng: 20.4633 };
          currentPrefs.startCoords = currentPrefs.coords;
        }
      } else {
        if (!currentPrefs.startPoint?.trim()) {
          currentPrefs.startPoint = 'Moja lokacija';
        }
        if (currentPrefs.destination?.trim()) {
          setStatusMessage('Pronalaženje uličnih koordinata...');
          const [sGeo, eGeo] = await Promise.all([
            currentPrefs.startPoint.toLowerCase().includes('moja lokacija')
              ? Promise.resolve({ found: false } as { found: boolean; lat?: number; lng?: number })
              : geocodeAddress(currentPrefs.startPoint),
            geocodeAddress(currentPrefs.destination),
          ]);
          if (sGeo.found && sGeo.lat && sGeo.lng) {
            currentPrefs.startCoords = { lat: sGeo.lat, lng: sGeo.lng };
            currentPrefs.coords = currentPrefs.startCoords;
          }
          if (eGeo.found && eGeo.lat && eGeo.lng) {
            currentPrefs.endCoords = { lat: eGeo.lat, lng: eGeo.lng };
          }
        }
      }

      if (reqId !== audioRequestSeqRef.current) return;

      setStatusMessage(
        currentPrefs.hostFormat === 'duo'
          ? 'Priprema vesti i Radio Duo razgovora (Jelena i Milan)...'
          : 'Priprema vesti i vašeg audio brifinga...'
      );

      const articlesPayload =
        useCuratedArticles ||
        (scrapedArticles.filter((a) => a.selected).length > 0
          ? scrapedArticles.filter((a) => a.selected)
          : undefined);

      const generatedReport = await generateNewsReport(currentPrefs, articlesPayload);
      if (reqId !== audioRequestSeqRef.current) return;

      saveCachedBriefingPackage(generatedReport);
      setReport(generatedReport);
      if (generatedReport.scrapedArticles && generatedReport.scrapedArticles.length > 0) {
        setScrapedArticles(generatedReport.scrapedArticles);
      }
      setActiveAudioData(generatedReport.audioData);
      setActiveTranscript(generatedReport.transcript);
      setActiveAudioTitle(generatedReport.routeTitle || 'Personalizovani Audio Izveštaj');
      setConversation([]);
      setAutoPlayTrigger((t) => t + 1);
      setActiveTab('hud');
      if (openAutoDockWhenReady) {
        setIsAutoDockOpen(true);
      }
      if (typeof window !== 'undefined' && !openAutoDockWhenReady) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      trackAppEvent(
        'briefing_started',
        `${currentPrefs.pacingMode || 'commute_adaptive'} · ${currentPrefs.transportMode || 'car'}`,
        {
          pacingMode: currentPrefs.pacingMode || 'commute_adaptive',
          transportMode: currentPrefs.transportMode || 'car',
          hostFormat: currentPrefs.hostFormat || 'duo',
          duration: currentPrefs.duration,
          route: generatedReport.routeTitle,
        }
      );
      refreshAnalytics();

      setReportHistory((prev) => {
        const updated = [generatedReport, ...prev.filter((r) => r.id !== generatedReport.id)].slice(
          0,
          5
        );
        try {
          localStorage.setItem(STORAGE_KEYS.REPORT_HISTORY, JSON.stringify(updated));
        } catch {
          try {
            const lightweight = updated.map((r, i) => (i === 0 ? r : { ...r, audioData: undefined }));
            localStorage.setItem(STORAGE_KEYS.REPORT_HISTORY, JSON.stringify(lightweight));
          } catch {
            // ignore
          }
        }
        return updated;
      });
    } catch (err: any) {
      if (reqId === audioRequestSeqRef.current) {
        // Offline-first fallback: nastavi čitanje iz poslednjeg keširanog tekstualnog paketa brifinga bez pucanja
        const cachedPkg = readCachedBriefingPackage() || reportHistory[0];
        if (cachedPkg) {
          setIsOfflineFeed(true);
          setReport(cachedPkg);
          setActiveAudioData(cachedPkg.audioData);
          setActiveTranscript(cachedPkg.transcript);
          setActiveAudioTitle(cachedPkg.routeTitle || 'Personalizovani Audio Izveštaj');
          setAutoPlayTrigger((t) => t + 1);
          setActiveTab('hud');
          if (openAutoDockWhenReady) {
            setIsAutoDockOpen(true);
          }
        } else {
          setErrorMsg(err?.message || 'Došlo je do greške prilikom generisanja brifinga.');
        }
      }
    } finally {
      if (reqId === audioRequestSeqRef.current) {
        setLoading(false);
        setStatusMessage('');
      }
    }
  };

  const handleExpandChapter = (chapter: AudioChapter) => {
    if (!chapter.expandedText) return;
    audioRequestSeqRef.current += 1;
    setActiveAudioTitle(chapter.expandedTitle || `${chapter.title} (Ceo blok)`);
    setActiveAudioData(undefined);
    setActiveTranscript(chapter.expandedText);
    setAutoPlayTrigger((t) => t + 1);
    trackAppEvent('chapter_expanded', chapter.category, {
      chapterId: chapter.id,
      category: chapter.category,
      title: chapter.title,
    });
    refreshAnalytics();
  };

  const handlePlayServiceAlert = (alert: ServiceAlertItem) => {
    audioRequestSeqRef.current += 1;
    const zoneLabel =
      alert.zone === 'start' ? 'Polazište' : alert.zone === 'route' ? 'Na trasi' : 'Cilj';
    setActiveAudioTitle(`[${zoneLabel} · ${alert.category}] ${alert.title}`);
    setActiveAudioData(undefined);
    setActiveTranscript(alert.spokenText || alert.title);
    setAutoPlayTrigger((t) => t + 1);
    trackAppEvent('service_alert_inspected', `${alert.category}: ${alert.ulica}`, {
      alertId: alert.id,
      zone: alert.zone,
      category: alert.category,
    });
    refreshAnalytics();
  };

  const handleAskFollowUp = async (question: string) => {
    if (!question.trim() || isAsking) return;
    setIsAsking(true);
    setErrorMsg(null);
    trackAppEvent('voice_question_asked', question.slice(0, 48));
    refreshAnalytics();

    const userTurn: ConversationTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
      timestamp: new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }),
    };
    setConversation((prev) => [userTurn, ...prev]);

    try {
      const response = await answerFollowUp(question, prefs, currentRouteTitle, report, {
        articles: homeFeedArticles.length > 0 ? homeFeedArticles : scrapedArticles,
        urgentAlerts: [...homeUrgentAlerts, ...routeDirectAlerts],
        routeSummary:
          liveRouteStreets.length > 0
            ? {
                streets: liveRouteStreets,
              }
            : undefined,
        coords: prefs.startCoords || prefs.homeCoords,
      });
      const assistantTurn: ConversationTurn = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: response.text,
        timestamp: new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }),
        audioData: response.audioData,
        sources: response.sources,
      };
      setConversation((prev) => [assistantTurn, ...prev]);

      setActiveAudioTitle(`Odgovor: ${question.slice(0, 38)}`);
      setActiveAudioData(response.audioData);
      setActiveTranscript(response.text);
      setAutoPlayTrigger((t) => t + 1);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Neuspešna obrada glasovnog pitanja.');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Clean Top Bar */}
      <header className="sticky top-0 z-30 bg-[#090d16]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('hud');
              }}
              className="text-base sm:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 font-display"
            >
              Putni Vodič
            </a>
            {(isOffline || isOfflineFeed) && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] font-semibold text-amber-300 whitespace-nowrap shrink-0"
                title="Podaci i audio brifing se čitaju iz lokalnog keša (režim bez mreže)"
              >
                <WifiOff className="w-3 h-3 shrink-0" />
                <span>Offline · keširano</span>
              </span>
            )}
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => setActiveTab('hud')}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'hud'
                  ? 'text-slate-100 underline underline-offset-8 decoration-indigo-500'
                  : ''
              }`}
            >
              Početna
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('setup')}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'setup'
                  ? 'text-slate-100 underline underline-offset-8 decoration-indigo-500'
                  : ''
              }`}
            >
              Profil i Podešavanja
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleStartBriefing()}
              disabled={loading}
              className="w-fit min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-md shadow-indigo-600/20 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {loading ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
              ) : (
                <Radio className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="font-bold whitespace-nowrap">
                {loading ? statusMessage || 'Priprema...' : 'Pokreni Brifing'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {activeTab !== 'hud' && isHudPlaying && (
          <div className="mb-4 bg-indigo-500/15 border border-indigo-500/40 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-100">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-400 shrink-0 animate-pulse" />
              <span className="truncate">
                <strong>U toku:</strong> {activeAudioTitle}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExternalTogglePlaySeq((s) => s + 1)}
                className="min-h-[30px] px-3 py-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold whitespace-nowrap shrink-0"
              >
                Pauza
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hud')}
                className="min-h-[30px] px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold whitespace-nowrap shrink-0"
              >
                Nazad na Početnu
              </button>
            </div>
          </div>
        )}

        {/* URGENT HOME NOTIFICATION BANNER — appears at the top of the screen ONLY when power/water directly affects the user's home address */}
        {homeUrgentAlerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {homeUrgentAlerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-amber-500/15 border border-amber-500/45 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-100 shadow-lg"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {alert.category === 'struja' ? (
                    <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Droplets className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-amber-200">
                      Obaveštenje za kućnu adresu · {alert.title}
                    </div>
                    <div className="text-slate-200 mt-0.5 leading-snug">{alert.spokenText}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {notifPermission === 'default' && (
                    <button
                      type="button"
                      onClick={requestHomeNotificationPermission}
                      className="min-h-[30px] px-2.5 py-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-400/40 text-amber-200 font-medium whitespace-nowrap"
                    >
                      Javi i na telefon
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePlayServiceAlert(alert)}
                    className="min-h-[30px] px-2.5 py-1 rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/40 text-amber-100 font-semibold flex items-center gap-1 whitespace-nowrap"
                  >
                    <Headphones className="w-3 h-3" />
                    <span>Čuj</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissHomeAlert(alert.id)}
                    className="min-h-[30px] px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium whitespace-nowrap"
                  >
                    U redu
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {proactiveBeaconAlert && (
          <div className="mb-4 bg-rose-500/15 border border-rose-500/40 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-100">
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
              <span>
                <strong>Ispred vas (&lt;500m):</strong> {proactiveBeaconAlert.spokenText}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setProactiveBeaconAlert(null)}
              className="min-h-[30px] px-3 py-1 rounded-xl bg-rose-500/25 hover:bg-rose-500/35 text-rose-100 font-semibold whitespace-nowrap shrink-0"
            >
              U redu
            </button>
          </div>
        )}

        {isOffline && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-2.5 text-xs text-amber-200">
            Režim bez mreže — keširana mapa i servisne informacije su dostupni.
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3.5 flex items-center justify-between gap-4 text-xs sm:text-sm text-rose-300">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-xs font-semibold text-rose-200 hover:text-white px-2.5 py-1 rounded-lg bg-rose-500/20 whitespace-nowrap shrink-0"
            >
              Zatvori
            </button>
          </div>
        )}

        {/* =====================================================================
            TAB 1 (DEFAULT): POČETNA (Pretraga + Mapa odmah ispod + Pokreni Brifing + Vesti)
           ===================================================================== */}
        <div className={activeTab === 'hud' ? 'space-y-4' : 'hidden'}>
          {/* MAIN WORKSPACE: Left (5 col) = Compact Briefing CTA + Player + Vesti, Right (7 col) = Route Bar + Map */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column (Desktop) / Below Map (Mobile): Player + Vesti Dana + Voice */}
            <div className="lg:col-span-5 order-2 lg:order-1 space-y-4">
              {/* Audio Player HUD — appears as soon as a briefing or single article/pin audio is active */}
              {(report || activeTranscript) && (
                <AudioPlayerHUD
                  audioData={activeAudioData}
                  transcript={activeTranscript}
                  title={activeAudioTitle}
                  subtitle={
                    report?.timestamp ? `Ažurirano u ${report.timestamp}` : currentRouteTitle
                  }
                  hostFormat="solo"
                  chapters={report?.chapters || []}
                  radioMixEnabled={prefs.radioMixEnabled}
                  onToggleRadioMix={() => {
                    setPrefs((p) => {
                      const next = !p.radioMixEnabled;
                      trackAppEvent('radio_mix_toggled', next ? 'ON' : 'OFF');
                      return { ...p, radioMixEnabled: next };
                    });
                    refreshAnalytics();
                  }}
                  autoPlay={autoPlayTrigger > 0}
                  autoPlayTrigger={autoPlayTrigger}
                  onPlayStateChange={(playing) => {
                    isHudPlayingRef.current = playing;
                    setIsHudPlaying(playing);
                  }}
                  onOpenAutoDock={() => setIsAutoDockOpen(true)}
                  onExpandChapter={handleExpandChapter}
                  isExpandedClip={Boolean(report && activeAudioTitle !== report.routeTitle)}
                  onReturnToMainBriefing={() => {
                    if (!report) return;
                    setActiveAudioTitle(report.routeTitle);
                    setActiveAudioData(report.audioData);
                    setActiveTranscript(report.transcript);
                    setAutoPlayTrigger((t) => t + 1);
                  }}
                  onAnalyticsEvent={refreshAnalytics}
                  externalTogglePlaySeq={externalTogglePlaySeq}
                  externalPauseSeq={externalPauseSeq}
                  externalResumeSeq={externalResumeSeq}
                  externalNextSeq={externalNextSeq}
                  onPlaybackProgressChange={setPlaybackProgress}
                />
              )}

              {/* VESTI DANA — Primary Morning Information Feed */}
              <NewsFeedSection
                lastSyncedAt={lastSyncedAt}
                isOfflineFeed={isOfflineFeed}
                isScraping={isScraping}
                homeNewsCategoryFilter={homeNewsCategoryFilter}
                onSelectCategoryFilter={setHomeNewsCategoryFilter}
                homeNewsCategories={homeNewsCategories}
                homeFeedArticles={homeFeedArticles}
                activeAudioTitle={activeAudioTitle}
                deepDiveLoadingId={deepDiveLoadingId}
                onRefreshFeed={() => handleScanPortals({ forceRefresh: true })}
                onTriggerArticleBriefing={handleTriggerDeepDive}
                newsSortMode={newsSortMode}
                onSelectNewsSortMode={setNewsSortMode}
                listenedArticleMap={listenedArticleMap}
              />
            </div>

            {/* Right Column (Desktop) / First (Mobile): Google-Maps-style Map with floating icons + search bar inside */}
            <div className="lg:col-span-7 order-1 lg:order-2 space-y-3">
              <InteractiveRouteMap
                routeTitle={currentRouteTitle}
                trafficNodes={displayedTrafficNodes}
                serviceRadar={mapRadarItems}
                weather={report?.weather}
                coords={prefs.coords}
                startCoords={prefs.startCoords}
                endCoords={prefs.endCoords}
                routeCoordinates={liveRouteCoords}
                isVisible={activeTab === 'hud'}
                darkMapTheme={false}
                onPlayAlertAudio={handlePlayServiceAlert}
                onPlayNodeAudio={(node) => {
                  setActiveAudioTitle(node.title);
                  setActiveAudioData(undefined);
                  setActiveTranscript(`${node.title}, ${node.locationName}. ${node.description}`);
                  setAutoPlayTrigger((t) => t + 1);
                }}
                onLocateUser={() => handleResetToMyLocation(true)}
                onRouteGeometryResolved={handleRouteGeometryResolved}
                mapOverlayTop={
                  <div className="space-y-1.5">
                    {/* Row 1: Compact Address Search Bar at top-left of map (selecting from dropdown immediately routes to destination) */}
                    <form
                      onSubmit={handleRouteSearchSubmit}
                      className="relative z-20 pointer-events-auto flex items-center w-full max-w-[245px] sm:max-w-[280px]"
                    >
                      <StreetAutocompleteInput
                        value={destSearchInput}
                        onChange={(val) => {
                          setDestSearchInput(val);
                          if (lockedDest) setLockedDest(null);
                        }}
                        locked={lockedDest}
                        onSelect={handleSelectLockedDestination}
                        onUnlock={() => setLockedDest(null)}
                        placeholder="Kuda idete? (ulica i broj...)"
                        leadingIcon={<Search className="w-4 h-4 text-indigo-400" />}
                        compact
                      />
                    </form>

                    {/* Row 2: Floating Icon Shortcuts (Posao / Kuća) & Transport Mode (Autom / GSP) compactly grouped below search bar */}
                    <div className="relative z-10 flex items-center gap-2">
                      <div className="flex items-center gap-1.5 pointer-events-auto">
                        {!isCurrentlyAtWork && (
                          <button
                            type="button"
                            onClick={handleGoToWork}
                            className={`h-8 w-9 rounded-xl border shadow-md flex items-center justify-center transition-colors ${
                              prefs.destination && prefs.destination === prefs.workAddress
                                ? 'bg-emerald-600 border-emerald-400 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                            }`}
                            title={`Posao (${prefs.workAddress || 'Trg Republike'})`}
                            aria-label="Posao"
                          >
                            <Briefcase className="w-4 h-4 text-emerald-300" />
                          </button>
                        )}

                        {!isCurrentlyAtHome && (
                          <button
                            type="button"
                            onClick={handleGoHome}
                            className={`h-8 w-9 rounded-xl border shadow-md flex items-center justify-center transition-colors ${
                              prefs.destination && prefs.destination === prefs.homeAddress
                                ? 'bg-emerald-600 border-emerald-400 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                            }`}
                            title={`Kuća (${prefs.homeAddress || 'Novi Beograd'})`}
                            aria-label="Kuća"
                          >
                            <Home className="w-4 h-4 text-emerald-300" />
                          </button>
                        )}
                      </div>

                      <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-700 shadow-md pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setPrefs((p) => ({ ...p, transportMode: 'car' as TransportMode }));
                            trackAppEvent('transport_mode_changed', 'car');
                          }}
                          className={`h-7 w-8 rounded-lg flex items-center justify-center transition-colors ${
                            (prefs.transportMode || 'car') === 'car'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-300 hover:text-white'
                          }`}
                          title="Autom"
                          aria-label="Autom"
                        >
                          <Car className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPrefs((p) => ({ ...p, transportMode: 'transit' as TransportMode }));
                            trackAppEvent('transport_mode_changed', 'transit');
                          }}
                          className={`h-7 w-8 rounded-lg flex items-center justify-center transition-colors ${
                            prefs.transportMode === 'transit'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-300 hover:text-white'
                          }`}
                          title="Gradski prevoz"
                          aria-label="Gradski prevoz"
                        >
                          <Bus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                }
              />
            </div>
          </div>
        </div>

        {/* =====================================================================
            TAB 2: PROFIL I PODEŠAVANJA (Kuća, Posao, GSP linije, Obaveštenja, Glas, Teme)
           ===================================================================== */}
        {activeTab === 'setup' && (
          <ProfileView
            prefs={prefs}
            setPrefs={setPrefs}
            interestsList={INTERESTS}
            lockedHome={lockedHome}
            setLockedHome={setLockedHome}
            lockedWork={lockedWork}
            setLockedWork={setLockedWork}
            transitLinesInput={transitLinesInput}
            setTransitLinesInput={setTransitLinesInput}
            savedStreetsInput={savedStreetsInput}
            setSavedStreetsInput={setSavedStreetsInput}
            notifPermission={notifPermission}
            onRequestHomeNotificationPermission={requestHomeNotificationPermission}
            computeAdaptiveDuration={computeAdaptiveDuration}
            isQuickOrderingCategories={isQuickOrderingCategories}
            setIsQuickOrderingCategories={setIsQuickOrderingCategories}
            quickOrderedCategories={quickOrderedCategories}
            setQuickOrderedCategories={setQuickOrderedCategories}
            onQuickOrderCategoryTap={handleQuickOrderCategoryTap}
            onResetDefaultCategoryOrder={resetDefaultCategoryOrder}
            onOpenOnboarding={() => setShowOnboarding(true)}
            onToggleInterest={toggleInterest}
            onMoveCategoryPriority={moveCategoryPriority}
            isAdvancedSettingsOpen={isAdvancedSettingsOpen}
            setIsAdvancedSettingsOpen={setIsAdvancedSettingsOpen}
            reportHistory={reportHistory}
            onPlayHistoricalReport={(item) => {
              setReport(item);
              setActiveAudioData(item.audioData);
              setActiveTranscript(item.transcript);
              setActiveAudioTitle(item.routeTitle);
              setAutoPlayTrigger((t) => t + 1);
              setActiveTab('hud');
            }}
            appVersion={APP_VERSION}
          />
        )}
      </main>

      {/* Auto-Dock Fullscreen Driving Overlay */}
      <DriveModeView
        report={report}
        isOpen={isAutoDockOpen}
        onClose={() => setIsAutoDockOpen(false)}
        isAsking={isAsking}
        onAskQuestion={handleAskFollowUp}
        onExpandChapter={handleExpandChapter}
        isPlaying={isHudPlaying}
        onTogglePlay={() => setExternalTogglePlaySeq((s) => s + 1)}
        onSkipNext={() => {
          const queueSource =
            homeFeedArticles.length > 0 ? homeFeedArticles : normalizedAllArticles;
          const activeArticleIdx = queueSource.findIndex(
            (a) =>
              a.title === activeAudioTitle ||
              `Deep-Dive: ${a.title}` === activeAudioTitle
          );
          if (activeArticleIdx !== -1 && queueSource.length > 0) {
            const nextArt = queueSource[(activeArticleIdx + 1) % queueSource.length];
            handleTriggerDeepDive(nextArt);
            return;
          }
          if (report && activeAudioTitle !== report.routeTitle) {
            setActiveAudioTitle(report.routeTitle);
            setActiveAudioData(report.audioData);
            setActiveTranscript(report.transcript);
          }
          setExternalNextSeq((s) => s + 1);
        }}
        activeAudioTitle={activeAudioTitle}
        onReturnToMainBriefing={() => {
          if (!report) return;
          setActiveAudioTitle(report.routeTitle);
          setActiveAudioData(report.audioData);
          setActiveTranscript(report.transcript);
          setAutoPlayTrigger((t) => t + 1);
        }}
        onReverseDirection={handleReverseRouteDirection}
        conversation={conversation}
        prefs={prefs}
        isCurrentlyAtWork={isCurrentlyAtWork}
        playbackProgress={playbackProgress}
        feedArticles={homeFeedArticles}
      />

      {/* Clean 3-Item Mobile Bottom Navigation Bar */}
      <nav className="md:hidden sticky bottom-0 z-30 bg-[#090d16]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-3 h-16">
        <button
          type="button"
          onClick={() => setActiveTab('hud')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === 'hud' && !isAutoDockOpen ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span>Početna</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('setup')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            activeTab === 'setup' && !isAutoDockOpen ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <SlidersHorizontal className="w-5 h-5" />
          <span>Profil</span>
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            if (report) {
              setIsAutoDockOpen(true);
            } else {
              handleStartBriefing(undefined, undefined, true);
            }
          }}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            isAutoDockOpen || isHudPlaying ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          ) : (
            <Maximize2 className="w-5 h-5" />
          )}
          <span>{loading ? 'Priprema...' : 'Vožnja'}</span>
        </button>
      </nav>

      <OnboardingModal
        isOpen={showOnboarding}
        initialSelected={prefs.interests.slice(0, 5)}
        initialHomeAddress={prefs.homeAddress || ''}
        initialHomeLocked={lockedHome}
        initialWorkAddress={prefs.workAddress || ''}
        initialWorkLocked={lockedWork}
        onComplete={handleCompleteOnboarding}
        onSkip={handleSkipOnboarding}
      />
    </div>
  );
};

export default App;
