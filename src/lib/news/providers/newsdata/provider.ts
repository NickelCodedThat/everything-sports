import type { Sport } from "@/types/sport";
import { QUERYABLE_SPORTS } from "../../queries/sport-profiles";
import { describeFetchError } from "../../errors";
import type { NewsCandidate } from "../../candidates/types";
import type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "../types";
import { fetchNewsDataArticles } from "./client";
import { buildNewsDataQuery } from "./queries";
import { normalizeNewsDataArticle } from "./normalize";

/**
 * Reads the key at call time (not module load) so tests can freely set/unset
 * `process.env.NEWSDATA_API_KEY` without needing to reset module state.
 * Never read `NEXT_PUBLIC_NEWSDATA_API_KEY` — this key must stay server-only.
 */
function getApiKey(): string | undefined {
  const key = process.env.NEWSDATA_API_KEY?.trim();
  return key ? key : undefined;
}

async function fetchForSport(
  apiKey: string,
  sport: Sport,
  limit: number,
): Promise<{ candidates: NewsCandidate[]; error?: string }> {
  const query = buildNewsDataQuery(sport);
  if (!query) return { candidates: [] };

  try {
    const rawArticles = await fetchNewsDataArticles({ apiKey, query, limit });
    const candidates = rawArticles
      .map((raw) => normalizeNewsDataArticle(raw, sport))
      .filter((candidate): candidate is NewsCandidate => candidate !== null);
    return { candidates };
  } catch (error) {
    return { candidates: [], error: describeFetchError(error) };
  }
}

export const newsDataProvider: CandidateProvider = {
  id: "newsdata",
  displayName: "NewsData.io",
  requiresApiKey: true,
  expectedFreshness: "delayed-12h",

  async fetchCandidates({ sport, limit }: FetchCandidatesOptions): Promise<CandidateProviderResult> {
    const startedAt = Date.now();
    const apiKey = getApiKey();

    if (!apiKey) {
      return {
        providerId: "newsdata",
        candidates: [],
        status: "unavailable",
        message: "missing NEWSDATA_API_KEY — set it in .env.local to enable this provider",
        durationMs: Date.now() - startedAt,
      };
    }

    const sports = sport === "all" ? QUERYABLE_SPORTS : [sport];
    const candidates: NewsCandidate[] = [];
    const profileErrors: string[] = [];

    for (const currentSport of sports) {
      const result = await fetchForSport(apiKey, currentSport, limit);
      candidates.push(...result.candidates);
      if (result.error) {
        profileErrors.push(`${currentSport}: ${result.error}`);
      }
    }

    const durationMs = Date.now() - startedAt;

    if (profileErrors.length > 0 && candidates.length === 0) {
      return {
        providerId: "newsdata",
        candidates: [],
        status: "error",
        message: profileErrors.join("; "),
        durationMs,
      };
    }

    return {
      providerId: "newsdata",
      candidates,
      status: "ok",
      message: profileErrors.length > 0 ? `partial failures: ${profileErrors.join("; ")}` : undefined,
      durationMs,
    };
  },
};
