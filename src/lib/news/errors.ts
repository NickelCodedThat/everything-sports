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
