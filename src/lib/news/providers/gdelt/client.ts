const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

export interface GdeltArticleRaw {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

interface GdeltResponseBody {
  articles?: GdeltArticleRaw[];
}

export interface FetchGdeltArticlesParams {
  query: string;
  /** GDELT timespan, e.g. "3h", "1d". Falls back to "3h" if not a recognized GDELT unit. */
  window: string;
  /** Clamped to GDELT's supported 1-250 range. */
  limit: number;
}

const TIMESPAN_PATTERN = /^\d+(min|h|d|w|m)$/;

/** Accepts our CLI's window string as-is when it already matches GDELT's own timespan grammar. */
function toGdeltTimespan(window: string): string {
  return TIMESPAN_PATTERN.test(window) ? window : "3h";
}

/**
 * Raw GDELT DOC 2.0 fetch — no normalization here, just the HTTP call and
 * minimal shape validation. Throws on network failure, non-2xx status, or a
 * response that isn't the JSON article-list shape we expect (GDELT returns
 * an HTML error page for malformed queries, not JSON).
 */
export async function fetchGdeltArticles({
  query,
  window,
  limit,
}: FetchGdeltArticlesParams): Promise<GdeltArticleRaw[]> {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    timespan: toGdeltTimespan(window),
    maxrecords: String(Math.min(Math.max(limit, 1), 250)),
    sort: "datedesc",
  });

  const url = `${GDELT_ENDPOINT}?${params.toString()}`;

  // GDELT's connection establishment has been observed to take close to
  // (and occasionally exceed) undici's 10s default connect timeout under
  // real-world network conditions; 20s gives it room without hanging forever.
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`GDELT request failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!contentType.includes("json")) {
    throw new Error(`GDELT returned a non-JSON response (content-type: ${contentType || "unknown"})`);
  }

  let body: GdeltResponseBody;
  try {
    body = JSON.parse(text) as GdeltResponseBody;
  } catch {
    throw new Error("GDELT returned a response that could not be parsed as JSON");
  }

  if (!Array.isArray(body.articles)) {
    return [];
  }

  return body.articles;
}
