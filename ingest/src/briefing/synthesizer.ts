import { GoogleGenAI } from '@google/genai';
import type { NewsDatabase } from '../db.ts';
import type { PoliteFetcher } from '../fetcher.ts';
import type { ClusterSourceSummary, RankedCluster } from '../rank/ranker.ts';
import { DEFAULT_MAX_EXCERPT_CHARS, extractCleanArticleTextInRam } from './extractor.ts';

export const DEFAULT_GEMINI_BRIEFING_MODEL = 'gemini-2.5-flash';
export const DEFAULT_TOP_CLUSTERS_FOR_BRIEFING = 20;
export const DEFAULT_MAX_NEW_BRIEFINGS_PER_RUN = 5;
export const DEFAULT_MAX_SOURCES_PER_CLUSTER = 3;

export const BRIEFING_SYSTEM_PROMPT = `Ti si iskusni spiker i urednik kratkih radijskih vesti na srpskom jeziku. Na osnovu priloženih tekstova iz različitih medija o istom događaju, napiši jedan jasan, prirodan i informativan audio brifing od 3 do 5 rečenica.
Pravila:
- Piši isključivo čistim, tečnim srpskim jezikom (latinica), prilagođenim za čitanje naglas (TTS).
- Bez Markdown formatiranja, zvezdica, nabrajanja, naslova i emotikona.
- Prirodno pomeni izvore u tekstu (npr. 'Kako prenose RTS i Danas...' ili 'Prema pisanju Nove...').
- Izdvoji samo najvažnije činjenice, brojke i posledice, bez senzacionalizma i ponavljanja.
- Ako se izvori razlikuju u detaljima, kratko to naglasi.`;

export interface BriefingSourceExcerpt {
  sourceName: string;
  title: string;
  text: string;
}

export interface BriefingLlmClient {
  readonly model: string;
  generate(params: {
    systemInstruction: string;
    clusterTitle: string;
    category: string;
    excerpts: BriefingSourceExcerpt[];
  }): Promise<string>;
}

export class LlmRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmRateLimitError';
  }
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : 0;
  return (
    status === 429 ||
    /\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg)
  );
}

/**
 * Skida eventualne slučajne Markdown oznake, nabrajanja ili emotikone da bi tekst
 * bio potpuno čist za TTS čitanje naglas.
 */
export function cleanTtsBriefingText(raw: string): string {
  return raw
    .replace(/^\s*#+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildBriefingUserPrompt(params: {
  clusterTitle: string;
  category: string;
  excerpts: BriefingSourceExcerpt[];
}): string {
  const blocks = params.excerpts.map(
    (ex, idx) =>
      `[IZVOR ${idx + 1}: ${ex.sourceName}]\nNaslov: ${ex.title}\nTekst:\n${ex.text}`
  );
  return [
    `Kategorija: ${params.category}`,
    `Glavna tema: ${params.clusterTitle}`,
    '',
    'Priloženi tekstovi iz medija:',
    blocks.join('\n\n---\n\n'),
    '',
    'Napiši audio brifing (3 do 5 rečenica, čist srpski jezik, latinica, bez formatiranja):',
  ].join('\n');
}

export class GeminiBriefingClient implements BriefingLlmClient {
  public readonly model: string;
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string, model: string = DEFAULT_GEMINI_BRIEFING_MODEL) {
    this.model = model;
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async generate(params: {
    systemInstruction: string;
    clusterTitle: string;
    category: string;
    excerpts: BriefingSourceExcerpt[];
  }): Promise<string> {
    const contents = buildBriefingUserPrompt({
      clusterTitle: params.clusterTitle,
      category: params.category,
      excerpts: params.excerpts,
    });

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: params.systemInstruction,
          temperature: 0.35,
          maxOutputTokens: 450,
        },
      });
      const text = typeof response.text === 'string' ? response.text : '';
      return text;
    } catch (err: unknown) {
      if (isRateLimitError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new LlmRateLimitError(msg);
      }
      throw err;
    }
  }
}

export function createGeminiClientFromEnv(): GeminiBriefingClient | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  const model = (process.env.GEMINI_BRIEFING_MODEL || DEFAULT_GEMINI_BRIEFING_MODEL).trim();
  return new GeminiBriefingClient(apiKey, model);
}

export interface BriefingGeneratorOptions {
  topClusters?: number;
  maxNewBriefingsPerRun?: number;
  maxSourcesPerCluster?: number;
  maxCharsPerSource?: number;
  logger?: Pick<Console, 'warn'>;
}

export interface BriefingRunStats {
  skippedNoApiKey: boolean;
  candidatesChecked: number;
  alreadyBriefed: number;
  generated: number;
  skippedNoReadableText: number;
  failed: number;
  hitRateLimit: boolean;
}

function selectSourcesForBriefing(
  item: RankedCluster,
  maxSources: number
): ClusterSourceSummary[] {
  // Preskoči hard paywall; daj prednost izvorima veće težine i glavnom izvoru (ne-duplikati prvo)
  const eligible = item.sources.filter((s) => s.paywall !== 'hard');
  const sorted = [...eligible].sort((a, b) => {
    const aLead = a.sourceId === item.lead.source_id ? 1 : 0;
    const bLead = b.sourceId === item.lead.source_id ? 1 : 0;
    if (bLead !== aLead) return bLead - aLead;
    if (a.isDuplicate !== b.isDuplicate) return Number(a.isDuplicate) - Number(b.isDuplicate);
    return b.sourceWeight - a.sourceWeight;
  });

  if (sorted.length === 0 && item.lead.paywall !== 'hard') {
    return [
      {
        sourceId: item.lead.source_id,
        sourceName: item.leadSourceName,
        sourceWeight: item.leadSourceWeight,
        url: item.lead.url,
        publishedAt: item.lead.published_at,
        paywall: item.lead.paywall,
        isDuplicate: false,
      },
    ];
  }

  return sorted.slice(0, maxSources);
}

/**
 * Generiše AI audio brifing u letu za top 15–20 rangiranih klastera bez postojećeg brifinga:
 * - Strogo RAM-only: HTML i izvučeni Readability tekst se nikada ne upisuju u bazu/JSON/logove
 * - Jednom generisan brifing se NE regeneriše
 * - Limit po ciklusu (podrazumevano 5) radi kontrole troškova
 * - Graceful fallback kada nema API ključa ili API vrati grešku/429
 */
export class BriefingGenerator {
  private readonly db: NewsDatabase;
  private readonly fetcher: PoliteFetcher;
  private readonly llmClient: BriefingLlmClient | null;
  private readonly topClusters: number;
  private readonly maxNewBriefingsPerRun: number;
  private readonly maxSourcesPerCluster: number;
  private readonly maxCharsPerSource: number;
  private readonly logger: Pick<Console, 'warn'>;

  constructor(
    db: NewsDatabase,
    fetcher: PoliteFetcher,
    llmClient: BriefingLlmClient | null,
    options: BriefingGeneratorOptions = {}
  ) {
    this.db = db;
    this.fetcher = fetcher;
    this.llmClient = llmClient;
    this.topClusters = Math.max(1, options.topClusters ?? DEFAULT_TOP_CLUSTERS_FOR_BRIEFING);
    this.maxNewBriefingsPerRun = Math.max(
      0,
      options.maxNewBriefingsPerRun ?? DEFAULT_MAX_NEW_BRIEFINGS_PER_RUN
    );
    this.maxSourcesPerCluster = Math.max(
      1,
      options.maxSourcesPerCluster ?? DEFAULT_MAX_SOURCES_PER_CLUSTER
    );
    this.maxCharsPerSource = Math.max(500, options.maxCharsPerSource ?? DEFAULT_MAX_EXCERPT_CHARS);
    this.logger = options.logger ?? console;
  }

  public async generateForRankedClusters(
    ranked: RankedCluster[],
    now: Date = new Date()
  ): Promise<BriefingRunStats> {
    const stats: BriefingRunStats = {
      skippedNoApiKey: false,
      candidatesChecked: 0,
      alreadyBriefed: 0,
      generated: 0,
      skippedNoReadableText: 0,
      failed: 0,
      hitRateLimit: false,
    };

    if (!this.llmClient) {
      stats.skippedNoApiKey = true;
      this.logger.warn('[BRIEFING] GEMINI_API_KEY nije podešen — preskačem generisanje AI brifinga.');
      return stats;
    }

    if (this.maxNewBriefingsPerRun === 0) {
      return stats;
    }

    const topSlice = ranked.slice(0, this.topClusters);

    for (const item of topSlice) {
      if (stats.generated >= this.maxNewBriefingsPerRun) break;

      if (item.cluster.ai_briefing_text && item.cluster.ai_briefing_text.trim().length > 0) {
        stats.alreadyBriefed += 1;
        continue;
      }

      stats.candidatesChecked += 1;

      try {
        const result = await this.synthesizeForClusterInRam(item, now);
        if (result === 'generated') {
          stats.generated += 1;
        } else {
          stats.skippedNoReadableText += 1;
        }
      } catch (err: unknown) {
        stats.failed += 1;
        if (err instanceof LlmRateLimitError || isRateLimitError(err)) {
          stats.hitRateLimit = true;
          this.logger.warn(
            `[BRIEFING] Gemini API 429/limit za klaster ${item.cluster.id} — pauziram do sledećeg ciklusa.`
          );
          break;
        }
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[BRIEFING] Greška pri generisanju za klaster ${item.cluster.id}: ${reason.slice(0, 140)}`
        );
      }
    }

    return stats;
  }

  /**
   * Izolovana funkcija: sirovi HTML i Readability tekst postoje SAMO u lokalnoj promenljivoj `excerpts`
   * i nestaju iz memorije čim se funkcija završi.
   */
  private async synthesizeForClusterInRam(
    item: RankedCluster,
    now: Date
  ): Promise<'generated' | 'no_text'> {
    if (!this.llmClient) return 'no_text';

    const selectedSources = selectSourcesForBriefing(item, this.maxSourcesPerCluster);
    const excerpts: BriefingSourceExcerpt[] = [];

    for (const src of selectedSources) {
      const fetched = await this.fetcher.fetchUrl(src.url, {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
      });
      if (fetched.kind !== 'fetched') continue;

      const cleanText = extractCleanArticleTextInRam(fetched.body, this.maxCharsPerSource);
      if (!cleanText) continue;

      excerpts.push({
        sourceName: src.sourceName,
        title: item.lead.title,
        text: cleanText,
      });
    }

    if (excerpts.length === 0) {
      return 'no_text';
    }

    const rawBriefing = await this.llmClient.generate({
      systemInstruction: BRIEFING_SYSTEM_PROMPT,
      clusterTitle: item.lead.title,
      category: item.cluster.category,
      excerpts,
    });

    const cleaned = cleanTtsBriefingText(rawBriefing);
    if (cleaned.length < 40) {
      throw new Error('Generisani AI brifing je prazan ili prekratak.');
    }

    const usedSourceNames = excerpts.map((e) => e.sourceName);
    const nowIso = now.toISOString();

    this.db.saveClusterBriefing({
      clusterId: item.cluster.id,
      text: cleaned,
      sourceNames: usedSourceNames,
      mediaCount: item.cluster.media_count,
      generatedAt: nowIso,
    });

    // Osveži i in-memory objekat za F8 izvoz JSON-a u istom ciklusu
    item.cluster.ai_briefing_text = cleaned;
    item.cluster.ai_briefing_sources = JSON.stringify(usedSourceNames);
    item.cluster.ai_briefing_media_count = item.cluster.media_count;
    item.cluster.ai_briefing_at = nowIso;

    return 'generated';
  }
}
