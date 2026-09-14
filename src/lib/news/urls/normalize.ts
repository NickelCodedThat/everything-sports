/**
 * Conservative URL normalization for candidate deduplication. Deliberately
 * narrow: only strips things we're confident are safe to strip (fragments,
 * known tracking params, hostname casing). Never touches path casing, path
 * segments, or unrecognized query params — an aggressive rewrite risks
 * merging two genuinely different articles.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_reader",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

export interface NormalizedUrl {
  /** The normalized absolute URL string. */
  href: string;
  /** Lowercased hostname, with a leading "www." stripped. */
  hostname: string;
}

/**
 * Returns null for anything that isn't a well-formed absolute http(s) URL —
 * callers should treat that as "reject this candidate," not attempt repair.
 */
export function normalizeUrl(rawUrl: string): NormalizedUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  for (const param of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(param.toLowerCase())) {
      url.searchParams.delete(param);
    }
  }

  // Drop a trailing "?" left behind when every param was a tracking param.
  let href = url.toString();
  if (href.endsWith("?")) href = href.slice(0, -1);

  const hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : url.hostname;

  return { href, hostname };
}

/** Convenience for callers that only need the publisher domain, e.g. when a provider omits one. */
export function extractDomain(rawUrl: string): string | undefined {
  return normalizeUrl(rawUrl)?.hostname;
}
