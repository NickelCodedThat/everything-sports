import type { Sport } from "@/types/sport";
import { QUERYABLE_SPORTS } from "../../queries/sport-profiles";
import { ProviderRateLimitedError, describeFetchError } from "../../errors";
import type { NewsCandidate } from "../../candidates/types";
import type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "../types";
import { fetchGdeltArticles } from "./client";
import { buildGdeltQuery } from "./queries";
import { normalizeGdeltArticle } from "./normalize";

/** GDELT documents a hard limit of one request per 5 seconds per client and returns 429 otherwise. */
const GDELT_MIN_REQUEST_INTERVAL_MS = 5_100;

/**
 * After GDELT throttles us, stay off it for a while instead of retrying into
 * the same 429. Live validation on 2026-09-20 showed the throttle can persist
 * across many minutes for a given IP, so hammering it only prolongs the block.
 */
const GDELT_MIN_COOLDOWN_MS = 60_000;
let cooldownUntil = 0;

/** Test hook: clears the module-level cooldown. */
export function resetGdeltCooldown(): void {
  cooldownUntil = 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchForSport(
  sport: Sport,
  window: string,
  limit: number,
): Promise<{ candidates: NewsCandidate[]; error?: string; throttled?: boolean }> {
  const query = buildGdeltQuery(sport);
  if (!query) return { candidates: [] };

  try {
    const rawArticles = await fetchGdeltArticles({ query, window, limit });
    const candidates = rawArticles
      .map((raw) => normalizeGdeltArticle(raw, sport))
      .filter((candidate): candidate is NewsCandidate => candidate !== null);
    return { candidates };
  } catch (error) {
    if (error instanceof ProviderRateLimitedError) {
      cooldownUntil = Date.now() + Math.max(error.retryAfterMs ?? 0, GDELT_MIN_COOLDOWN_MS);
      return { candidates: [], error: error.message, throttled: true };
    }
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

    if (Date.now() < cooldownUntil) {
      const seconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return {
        providerId: "gdelt",
        candidates: [],
        status: "throttled",
        message: `GDELT cooldown active after a 429 — not requesting for another ${seconds}s`,
        durationMs: Date.now() - startedAt,
      };
    }

    const candidates: NewsCandidate[] = [];
    const profileErrors: string[] = [];
    let throttled = false;

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
      if (result.throttled) {
        // A 429 applies to the whole client, not one query — stop spending requests on the remaining profiles.
        throttled = true;
        const skipped = sports.slice(index + 1);
        if (skipped.length > 0) profileErrors.push(`skipped after 429: ${skipped.join(", ")}`);
        break;
      }
    }

    const durationMs = Date.now() - startedAt;

    if (throttled && candidates.length === 0) {
      return {
        providerId: "gdelt",
        candidates: [],
        status: "throttled",
        message: profileErrors.join("; "),
        durationMs,
      };
    }

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
