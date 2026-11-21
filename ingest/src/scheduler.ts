import type { FetchStateRow, SourceConfig } from './types.ts';

export type FetchOutcome =
  | {
      kind: 'fetched';
      status: number;
      etag: string | null;
      lastModified: string | null;
      hasNewContent?: boolean;
    }
  | {
      kind: 'not_modified';
      status: number;
      etag: string | null;
      lastModified: string | null;
    }
  | {
      kind: 'rate_limited';
      status: number;
      retryAfterMs: number | null;
      error: string;
    }
  | {
      kind: 'blocked_robots';
      error: string;
    }
  | {
      kind: 'error';
      status: number | null;
      error: string;
    };

const MIN_RETRY_AFTER_MS = 1_000;
const MAX_RETRY_AFTER_MS = 6 * 3600 * 1_000;

/**
 * Parsira HTTP `Retry-After` zaglavlje (sekunde ili HTTP datum).
 * Vraća broj milisekundi ili null ako zaglavlje ne postoji ili je neispravno.
 */
export function parseRetryAfterMs(headerValue: string | null, nowMs: number = Date.now()): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds)) return null;
    return Math.min(MAX_RETRY_AFTER_MS, Math.max(MIN_RETRY_AFTER_MS, seconds * 1_000));
  }

  const targetMs = Date.parse(trimmed);
  if (Number.isNaN(targetMs)) return null;
  const delta = targetMs - nowMs;
  if (delta <= 0) return MIN_RETRY_AFTER_MS;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(MIN_RETRY_AFTER_MS, delta));
}

function addMsIso(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

/**
 * Računa novo stanje `fetch_state` sa adaptivnim intervalima i backoff logikom.
 */
export function computeNextFetchState(
  source: SourceConfig,
  prev: FetchStateRow,
  outcome: FetchOutcome,
  now: Date = new Date()
): FetchStateRow {
  const nowIso = now.toISOString();
  const baseMin = source.baseIntervalMin;
  const maxMin = source.maxIntervalMin;
  const prevInterval = Math.max(baseMin, prev.current_interval_min || baseMin);

  switch (outcome.kind) {
    case 'fetched': {
      const hasNew = outcome.hasNewContent ?? true;
      const nextIntervalMin = hasNew
        ? baseMin
        : Math.min(maxMin, Math.max(baseMin, Math.round(prevInterval * 1.25)));

      return {
        source_id: source.id,
        etag: outcome.etag,
        last_modified: outcome.lastModified,
        last_status: outcome.status,
        last_fetched_at: nowIso,
        next_check_at: addMsIso(now, nextIntervalMin * 60_000),
        current_interval_min: nextIntervalMin,
        consecutive_304: 0,
        consecutive_errors: 0,
        last_error: null,
      };
    }

    case 'not_modified': {
      const nextIntervalMin = Math.min(
        maxMin,
        Math.max(baseMin, Math.round(prevInterval * 1.5))
      );

      return {
        source_id: source.id,
        etag: outcome.etag ?? prev.etag,
        last_modified: outcome.lastModified ?? prev.last_modified,
        last_status: outcome.status,
        last_fetched_at: nowIso,
        next_check_at: addMsIso(now, nextIntervalMin * 60_000),
        current_interval_min: nextIntervalMin,
        consecutive_304: prev.consecutive_304 + 1,
        consecutive_errors: 0,
        last_error: null,
      };
    }

    case 'rate_limited': {
      const errors = prev.consecutive_errors + 1;
      const backoffMin = Math.min(
        maxMin * 2,
        Math.max(baseMin, baseMin * Math.pow(2, Math.min(errors, 4)))
      );
      const waitMs = Math.max(backoffMin * 60_000, outcome.retryAfterMs ?? 0);
      const effectiveMin = Math.ceil(waitMs / 60_000);

      return {
        source_id: source.id,
        etag: prev.etag,
        last_modified: prev.last_modified,
        last_status: outcome.status,
        last_fetched_at: nowIso,
        next_check_at: addMsIso(now, waitMs),
        current_interval_min: Math.min(maxMin * 2, Math.max(baseMin, effectiveMin)),
        consecutive_304: prev.consecutive_304,
        consecutive_errors: errors,
        last_error: outcome.error,
      };
    }

    case 'blocked_robots': {
      const waitMin = Math.max(maxMin, 120);
      return {
        source_id: source.id,
        etag: prev.etag,
        last_modified: prev.last_modified,
        last_status: 0,
        last_fetched_at: nowIso,
        next_check_at: addMsIso(now, waitMin * 60_000),
        current_interval_min: maxMin,
        consecutive_304: prev.consecutive_304,
        consecutive_errors: prev.consecutive_errors + 1,
        last_error: outcome.error,
      };
    }

    case 'error': {
      const errors = prev.consecutive_errors + 1;
      const backoffMin = Math.min(
        maxMin * 2,
        Math.max(baseMin, baseMin * Math.pow(2, Math.min(errors, 4)))
      );

      return {
        source_id: source.id,
        etag: prev.etag,
        last_modified: prev.last_modified,
        last_status: outcome.status,
        last_fetched_at: nowIso,
        next_check_at: addMsIso(now, backoffMin * 60_000),
        current_interval_min: backoffMin,
        consecutive_304: prev.consecutive_304,
        consecutive_errors: errors,
        last_error: outcome.error,
      };
    }
  }
}
