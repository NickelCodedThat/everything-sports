import type { Sport } from "@/types/sport";
import { QUERYABLE_SPORTS } from "../../queries/sport-profiles";
import { ProviderRateLimitedError, describeFetchError } from "../../errors";
import { buildCandidate } from "../../normalization/build-candidate";
import type { NewsCandidate } from "../../candidates/types";
import type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "../types";
import { fetchCurrentEventsWikitext } from "./client";
import { parseSportsSection } from "./parse";

const MS_PER_HOUR = 3_600_000;
const MAX_DAYS = 7;
/** Sequential, spaced requests — Wikimedia asks clients to go in series, not in parallel. */
const REQUEST_SPACING_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Converts a "3h" / "2d" / "90min" window into a number of daily pages (at least today + yesterday). */
export function windowToDays(window: string): number {
  const match = /^(\d+)(min|h|d|w|m)$/.exec(window);
  if (!match) return 2;
  const value = Number(match[1]);
  const hours =
    match[2] === "min" ? value / 60 : match[2] === "h" ? value : match[2] === "d" ? value * 24 : match[2] === "w" ? value * 168 : value * 720;
  return Math.min(MAX_DAYS, Math.max(2, Math.ceil(hours / 24)));
}

/** Date-only precision: Current Events groups items by UTC day, so the timestamp is that day's start. */
function dayStartIso(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

export const wikipediaEventsProvider: CandidateProvider = {
  id: "wikipedia-events",
  displayName: "Wikipedia Current Events (sports)",
  requiresApiKey: false,
  expectedFreshness: "daily-curated",

  async fetchCandidates({ sport, window, limit }: FetchCandidatesOptions): Promise<CandidateProviderResult> {
    const startedAt = Date.now();
    const days = windowToDays(window);
    const now = new Date();

    const candidates: NewsCandidate[] = [];
    const errors: string[] = [];
    let throttled = false;

    for (let offset = 0; offset < days; offset += 1) {
      if (offset > 0) await delay(REQUEST_SPACING_MS);
      const pageDate = new Date(now.getTime() - offset * 24 * MS_PER_HOUR);

      let wikitext: string | null;
      try {
        wikitext = await fetchCurrentEventsWikitext(pageDate);
      } catch (error) {
        if (error instanceof ProviderRateLimitedError) {
          throttled = true;
          errors.push(error.message);
          break;
        }
        errors.push(describeFetchError(error));
        continue;
      }
      if (!wikitext) continue;

      const publishedAt = dayStartIso(pageDate);
      for (const item of parseSportsSection(wikitext)) {
        for (const link of item.links) {
          const candidate = buildCandidate({
            provider: "wikipedia-events",
            headline: item.text,
            sourceUrl: link.url,
            publisherName: link.label,
            publishedAt,
            language: "en",
            queryProfileLabel: "current-events",
            classificationContext: item.parent,
          });
          if (candidate) candidates.push(candidate);
        }
      }
    }

    // Feed-style provider: it isn't queried per sport, so honor a requested sport by filtering afterward.
    const wanted: Sport | "all" = sport;
    const filtered = candidates.filter((candidate) => wanted === "all" || candidate.classification.sport === wanted);
    const cap = limit * (wanted === "all" ? QUERYABLE_SPORTS.length : 1);
    const result = filtered.slice(0, cap);

    const durationMs = Date.now() - startedAt;

    if (throttled && result.length === 0) {
      return { providerId: "wikipedia-events", candidates: [], status: "throttled", message: errors.join("; "), durationMs };
    }
    if (errors.length > 0 && result.length === 0 && candidates.length === 0) {
      return { providerId: "wikipedia-events", candidates: [], status: "error", message: errors.join("; "), durationMs };
    }

    return {
      providerId: "wikipedia-events",
      candidates: result,
      status: "ok",
      message: errors.length > 0 ? `partial failures: ${errors.join("; ")}` : undefined,
      durationMs,
    };
  },
};
