import type { Sport } from "@/types/sport";
import { buildCandidate } from "../../normalization/build-candidate";
import type { NewsCandidate } from "../../candidates/types";
import type { GdeltArticleRaw } from "./client";

/**
 * GDELT's `seendate` is when GDELT itself indexed the article (its closest
 * approximation to publish time, not a guarantee) — format `YYYYMMDDTHHMMSSZ`.
 * Returns undefined rather than throwing on anything else.
 */
export function parseGdeltSeenDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

/**
 * Maps one raw GDELT article row into a NewsCandidate, or null if the row is
 * missing a headline or usable source URL — malformed rows are skipped, not
 * thrown. GDELT is recorded as the discovering provider, never as the
 * article's publisher (see the policy registry's GDELT notes).
 */
export function normalizeGdeltArticle(
  raw: GdeltArticleRaw,
  queryProfileSport: Sport,
): NewsCandidate | null {
  return buildCandidate({
    provider: "gdelt",
    headline: raw.title,
    sourceUrl: raw.url,
    publisherDomainHint: raw.domain,
    publishedAt: parseGdeltSeenDate(raw.seendate),
    language: raw.language,
    queryProfileSport,
    imageRef: raw.socialimage ? { url: raw.socialimage, note: "GDELT socialimage (diagnostic only)" } : undefined,
  });
}
