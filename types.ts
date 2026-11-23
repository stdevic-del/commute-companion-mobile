export type AppMode = 'live' | 'manual';
export type HostFormat = 'solo' | 'duo';
declare global {
  const __APP_VERSION__: string;
}

export type SourceGroupId = 'domaci_info' | 'it_tech' | 'saobracaj_servisi' | 'custom_urls';
export type TransportMode = 'car' | 'transit';
export type BriefingPacingMode = 'commute_adaptive' | 'all_breaking' | 'express_90s';
export type ServicePointZone = 'start' | 'route' | 'destination';
export type ServiceAlertCategory = 'struja' | 'voda' | 'prevoz' | 'saobracaj' | 'radovi' | 'garaza';

export interface ServiceAlertItem {
  id: string;
  zone: ServicePointZone;
  category: ServiceAlertCategory;
  urgencyLevel: 1 | 2 | 3; // 1 = Hitna izmena/zastoj, 2 = Usporenje/logistika, 3 = Najava unapred (EDS/komunalno)
  title: string;
  spokenText: string; // Sa vraćenim padežima i narodnim nazivima
  opstina: string;
  ulica: string;
  brojevi?: string;
  timeWindow?: string;
  datum?: string;
  isForecast?: boolean;
  transitLines?: string[];
  distanceMeters?: number;
  progressRatio?: number;
  isAhead?: boolean;
  lat?: number;
  lng?: number;
  dugaUlica?: boolean;
  duzinaM?: number;
  sourceName: string;
  url?: string;
}

export type ArticlePaywallType = 'none' | 'soft' | 'hard';

export interface ScrapedArticle {
  id: string;
  title: string;
  sourceName: string;
  sourceGroup: SourceGroupId;
  category: string;
  summary: string;
  url: string;
  publishedAt: string;
  publishedAtIso?: string;
  updatedAtIso?: string;
  selected: boolean;
  imageUrl?: string | null;
  paywall?: ArticlePaywallType;
  mediaCount?: number;
  relatedSources?: string[];
  clusterSources?: string[];
  importanceScore?: number;
  score?: number;
  isBreakingCluster?: boolean;
  aiBriefing?: string | null;
  aiBriefingSources?: string[];
  fromStaticFeed?: boolean;
}

export interface RoutePreset {
  id: string;
  label: string;
  startPoint: string;
  destination: string;
  distanceKm: number;
  estimatedMinutes: number;
  startCoords: { lat: number; lng: number };
  endCoords: { lat: number; lng: number };
  isCustom?: boolean;
}

export interface TrafficNode {
  id: string;
  title: string;
  locationName: string;
  severity: 'prohodno' | 'zastoj' | 'radovi';
  delayMinutes: number;
  description: string;
  progressRatio: number; // 0.0 to 1.0 along the route
  lat?: number;
  lng?: number;
  category?: ServiceAlertCategory;
  urgencyLevel?: 1 | 2 | 3;
}

export interface WeatherSummary {
  condition: string;
  tempC: number;
  windKmh: number;
  roadCondition: string;
}

export interface AudioChapter {
  id: string;
  title: string;
  category: string;
  text: string;
  expandedText?: string;
  expandedTitle?: string;
  startRatio: number; // 0.0 to 1.0 of total audio duration
  endRatio: number;   // 0.0 to 1.0 of total audio duration
  articleUrl?: string;
  sourceName?: string;
  leadTitle?: string;
  articleIds?: string[];
}

export interface UserPreferences {
  mode: AppMode;
  hostFormat: HostFormat;
  location: string;
  startPoint?: string;
  destination?: string;
  interests: string[];
  sourceGroups: SourceGroupId[];
  customUrls: string[];
  duration: number;
  languageVariant: 'ekavica' | 'ijekavica';
  radioMixEnabled: boolean;
  spotifyUrl?: string;
  coords?: { lat: number; lng: number };
  startCoords?: { lat: number; lng: number };
  endCoords?: { lat: number; lng: number };
  homeAddress?: string;
  homeCoords?: { lat: number; lng: number };
  workAddress?: string;
  workCoords?: { lat: number; lng: number };
  selectedPresetId?: string;
  autoScanOnLoad?: boolean;
  adaptiveDuration?: boolean;
  estimatedCommuteMinutes?: number;
  transportMode?: TransportMode;
  pacingMode?: BriefingPacingMode;
  favoriteTransitLines?: string[];
  savedStreets?: string[];
  backgroundLocationEnabled?: boolean;
  proactiveAudioAlerts?: boolean;
  darkMapTheme?: boolean;
}

export interface NewsSection {
  category: string;
  headline: string;
  summary: string;
  sourceName?: string;
  url?: string;
}

export interface NewsReport {
  id: string;
  timestamp: string;
  routeTitle: string;
  hostFormat: HostFormat;
  transcript: string;
  chapters: AudioChapter[];
  scrapedArticles: ScrapedArticle[];
  highlights?: string[];
  sections?: NewsSection[];
  trafficNodes: TrafficNode[];
  serviceRadar?: ServiceAlertItem[];
  routeStreetNames?: string[];
  routeCoordinates?: Array<[number, number]>;
  weather: WeatherSummary;
  sources: Array<{ title: string; uri: string }>;
  startCoords?: { lat: number; lng: number };
  endCoords?: { lat: number; lng: number };
  audioData?: string;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  audioData?: string;
  sources?: Array<{ title: string; uri: string }>;
}

export interface StreetRouteGeometry {
  coordinates: Array<[number, number]>; // [lat, lng][]
  distanceKm: number;
  durationMinutes: number;
  streetNames?: string[];
}

