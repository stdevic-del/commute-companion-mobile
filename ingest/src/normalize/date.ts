const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000; // 5 min tolerancija satova
const MAX_AGE_DAYS = 30;
const MIN_VALID_YEAR = 2020;

const SR_DATE_RE =
  /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?(?:\s*(?:u\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i;

function parseDateMs(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Srpski / evropski format: "21.11.2026. 18:30" ili "21.11.2026"
  const srMatch = trimmed.match(SR_DATE_RE);
  if (srMatch) {
    const day = Number(srMatch[1]);
    const month = Number(srMatch[2]);
    const year = Number(srMatch[3]);
    const hour = srMatch[4] ? Number(srMatch[4]) : 0;
    const min = srMatch[5] ? Number(srMatch[5]) : 0;
    const sec = srMatch[6] ? Number(srMatch[6]) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && min <= 59 && sec <= 59) {
      // Pretpostavi CET (+01:00) kad vremenska zona nije navedena
      const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}+01:00`;
      const ms = Date.parse(iso);
      if (!Number.isNaN(ms)) return ms;
    }
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Normalizuje datum objave u UTC ISO 8601 format (`...Z`).
 * Neispravni, prestari (> 30 dana) ili budući datumi (> now + 5 min) svode se na `firstSeenAt`.
 */
export function normalizePublishedAt(
  rawDate: string | null | undefined,
  firstSeenAt: Date = new Date()
): string {
  const fallbackIso = firstSeenAt.toISOString();
  if (!rawDate) return fallbackIso;

  const parsedMs = parseDateMs(rawDate);
  if (parsedMs === null) return fallbackIso;

  const nowMs = firstSeenAt.getTime();
  const minAllowedMs = nowMs - MAX_AGE_DAYS * 24 * 3600 * 1_000;
  const maxAllowedMs = nowMs + MAX_FUTURE_SKEW_MS;

  const d = new Date(parsedMs);
  if (d.getUTCFullYear() < MIN_VALID_YEAR) return fallbackIso;
  if (parsedMs > maxAllowedMs) return fallbackIso;
  if (parsedMs < minAllowedMs) return fallbackIso;

  return d.toISOString();
}
