const TRACKING_PREFIXES = [
  'utm_',
  'mc_',
  'pk_',
  'mtm_',
  'hsa_',
  'vero_',
  'oly_',
  '_ga',
  '_gl',
  'fb_',
];

const TRACKING_EXACT = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'msclkid',
  'yclid',
  'twclid',
  'igshid',
  'si',
  'ref',
  'ref_src',
  'ref_url',
  'share',
  'sr_share',
  'ncid',
  'ocid',
  'cmpid',
  'cid',
  'ved',
  'usg',
  'ei',
  'sa',
  'rct',
  'esrc',
  'outputtype',
  'amp',
]);

function isTrackingParam(key: string): boolean {
  const low = key.toLowerCase();
  if (TRACKING_EXACT.has(low)) return true;
  return TRACKING_PREFIXES.some((prefix) => low.startsWith(prefix));
}

function normalizeUrlObject(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function isMeaningfulPath(pathname: string): boolean {
  const cleaned = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  return cleaned.length > 1;
}

/**
 * Kreira deterministički kanonski URL:
 * - daje prednost `canonicalHint` (<link rel="canonical">) osim ako vodi na praznu početnu stranu
 * - uklanja tracking parametre (`utm_*`, `fbclid`, `gclid`, `mc_*`, `ref`, ...)
 * - sortira preostale query parametre
 * - uklanja `#fragment`, podrazumevane portove i završnu kosu crtu
 */
export function canonicalizeUrl(rawUrl: string, canonicalHint?: string | null): string {
  const primary = normalizeUrlObject(rawUrl);
  const hint = canonicalHint ? normalizeUrlObject(canonicalHint) : null;

  let chosen: URL | null = primary;
  if (hint) {
    // Prihvati canonicalHint ako ima specifičnu putanju, ili ako ni rawUrl nema dublju putanju
    if (isMeaningfulPath(hint.pathname) || !primary || !isMeaningfulPath(primary.pathname)) {
      chosen = hint;
    }
  }

  if (!chosen) return rawUrl.trim();

  chosen.protocol = chosen.protocol.toLowerCase();
  chosen.hostname = chosen.hostname.toLowerCase();
  if (
    (chosen.protocol === 'http:' && chosen.port === '80') ||
    (chosen.protocol === 'https:' && chosen.port === '443')
  ) {
    chosen.port = '';
  }

  chosen.hash = '';

  // Očisti duple kose crte i završnu kosu crtu (osim za koren '/')
  let pathname = chosen.pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  chosen.pathname = pathname || '/';

  // Ukloni tracking query parametre i sortiraj ostale
  const kept: Array<[string, string]> = [];
  for (const [k, v] of chosen.searchParams.entries()) {
    if (!isTrackingParam(k)) {
      kept.push([k, v]);
    }
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  chosen.search = '';
  for (const [k, v] of kept) {
    chosen.searchParams.append(k, v);
  }

  return chosen.toString();
}
