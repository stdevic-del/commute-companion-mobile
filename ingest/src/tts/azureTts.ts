import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { cyrillicToLatin } from '../../../shared/transliterate.ts';
import type { NewsDatabase } from '../db.ts';
import type { RankedCluster } from '../rank/ranker.ts';

export const DEFAULT_AZURE_TTS_VOICE = 'sr-RS-SophieNeural';
export const SUPPORTED_SERBIAN_VOICES = [
  'sr-RS-SophieNeural',
  'sr-RS-NicholasNeural',
] as const;
export const AZURE_TTS_OUTPUT_FORMAT = 'audio-16khz-32kbitrate-mono-mp3';
export const DEFAULT_DAILY_CHAR_LIMIT = 12_000;
export const DEFAULT_AUDIO_RETENTION_HOURS = 48;
export const DEFAULT_MAX_CHARS_PER_CLIP = 420;
export const AUDIO_SUBDIR = 'audio';

export class AzureTtsRateLimitError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AzureTtsRateLimitError';
    this.status = status;
  }
}

export class AzureTtsAuthError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AzureTtsAuthError';
    this.status = status;
  }
}

export interface AzureTtsClient {
  readonly voice: string;
  readonly region: string;
  synthesize(text: string, voiceOverride?: string): Promise<Uint8Array>;
}

export interface AzureTtsGeneratorOptions {
  dailyCharLimit?: number;
  retentionHours?: number;
  maxCharsPerClip?: number;
  maxItems?: number;
  voice?: string;
}

export interface AudioCleanupSummary {
  deletedFiles: number;
  prunedDbRows: number;
}

export interface AzureTtsRunSummary {
  skippedNoApiKey: boolean;
  voice: string;
  generated: number;
  alreadyCached: number;
  skippedDailyLimit: number;
  failed: number;
  hitDailyLimit: boolean;
  hitRateLimit: boolean;
  hitAuthError: boolean;
  charsUsedThisRun: number;
  charsUsedToday: number;
  dailyCharLimit: number;
  deletedExpiredFiles: number;
  /** Mapa clusterId -> relativna putanja `audio/<id>.mp3` samo za postojeće MP3 fajlove */
  audioUrls: Map<string, string>;
}

/**
 * Sanitizuje ID članka/klastera u bezbedan naziv fajla bez znakova putanje.
 */
export function sanitizeAudioFileId(rawId: string): string {
  const clean = (rawId || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
  return clean || 'item';
}

/**
 * Eskapuje tekst za bezbedno ugrađivanje u SSML XML telo.
 */
export function escapeXmlForSsml(raw: string): string {
  return (raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalizuje glas iz environment varijable (podrazumevano `sr-RS-SophieNeural`,
 * podržava i `sr-RS-NicholasNeural` ili kratki alias `sophie` / `nicholas`).
 */
export function resolveAzureVoice(rawVoice?: string | null): string {
  const trimmed = (rawVoice || '').trim();
  if (!trimmed) return DEFAULT_AZURE_TTS_VOICE;
  if (/^nicholas$/i.test(trimmed)) return 'sr-RS-NicholasNeural';
  if (/^sophie$/i.test(trimmed)) return 'sr-RS-SophieNeural';
  return trimmed;
}

/**
 * Sastavlja validan Microsoft Azure Speech SSML dokument za srpski jezik (`sr-RS`).
 */
export function buildAzureSsml(text: string, voice: string = DEFAULT_AZURE_TTS_VOICE): string {
  const safeVoice = escapeXmlForSsml(resolveAzureVoice(voice));
  const safeText = escapeXmlForSsml(cyrillicToLatin(text).trim());
  return `<speak version='1.0' xml:lang='sr-RS'><voice xml:lang='sr-RS' name='${safeVoice}'>${safeText}</voice></speak>`;
}

function truncateAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );
  if (lastSentenceEnd >= Math.floor(maxChars * 0.55)) {
    return slice.slice(0, lastSentenceEnd + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(' ');
  const cut = (lastSpace >= Math.floor(maxChars * 0.5) ? slice.slice(0, lastSpace) : slice).trim();
  const withoutTrailingPunct = cut.replace(/[,;:\-–]+$/, '').trim();
  return /[.!?]$/.test(withoutTrailingPunct)
    ? withoutTrailingPunct
    : `${withoutTrailingPunct}.`;
}

/**
 * Gradi čist govorni tekst na srpskoj latinici (ekavica) za Azure Neural TTS:
 * naslov + kratak sažetak (ili već sintetisani kratki AI brifing ako postoji),
 * bez URL-ova, Markdown oznaka i nepotrebnog dupliranja naslova.
 */
export function buildClusterTtsScript(
  item: RankedCluster,
  maxChars: number = DEFAULT_MAX_CHARS_PER_CLIP
): string {
  const cleanTitle = cyrillicToLatin(item.lead.title || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');

  const aiBriefing = cyrillicToLatin(item.cluster.ai_briefing_text || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (aiBriefing.length >= 25) {
    const withPunct = /[.!?]$/.test(aiBriefing) ? aiBriefing : `${aiBriefing}.`;
    return truncateAtBoundary(withPunct, maxChars);
  }

  const cleanSnippet = cyrillicToLatin(item.lead.snippet || '')
    .replace(/^Udarna tema u više redakcija\s*\([^)]+\)\.\s*/i, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanTitle && !cleanSnippet) return '';
  if (!cleanTitle) {
    const s = /[.!?]$/.test(cleanSnippet) ? cleanSnippet : `${cleanSnippet}.`;
    return truncateAtBoundary(s, maxChars);
  }

  const snippetDuplicatesTitle =
    cleanSnippet.length > 0 &&
    cleanSnippet.toLowerCase().startsWith(cleanTitle.toLowerCase().slice(0, 24));

  const combined =
    cleanSnippet && !snippetDuplicatesTitle
      ? `${cleanTitle}. ${/[.!?]$/.test(cleanSnippet) ? cleanSnippet : `${cleanSnippet}.`}`
      : `${cleanTitle}.`;

  return truncateAtBoundary(combined, maxChars);
}

/**
 * Kreira Azure Neural TTS HTTP klijent iz environment varijabli:
 * - `AZURE_SPEECH_KEY`
 * - `AZURE_SPEECH_REGION`
 * - `AZURE_SPEECH_VOICE` (opciono, podrazumevano `sr-RS-SophieNeural`)
 * Vraća `null` kada ključevi nisu podešeni (pipeline tada bezbedno preskače TTS korak).
 */
export function createAzureTtsClientFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): AzureTtsClient | null {
  const apiKey = (env.AZURE_SPEECH_KEY || '').trim();
  const region = (env.AZURE_SPEECH_REGION || '').trim();
  if (!apiKey || !region) {
    return null;
  }

  const voice = resolveAzureVoice(env.AZURE_SPEECH_VOICE);
  const endpoint = `https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`;

  return {
    voice,
    region,
    async synthesize(text: string, voiceOverride?: string): Promise<Uint8Array> {
      const targetVoice = resolveAzureVoice(voiceOverride || voice);
      const ssml = buildAzureSsml(text, targetVoice);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let res: Response;
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Content-Type': 'application/ssml+xml; charset=utf-8',
            'X-Microsoft-OutputFormat': AZURE_TTS_OUTPUT_FORMAT,
            'User-Agent': 'PutniVodic-AzureTTS/1.0',
          },
          body: ssml,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 429) {
        throw new AzureTtsRateLimitError(429, 'Azure Speech API vratio HTTP 429 (rate limit / kvota).');
      }
      if (res.status === 401 || res.status === 403) {
        throw new AzureTtsAuthError(
          res.status,
          `Azure Speech API odbio autentifikaciju (HTTP ${res.status}).`
        );
      }
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Azure Speech HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength < 64) {
        throw new Error(`Azure Speech vratio prekratak audio odgovor (${buf.byteLength} B).`);
      }
      return buf;
    },
  };
}

/**
 * Automatsko čišćenje starih MP3 fajlova (starijih od 48h) iz `outDir/audio` i SQLite keša,
 * tako da grana `news-feed` i keš nikada ne rastu beskonačno.
 */
export function cleanupExpiredAudioFiles(
  audioDir: string,
  db: NewsDatabase,
  retentionHours: number = DEFAULT_AUDIO_RETENTION_HOURS,
  now: Date = new Date()
): AudioCleanupSummary {
  const cutoffMs = now.getTime() - retentionHours * 3_600_000;
  let deletedFiles = 0;

  const dbRows = db.listTtsAudioCache();
  const createdAtByFile = new Map<string, number>();
  for (const row of dbRows) {
    const ts = Date.parse(row.created_at);
    if (!Number.isNaN(ts)) {
      createdAtByFile.set(row.file_name, ts);
    }
  }

  if (existsSync(audioDir)) {
    const entries = readdirSync(audioDir);
    for (const fileName of entries) {
      if (!fileName.endsWith('.mp3')) continue;
      const fullPath = join(audioDir, fileName);
      try {
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;

        const dbCreatedMs = createdAtByFile.get(fileName);
        const effectiveCreatedMs = dbCreatedMs !== undefined ? dbCreatedMs : stat.mtimeMs;
        const isExpired = effectiveCreatedMs < cutoffMs;
        const isEmpty = stat.size === 0;

        if (isExpired || isEmpty) {
          unlinkSync(fullPath);
          db.deleteTtsAudioByFileName(fileName);
          deletedFiles += 1;
        }
      } catch {
        // ignore single-file stat/unlink race
      }
    }
  }

  const prunedDbRows = db.pruneTtsAudioCache(retentionHours, now);
  return { deletedFiles, prunedDbRows };
}

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export class AzureTtsGenerator {
  private readonly db: NewsDatabase;
  private readonly client: AzureTtsClient | null;
  private readonly dailyCharLimit: number;
  private readonly retentionHours: number;
  private readonly maxCharsPerClip: number;
  private readonly maxItems: number;
  private readonly voice: string;

  constructor(
    db: NewsDatabase,
    client: AzureTtsClient | null,
    options: AzureTtsGeneratorOptions = {}
  ) {
    this.db = db;
    this.client = client;
    this.dailyCharLimit =
      options.dailyCharLimit ??
      parsePositiveIntEnv(process.env.AZURE_TTS_DAILY_CHAR_LIMIT, DEFAULT_DAILY_CHAR_LIMIT);
    this.retentionHours =
      options.retentionHours ??
      parsePositiveIntEnv(process.env.AZURE_TTS_RETENTION_HOURS, DEFAULT_AUDIO_RETENTION_HOURS);
    this.maxCharsPerClip = options.maxCharsPerClip ?? DEFAULT_MAX_CHARS_PER_CLIP;
    this.maxItems = options.maxItems ?? 80;
    this.voice = resolveAzureVoice(options.voice || client?.voice || process.env.AZURE_SPEECH_VOICE);
  }

  /**
   * 1) Briše stare MP3 fajlove (> 48h).
   * 2) Za postojeće MP3 fajlove odmah vraća keširani `audio/<id>.mp3` (0 potrošenih karaktera).
   * 3) Za nove članke generiše MP3 preko Microsoft Azure Neural TTS poštujući čvrst dnevni limit karaktera.
   * 4) Ako Azure ključevi nisu podešeni, bezbedno preskače sintezu bez pucanja.
   */
  public async generateForRankedClusters(
    ranked: RankedCluster[],
    outDir: string,
    now: Date = new Date()
  ): Promise<AzureTtsRunSummary> {
    const audioDir = join(outDir, AUDIO_SUBDIR);
    const cleanup = cleanupExpiredAudioFiles(audioDir, this.db, this.retentionHours, now);

    const dayUtc = now.toISOString().slice(0, 10);
    const nowIso = now.toISOString();
    const initialUsage = this.db.getTtsDailyUsage(dayUtc);
    let charsUsedToday = initialUsage.chars_used;
    let charsUsedThisRun = 0;

    const audioUrls = new Map<string, string>();
    let generated = 0;
    let alreadyCached = 0;
    let skippedDailyLimit = 0;
    let failed = 0;
    let hitDailyLimit = false;
    let hitRateLimit = false;
    let hitAuthError = false;

    const candidates = ranked.slice(0, this.maxItems);

    if (!this.client) {
      // I bez Azure ključeva, uveži postojeće validne MP3 fajlove koji su već u audio/ direktorijumu
      for (const item of candidates) {
        const fileName = `${sanitizeAudioFileId(item.cluster.id)}.mp3`;
        const filePath = join(audioDir, fileName);
        if (existsSync(filePath)) {
          try {
            if (statSync(filePath).size > 0) {
              audioUrls.set(item.cluster.id, `${AUDIO_SUBDIR}/${fileName}`);
              alreadyCached += 1;
            }
          } catch {
            // ignore
          }
        }
      }

      return {
        skippedNoApiKey: true,
        voice: this.voice,
        generated: 0,
        alreadyCached,
        skippedDailyLimit: 0,
        failed: 0,
        hitDailyLimit: false,
        hitRateLimit: false,
        hitAuthError: false,
        charsUsedThisRun: 0,
        charsUsedToday,
        dailyCharLimit: this.dailyCharLimit,
        deletedExpiredFiles: cleanup.deletedFiles,
        audioUrls,
      };
    }

    mkdirSync(audioDir, { recursive: true });

    for (const item of candidates) {
      const safeId = sanitizeAudioFileId(item.cluster.id);
      const fileName = `${safeId}.mp3`;
      const filePath = join(audioDir, fileName);
      const relUrl = `${AUDIO_SUBDIR}/${fileName}`;

      // 1) Keširanje po ID-ju članka/klastera: ako MP3 već postoji, ne zovi Azure
      if (existsSync(filePath)) {
        try {
          if (statSync(filePath).size > 0) {
            audioUrls.set(item.cluster.id, relUrl);
            alreadyCached += 1;
            continue;
          }
        } catch {
          // treat as missing
        }
      }

      if (hitDailyLimit || hitRateLimit || hitAuthError) {
        if (hitDailyLimit) skippedDailyLimit += 1;
        continue;
      }

      const script = buildClusterTtsScript(item, this.maxCharsPerClip);
      if (!script) continue;

      // 2) Čvrst dnevni limit karaktera (npr. max 12.000/dan < 500.000/mesec besplatne F0 kvote)
      if (charsUsedToday + script.length > this.dailyCharLimit) {
        hitDailyLimit = true;
        skippedDailyLimit += 1;
        continue;
      }

      try {
        const audioBytes = await this.client.synthesize(script, this.voice);
        writeFileSync(filePath, audioBytes);

        this.db.recordTtsAudio({
          item_id: item.cluster.id,
          file_name: fileName,
          voice: this.voice,
          chars_count: script.length,
          bytes_size: audioBytes.byteLength,
          created_at: nowIso,
        });
        const updatedUsage = this.db.addTtsDailyUsage(dayUtc, script.length, 1, nowIso);
        charsUsedToday = updatedUsage.chars_used;
        charsUsedThisRun += script.length;

        audioUrls.set(item.cluster.id, relUrl);
        generated += 1;
      } catch (err) {
        if (err instanceof AzureTtsRateLimitError) {
          hitRateLimit = true;
          failed += 1;
        } else if (err instanceof AzureTtsAuthError) {
          hitAuthError = true;
          failed += 1;
        } else {
          failed += 1;
        }
      }
    }

    return {
      skippedNoApiKey: false,
      voice: this.voice,
      generated,
      alreadyCached,
      skippedDailyLimit,
      failed,
      hitDailyLimit,
      hitRateLimit,
      hitAuthError,
      charsUsedThisRun,
      charsUsedToday,
      dailyCharLimit: this.dailyCharLimit,
      deletedExpiredFiles: cleanup.deletedFiles,
      audioUrls,
    };
  }
}
