const CYRILLIC_CHECK_RE = /[\u0400-\u04FF]/;
const UPPER_LETTER_RE = /^[A-ZČĆŽŠĐА-ЯЂЈЉЊЋЏ]$/;
const LOWER_LETTER_RE = /^[a-zčćžšđa-яђјљњћџ]$/;

const SINGLE_CHAR_MAP: Record<string, string> = {
  А: 'A', а: 'a',
  Б: 'B', б: 'b',
  В: 'V', в: 'v',
  Г: 'G', г: 'g',
  Д: 'D', д: 'd',
  Ђ: 'Đ', ђ: 'đ',
  Е: 'E', е: 'e',
  Ж: 'Ž', ж: 'ž',
  З: 'Z', з: 'z',
  И: 'I', и: 'i',
  Ј: 'J', ј: 'j',
  К: 'K', к: 'k',
  Л: 'L', л: 'l',
  љ: 'lj',
  М: 'M', м: 'm',
  Н: 'N', н: 'n',
  њ: 'nj',
  О: 'O', о: 'o',
  П: 'P', п: 'p',
  Р: 'R', р: 'r',
  С: 'S', с: 's',
  Т: 'T', т: 't',
  Ћ: 'Ć', ћ: 'ć',
  У: 'U', у: 'u',
  Ф: 'F', ф: 'f',
  Х: 'H', х: 'h',
  Ц: 'C', ц: 'c',
  Ч: 'Č', ч: 'č',
  џ: 'dž',
  Ш: 'Š', ш: 'š',
};

const UPPER_DIGRAPH_MAP: Record<string, { title: string; allCaps: string }> = {
  Љ: { title: 'Lj', allCaps: 'LJ' },
  Њ: { title: 'Nj', allCaps: 'NJ' },
  Џ: { title: 'Dž', allCaps: 'DŽ' },
};

/**
 * Čista funkcija za srpsku transliteraciju ćirilice u punu latinicu.
 * Ispravno obrađuje dvoslove (`љ->lj`, `њ->nj`, `џ->dž`), uključujući velika slova na početku reči
 * (`Љубојевић -> Ljubojević`, `Њујорк -> Njujork`, `Џепна -> Džepna`) i reči pisane svim velikim slovima
 * (`ЉУБЉАНА -> LJUBLJANA`, `КОЊ -> KONJ`, `ЏЕЗ -> DŽEZ`).
 */
export function cyrillicToLatin(input: string): string {
  if (!input) return '';
  if (!CYRILLIC_CHECK_RE.test(input)) return input;

  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const digraph = UPPER_DIGRAPH_MAP[ch];
    if (digraph) {
      const prev = i > 0 ? input[i - 1] : '';
      const next = i + 1 < input.length ? input[i + 1] : '';
      const nextIsUpper = Boolean(next && UPPER_LETTER_RE.test(next));
      const nextIsLower = Boolean(next && LOWER_LETTER_RE.test(next));
      const prevIsUpper = Boolean(prev && UPPER_LETTER_RE.test(prev));
      const useAllCaps = nextIsUpper || (!nextIsLower && prevIsUpper);
      out += useAllCaps ? digraph.allCaps : digraph.title;
      continue;
    }

    out += SINGLE_CHAR_MAP[ch] ?? ch;
  }

  return out;
}
