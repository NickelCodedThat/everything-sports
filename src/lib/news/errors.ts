/**
 * Node's fetch (undici) throws a generic "fetch failed" for most network-level
 * failures (DNS, TCP, TLS, timeout), with the actual cause nested in
 * `error.cause`. Surfacing it makes CLI/report output far more diagnosable
 * than the bare top-level message.
 */
export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return `${error.message}: ${cause.message}`;
  }
  if (cause) {
    return `${error.message}: ${String(cause)}`;
  }
  return error.message;
}

/**
 * Thrown by provider clients on HTTP 429 (or an equivalent "slow down" body).
 * Providers treat this differently from a generic failure: they stop issuing
 * further requests immediately and report a "throttled" status so the
 * newsroom health report can distinguish "rate limited" from "broken".
 */
export class ProviderRateLimitedError extends Error {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "ProviderRateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Parses a Retry-After header (delta-seconds or HTTP-date) into milliseconds, if present and sane. */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 3_600_000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(date - Date.now(), 0), 3_600_000);
}
