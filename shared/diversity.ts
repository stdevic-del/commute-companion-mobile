/**
 * Zajedničko pravilo raznovrsnosti (Source Diversity Cap) za `ingest` i frontend prikaz:
 * Isti ključ (npr. izdavač/medij) ne sme da ima više od `maxConsecutive` (podrazumevano 2)
 * uzastopnih stavki dok god u preostalom nizu postoji stavka sa drugim ključem.
 * Nijedna stavka se ne briše — višak se samo pomera niže niz listu.
 */
export function enforceMaxConsecutiveKey<T>(
  items: T[],
  getKey: (item: T) => string,
  maxConsecutive = 2
): T[] {
  const cap = Math.max(1, maxConsecutive);
  if (items.length <= cap) return [...items];

  const pool = [...items];
  const out: T[] = [];

  while (pool.length > 0) {
    let lastKey: string | null = null;
    let consecutiveCount = 0;

    if (out.length >= cap) {
      lastKey = getKey(out[out.length - 1]);
      for (let i = out.length - 1; i >= 0; i -= 1) {
        if (getKey(out[i]) === lastKey) {
          consecutiveCount += 1;
        } else {
          break;
        }
      }
    }

    if (consecutiveCount >= cap && lastKey) {
      const altIdx = pool.findIndex((candidate) => getKey(candidate) !== lastKey);
      if (altIdx !== -1) {
        const [picked] = pool.splice(altIdx, 1);
        out.push(picked);
        continue;
      }
    }

    out.push(pool.shift()!);
  }

  return out;
}
