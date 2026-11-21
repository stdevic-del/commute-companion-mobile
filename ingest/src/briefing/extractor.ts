import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

export const DEFAULT_MAX_EXCERPT_CHARS = 3_500;
const MIN_CLEAN_TEXT_CHARS = 140;

function collapseText(raw: string): string {
  return raw
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trimToMaxChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );
  if (lastSentence > Math.floor(maxChars * 0.65)) {
    return slice.slice(0, lastSentence + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > Math.floor(maxChars * 0.7) ? slice.slice(0, lastSpace) : slice).trim();
}

/**
 * Privremeno u RAM memoriji izvlači čist tekst članka pomoću `@mozilla/readability` + `linkedom`.
 * Pozivalac ovaj tekst sme držati isključivo u lokalnoj promenljivoj dok traje poziv LLM-u —
 * NIKADA se ne čuva u bazi, ne upisuje u JSON i ne ispisuje u logove.
 */
export function extractCleanArticleTextInRam(
  html: string,
  maxChars: number = DEFAULT_MAX_EXCERPT_CHARS
): string | null {
  if (!html || html.length < 100) return null;

  try {
    const { document } = parseHTML(html);
    const reader = new Readability(
      document as unknown as ConstructorParameters<typeof Readability>[0],
      { charThreshold: 120 }
    );
    const parsed = reader.parse();
    const rawText = parsed?.textContent ?? '';
    const clean = collapseText(rawText);
    if (clean.length < MIN_CLEAN_TEXT_CHARS) {
      return null;
    }
    return trimToMaxChars(clean, maxChars);
  } catch {
    return null;
  }
}
