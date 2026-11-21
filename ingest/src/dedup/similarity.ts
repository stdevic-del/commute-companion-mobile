import { normalizeForComparison } from '../normalize/text.ts';

export interface TextDocument {
  id: string;
  titleNorm: string;
  snippet?: string;
}

export interface SimilarityMatch {
  id: string;
  score: number;
}

/**
 * Modularni interfejs za semantičko poređenje tekstova.
 * Podrazumevana implementacija je TF-IDF + kosinusna sličnost za srpski jezik;
 * kasnije se bez izmene ostatka koda može zameniti embeddings provajderom.
 */
export interface SimilarityProvider {
  readonly name: string;
  similarity(a: TextDocument, b: TextDocument): number;
  findMostSimilar(
    query: TextDocument,
    corpus: TextDocument[],
    minScore?: number
  ): SimilarityMatch | null;
}

const SERBIAN_STOP_WORDS = new Set([
  // Veznici, predlozi, rečce
  'i', 'u', 'na', 'je', 'da', 'se', 'za', 'su', 'sa', 'od', 'do', 'po', 'iz', 'o', 'a',
  'ali', 'ili', 'kao', 'sto', 'pa', 'te', 'ni', 'niti', 'vec', 'jos', 'samo', 'ako',
  'jer', 'nego', 'dok', 'kad', 'kada', 'gde', 'kuda', 'otkud', 'zasto', 'zbog', 'radi',
  'prema', 'preko', 'kroz', 'bez', 'oko', 'kod', 'pred', 'pod', 'nad', 'medju', 'izmedju',
  'protiv', 'nakon', 'posle', 'pre', 'pored', 'osim', 'cak', 'bas', 'takodje', 'medjutim',
  'ipak', 'dakle', 'zato', 'stoga', 'uvek', 'nikad', 'sada', 'sad', 'danas', 'juce', 'sutra',
  'ovde', 'tamo', 'evo', 'eto',
  // Zamenice
  'ja', 'ti', 'on', 'ona', 'ono', 'mi', 'vi', 'oni', 'one', 'me', 'te', 'ga', 'mu', 'joj',
  'ih', 'im', 'nas', 'nam', 'vas', 'vam', 'moj', 'tvoj', 'nas', 'vas', 'njegov', 'njen',
  'njihov', 'svoj', 'taj', 'ta', 'to', 'ti', 'te', 'tog', 'toga', 'tom', 'tome', 'tim',
  'ovaj', 'ova', 'ovo', 'ove', 'ovog', 'ovoj', 'ovim', 'ovih', 'onaj', 'koji', 'koja',
  'koje', 'kojeg', 'kojoj', 'kojim', 'kojih', 'kojima', 'koju', 'ciji', 'cija', 'cije',
  'sve', 'svi', 'svih', 'svim', 'svima', 'sveg', 'svaku', 'svaki', 'svaka', 'svako',
  'neki', 'neka', 'neko', 'neke', 'nekih', 'svojih', 'svoje', 'svoju',
  // Pomoćni glagoli
  'sam', 'si', 'smo', 'ste', 'nisam', 'nisi', 'nije', 'nismo', 'niste', 'nisu',
  'bih', 'bi', 'bismo', 'biste', 'bio', 'bila', 'bilo', 'bili', 'bile', 'biti', 'bude',
  'budu', 'cu', 'ces', 'ce', 'cemo', 'cete', 'necu', 'nece', 'necemo', 'nece', 'ne',
  // Novinarski tagovi bez sadržajne vrednosti
  'foto', 'video', 'uzivo', 'najnovije',
]);

const ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'by', 'at', 'from', 'as', 'that', 'this',
  'these', 'those', 'it', 'its', 'has', 'have', 'had', 'will', 'would', 'can', 'could',
  'not', 'but', 'about', 'into', 'over', 'after', 'before', 'than', 'then', 'out',
  'up', 'down', 'new', 'how', 'why', 'what', 'who', 'when', 'where',
]);

/**
 * Najduži nastavci srpskih padeža, prideva i glagolskih imenica (sortirano po dužini silazno).
 * Cilj: lak, brz i bezbedan stemming da se "Beograd/Beograda/Beogradu/Beogradom",
 * "Srbija/Srbije/Srbiji/Srbiju", "predsednik/predsednika" spoje na isti koren.
 */
const SERBIAN_SUFFIXES = [
  'ovima', 'evima', 'ijama', 'anjima', 'enjima',
  'osti', 'anja', 'enje', 'anje', 'enje', 'skog', 'skoj', 'skim', 'skih',
  'ima', 'ama', 'oga', 'ega', 'omu', 'emu', 'ski', 'ska', 'sko', 'ske',
  'nih', 'nim', 'nog', 'noj', 'nom', 'aju', 'uju', 'ila', 'ilo', 'ili',
  'ih', 'im', 'om', 'em', 'og', 'eg', 'oj', 'ej', 'ju', 'ja', 'je', 'ji', 'la', 'lo', 'li',
  'a', 'e', 'i', 'o', 'u',
];

export function stemSerbianToken(token: string): string {
  // Kratke reči i brojeve ne skraćujemo
  if (token.length <= 4 || /^\d+$/.test(token)) {
    return token;
  }

  for (const suffix of SERBIAN_SUFFIXES) {
    if (token.endsWith(suffix)) {
      const stem = token.slice(0, token.length - suffix.length);
      // Zadrži najmanje 4 karaktera korena da izbegnemo lažna spajanja kratkih reči
      if (stem.length >= 4) {
        return stem;
      }
    }
  }
  return token;
}

export function extractContentTokens(normalizedText: string): string[] {
  if (!normalizedText) return [];
  const rawTokens = normalizedText.split(' ').filter(Boolean);
  const out: string[] = [];

  for (const tok of rawTokens) {
    if (tok.length <= 1) continue;
    if (SERBIAN_STOP_WORDS.has(tok) || ENGLISH_STOP_WORDS.has(tok)) continue;
    // Zadrži brojeve od >= 2 cifre (godine, iznose, procente) i reči >= 2 znaka
    if (/^\d+$/.test(tok)) {
      if (tok.length >= 2) out.push(tok);
      continue;
    }
    out.push(stemSerbianToken(tok));
  }
  return out;
}

function addWeightedFeatures(
  features: Map<string, number>,
  tokens: string[],
  wordWeight: number,
  ngramWeight: number
): void {
  for (const tok of tokens) {
    const wKey = `w:${tok}`;
    features.set(wKey, (features.get(wKey) ?? 0) + wordWeight);

    // Karakter 4-grami hvataju glasovne promene (banka/banci, sastanak/sastanka, republika/republici)
    if (ngramWeight > 0 && tok.length >= 5 && !/^\d+$/.test(tok)) {
      for (let i = 0; i <= tok.length - 4; i += 1) {
        const gKey = `g:${tok.slice(i, i + 4)}`;
        features.set(gKey, (features.get(gKey) ?? 0) + ngramWeight);
      }
    }
  }
}

export interface TfIdfOptions {
  titleWeight?: number;
  snippetWeight?: number;
  ngramRatio?: number;
}

/**
 * TF-IDF + kosinusna sličnost prilagođena srpskom jeziku:
 * - srpske i engleske stop-reči
 * - lagani srpski stemming za padeže
 * - kombinacija reči i karakter 4-grama (hvata i sibilarizaciju/nepostojano a)
 * - naslov nosi veću težinu od uvoda
 */
export class TfIdfSimilarityProvider implements SimilarityProvider {
  public readonly name = 'tfidf-sr-hybrid';
  private readonly titleWeight: number;
  private readonly snippetWeight: number;
  private readonly ngramRatio: number;

  constructor(options: TfIdfOptions = {}) {
    this.titleWeight = options.titleWeight ?? 2.2;
    this.snippetWeight = options.snippetWeight ?? 1.0;
    this.ngramRatio = options.ngramRatio ?? 0.3;
  }

  public extractFeatures(doc: TextDocument): Map<string, number> {
    const features = new Map<string, number>();
    const titleNorm = doc.titleNorm || '';
    const titleTokens = extractContentTokens(titleNorm);

    addWeightedFeatures(
      features,
      titleTokens,
      this.titleWeight,
      this.titleWeight * this.ngramRatio
    );

    if (doc.snippet && doc.snippet.trim().length > 0) {
      const snippetNorm = normalizeForComparison(doc.snippet);
      const snippetTokens = extractContentTokens(snippetNorm);
      addWeightedFeatures(
        features,
        snippetTokens,
        this.snippetWeight,
        this.snippetWeight * this.ngramRatio
      );
    }

    return features;
  }

  private cosineWithIdf(
    tfA: Map<string, number>,
    tfB: Map<string, number>,
    idf: Map<string, number> | null
  ): number {
    if (tfA.size === 0 || tfB.size === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const [term, valA] of tfA.entries()) {
      const w = idf ? (idf.get(term) ?? 1) : 1;
      const weightedA = (1 + Math.log(valA)) * w;
      normA += weightedA * weightedA;

      const valB = tfB.get(term);
      if (valB !== undefined) {
        const weightedB = (1 + Math.log(valB)) * w;
        dot += weightedA * weightedB;
      }
    }

    if (dot === 0 || normA === 0) return 0;

    for (const [term, valB] of tfB.entries()) {
      const w = idf ? (idf.get(term) ?? 1) : 1;
      const weightedB = (1 + Math.log(valB)) * w;
      normB += weightedB * weightedB;
    }

    if (normB === 0) return 0;
    return Math.min(1, Math.max(0, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
  }

  public similarity(a: TextDocument, b: TextDocument): number {
    const tfA = this.extractFeatures(a);
    const tfB = this.extractFeatures(b);
    return this.cosineWithIdf(tfA, tfB, null);
  }

  public findMostSimilar(
    query: TextDocument,
    corpus: TextDocument[],
    minScore: number = 0
  ): SimilarityMatch | null {
    if (corpus.length === 0) return null;

    const queryTf = this.extractFeatures(query);
    if (queryTf.size === 0) return null;

    const corpusTfs = corpus.map((doc) => ({
      id: doc.id,
      tf: this.extractFeatures(doc),
    }));

    // Računaj glatki IDF samo ako je korpus dovoljno velik (>= 5 dokumenata);
    // za mali korpus čist TF kosinus je stabilniji i predvidljiviji.
    let idf: Map<string, number> | null = null;
    if (corpus.length >= 5) {
      const df = new Map<string, number>();
      const totalDocs = corpus.length + 1;

      for (const term of queryTf.keys()) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
      for (const entry of corpusTfs) {
        for (const term of entry.tf.keys()) {
          df.set(term, (df.get(term) ?? 0) + 1);
        }
      }

      idf = new Map<string, number>();
      for (const [term, count] of df.entries()) {
        idf.set(term, Math.log((totalDocs + 1) / (count + 1)) + 1);
      }
    }

    let best: SimilarityMatch | null = null;
    for (const entry of corpusTfs) {
      const score = this.cosineWithIdf(queryTf, entry.tf, idf);
      if (score >= minScore && (!best || score > best.score)) {
        best = { id: entry.id, score };
      }
    }

    return best;
  }
}
