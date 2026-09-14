const NEWSDATA_ENDPOINT = "https://newsdata.io/api/1/news";

export interface NewsDataArticleRaw {
  article_id?: string;
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  image_url?: string;
  source_id?: string;
  source_name?: string;
  source_url?: string;
  language?: string;
  category?: string[];
}

interface NewsDataResponseBody {
  status?: string;
  results?: NewsDataArticleRaw[];
}

export interface FetchNewsDataArticlesParams {
  apiKey: string;
  query: string;
  limit: number;
}

/**
 * Raw NewsData.io fetch. No normalization here — see normalize.ts. Endpoint
 * and field names follow NewsData's documented v1 "news" API as of this
 * policy's review date; re-verify against a live key before relying on this
 * in a scheduled/production context (see docs/NEWS-SOURCE-STRATEGY.md).
 */
export async function fetchNewsDataArticles({
  apiKey,
  query,
  limit,
}: FetchNewsDataArticlesParams): Promise<NewsDataArticleRaw[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    q: query,
    language: "en",
    category: "sports",
    // NewsData's free tier caps results per page well below our own limit
    // ceiling; we still cap defensively rather than trusting the response size.
    size: String(Math.min(Math.max(limit, 1), 10)),
  });

  const url = `${NEWSDATA_ENDPOINT}?${params.toString()}`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

  const body = (await response.json().catch(() => null)) as NewsDataResponseBody | null;

  if (!response.ok || !body) {
    const detail = body ? JSON.stringify(body).slice(0, 200) : `${response.status} ${response.statusText}`;
    throw new Error(`NewsData request failed: ${detail}`);
  }

  if (!Array.isArray(body.results)) {
    return [];
  }

  return body.results.slice(0, limit);
}
