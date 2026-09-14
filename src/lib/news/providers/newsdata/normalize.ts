import type { Sport } from "@/types/sport";
import { buildCandidate } from "../../normalization/build-candidate";
import type { NewsCandidate } from "../../candidates/types";
import type { NewsDataArticleRaw } from "./client";

/** NewsData's `pubDate` is "YYYY-MM-DD HH:MM:SS" (UTC). Returns undefined for anything else. */
export function parseNewsDataPubDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value);
  if (!match) return undefined;
  const iso = `${match[1]}T${match[2]}Z`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

/**
 * Maps one raw NewsData article into a NewsCandidate, or null if malformed.
 * Free-tier NewsData results run roughly 12 hours behind — the aggregator
 * and CLI report this via `expectedFreshness`, never by silently reordering
 * results to hide it.
 */
export function normalizeNewsDataArticle(
  raw: NewsDataArticleRaw,
  queryProfileSport: Sport,
): NewsCandidate | null {
  return buildCandidate({
    provider: "newsdata",
    providerItemId: raw.article_id,
    headline: raw.title,
    sourceUrl: raw.link,
    publisherName: raw.source_name ?? raw.source_id,
    publisherDomainHint: raw.source_url,
    publishedAt: parseNewsDataPubDate(raw.pubDate),
    language: raw.language,
    providerCategories: raw.category,
    snippet: raw.description ?? undefined,
    queryProfileSport,
    imageRef: raw.image_url ? { url: raw.image_url, note: "NewsData image_url (diagnostic only)" } : undefined,
  });
}
