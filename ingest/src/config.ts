import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_CATEGORIES,
  type CategoryName,
  type FeedKind,
  type PaywallType,
  type SourceConfig,
  type SourceRole,
  type SourcesFile,
} from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INGEST_ROOT = resolve(__dirname, '..');
export const DEFAULT_SOURCES_PATH = resolve(INGEST_ROOT, 'sources.json');
export const DEFAULT_DB_PATH = resolve(INGEST_ROOT, 'data', 'news.sqlite');
export const DEFAULT_OUT_DIR = resolve(INGEST_ROOT, 'out');

const VALID_KINDS = new Set<FeedKind>(['rss', 'atom', 'html']);
const VALID_ROLES = new Set<SourceRole>(['publisher', 'signal']);
const VALID_PAYWALLS = new Set<PaywallType>(['none', 'soft', 'hard']);
const VALID_CATEGORIES = new Set<string>(CANONICAL_CATEGORIES);

function assertNonEmptyString(val: unknown, field: string, ctx: string): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new Error(`[sources.json] ${ctx}: polje "${field}" mora biti neprazan string.`);
  }
  return val.trim();
}

export function validateSourceConfig(raw: unknown, index: number): SourceConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`[sources.json] Stavka #${index} mora biti objekat.`);
  }
  const obj = raw as Record<string, unknown>;
  const ctx = typeof obj.id === 'string' && obj.id ? `izvor "${obj.id}"` : `stavka #${index}`;

  const id = assertNonEmptyString(obj.id, 'id', ctx);
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`[sources.json] ${ctx}: "id" sme sadržati samo mala slova, cifre i crtice.`);
  }
  const name = assertNonEmptyString(obj.name, 'name', ctx);
  const domain = assertNonEmptyString(obj.domain, 'domain', ctx).toLowerCase();
  const feedUrl = assertNonEmptyString(obj.feedUrl, 'feedUrl', ctx);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(feedUrl);
  } catch {
    throw new Error(`[sources.json] ${ctx}: neispravan URL "${feedUrl}".`);
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`[sources.json] ${ctx}: URL mora koristiti http ili https.`);
  }

  const kind = obj.kind as FeedKind;
  if (!VALID_KINDS.has(kind)) {
    throw new Error(`[sources.json] ${ctx}: nepoznat kind "${String(obj.kind)}".`);
  }

  const role = obj.role as SourceRole;
  if (!VALID_ROLES.has(role)) {
    throw new Error(`[sources.json] ${ctx}: nepoznat role "${String(obj.role)}".`);
  }

  const categoryHint = obj.categoryHint as CategoryName;
  if (!VALID_CATEGORIES.has(categoryHint)) {
    throw new Error(`[sources.json] ${ctx}: nepoznata kategorija "${String(obj.categoryHint)}".`);
  }

  const weight = Number(obj.weight);
  if (!Number.isFinite(weight) || weight < 1 || weight > 10) {
    throw new Error(`[sources.json] ${ctx}: "weight" mora biti broj između 1 i 10.`);
  }

  const baseIntervalMin = Number(obj.baseIntervalMin);
  const maxIntervalMin = Number(obj.maxIntervalMin);
  if (!Number.isInteger(baseIntervalMin) || baseIntervalMin < 5) {
    throw new Error(`[sources.json] ${ctx}: "baseIntervalMin" mora biti ceo broj >= 5.`);
  }
  if (!Number.isInteger(maxIntervalMin) || maxIntervalMin < baseIntervalMin) {
    throw new Error(`[sources.json] ${ctx}: "maxIntervalMin" mora biti >= baseIntervalMin.`);
  }

  const paywall = obj.paywall as PaywallType;
  if (!VALID_PAYWALLS.has(paywall)) {
    throw new Error(`[sources.json] ${ctx}: nepoznat paywall "${String(obj.paywall)}".`);
  }

  const maxItems = Number(obj.maxItems);
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 200) {
    throw new Error(`[sources.json] ${ctx}: "maxItems" mora biti ceo broj između 1 i 200.`);
  }

  if (typeof obj.enabled !== 'boolean') {
    throw new Error(`[sources.json] ${ctx}: "enabled" mora biti boolean.`);
  }

  const notes = typeof obj.notes === 'string' ? obj.notes.trim() : undefined;

  return {
    id,
    name,
    domain,
    feedUrl,
    kind,
    role,
    categoryHint,
    weight,
    baseIntervalMin,
    maxIntervalMin,
    paywall,
    maxItems,
    enabled: obj.enabled,
    notes,
  };
}

export function loadSourcesConfig(filePath: string = DEFAULT_SOURCES_PATH): SourcesFile {
  const rawText = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(rawText) as Record<string, unknown>;

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sources)) {
    throw new Error(`[sources.json] Fajl mora sadržati niz "sources".`);
  }

  const seenIds = new Set<string>();
  const sources: SourceConfig[] = parsed.sources.map((item, idx) => {
    const validated = validateSourceConfig(item, idx);
    if (seenIds.has(validated.id)) {
      throw new Error(`[sources.json] Dupliran id izvora: "${validated.id}".`);
    }
    seenIds.add(validated.id);
    return validated;
  });

  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    sources,
  };
}
