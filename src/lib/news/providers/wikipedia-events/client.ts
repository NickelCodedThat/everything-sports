import { ProviderRateLimitedError, parseRetryAfter } from "../../errors";

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";

/**
 * Wikimedia's API etiquette requires a descriptive User-Agent with contact
 * information (https://www.mediawiki.org/wiki/API:Etiquette). We use the
 * project repository as the contact point.
 */
const USER_AGENT =
  "EverythingSportsNewsroom/0.1 (https://github.com/NickelCodedThat/everything-sports; discovery-only headline/link index)";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Wikipedia's daily page title, e.g. "Portal:Current_events/2026_September_19" (UTC date). */
export function currentEventsPageTitle(date: Date): string {
  return `Portal:Current_events/${date.getUTCFullYear()}_${MONTH_NAMES[date.getUTCMonth()]}_${date.getUTCDate()}`;
}

interface ParseResponseBody {
  parse?: { wikitext?: string };
  error?: { code?: string; info?: string };
}

/**
 * Fetches one day's Current Events page as wikitext via the MediaWiki parse
 * API. Returns null when the page doesn't exist yet (e.g. a day that hasn't
 * been started), which is a normal empty result, not an error.
 */
export async function fetchCurrentEventsWikitext(date: Date): Promise<string | null> {
  const params = new URLSearchParams({
    action: "parse",
    page: currentEventsPageTitle(date),
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });

  const response = await fetch(`${WIKIPEDIA_API}?${params.toString()}`, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 429) {
    throw new ProviderRateLimitedError(
      "Wikipedia request failed: 429 Too Many Requests (rate limited)",
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }
  if (!response.ok) {
    throw new Error(`Wikipedia request failed: ${response.status} ${response.statusText}`);
  }

  let body: ParseResponseBody;
  try {
    body = (await response.json()) as ParseResponseBody;
  } catch {
    throw new Error("Wikipedia returned a response that could not be parsed as JSON");
  }

  if (body.error?.code === "missingtitle") return null;
  if (body.error) throw new Error(`Wikipedia API error: ${body.error.code ?? "unknown"}`);

  return body.parse?.wikitext ?? null;
}
