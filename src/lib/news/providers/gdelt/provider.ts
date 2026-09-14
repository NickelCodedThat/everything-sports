import type { Sport } from "@/types/sport";
import { QUERYABLE_SPORTS } from "../../queries/sport-profiles";
import { describeFetchError } from "../../errors";
import type { NewsCandidate } from "../../candidates/types";
import type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "../types";
import { fetchGdeltArticles } from "./client";
import { buildGdeltQuery } from "./queries";
import { normalizeGdeltArticle } from "./normalize";

/** GDELT documents a hard limit of one request per 5 seconds per client and returns 429 otherwise. */
const GDELT_MIN_REQUEST_INTERVAL_MS = 5_100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchForSport(
  sport: Sport,
  window: string,
  limit: number,
): Promise<{ candidates: NewsCandidate[]; error?: string }> {
  const query = buildGdeltQuery(sport);
  if (!query) return { candidates: [] };

  try {
    const rawArticles = await fetchGdeltArticles({ query, window, limit });
    const candidates = rawArticles
      .map((raw) => normalizeGdeltArticle(raw, sport))
      .filter((candidate): candidate is NewsCandidate => candidate !== null);
    return { candidates };
  } catch (error) {
    return { candidates: [], error: describeFetchError(error) };
  }
}

export const gdeltProvider: CandidateProvider = {
  id: "gdelt",
  displayName: "GDELT DOC 2.0",
  requiresApiKey: false,
  expectedFreshness: "near-realtime",

  async fetchCandidates({ sport, window, limit }: FetchCandidatesOptions): Promise<CandidateProviderResult> {
    const startedAt = Date.now();
    const sports = sport === "all" ? QUERYABLE_SPORTS : [sport];

    const candidates: NewsCandidate[] = [];
    const profileErrors: string[] = [];

    for (const [index, currentSport] of sports.entries()) {
      if (index > 0) {
        // Respect GDELT's documented "one request every 5 seconds" limit
        // when a single probe spans multiple sport profiles.
        await delay(GDELT_MIN_REQUEST_INTERVAL_MS);
      }
      const result = await fetchForSport(currentSport, window, limit);
      candidates.push(...result.candidates);
      if (result.error) {
        profileErrors.push(`${currentSport}: ${result.error}`);
      }
    }

    const durationMs = Date.now() - startedAt;

    if (profileErrors.length > 0 && candidates.length === 0) {
      return {
        providerId: "gdelt",
        candidates: [],
        status: "error",
        message: profileErrors.join("; "),
        durationMs,
      };
    }

    return {
      providerId: "gdelt",
      candidates,
      status: "ok",
      message: profileErrors.length > 0 ? `partial failures: ${profileErrors.join("; ")}` : undefined,
      durationMs,
    };
  },
};
