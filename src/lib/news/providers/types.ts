import type { Sport } from "@/types/sport";
import type { Freshness } from "../policy/types";
import type { NewsCandidate, NewsProviderId } from "../candidates/types";

export interface FetchCandidatesOptions {
  /** A single sport's query profile, or "all" to run every profile this provider supports. */
  sport: Sport | "all";
  /** Raw duration string, e.g. "3h", "24h" — each provider interprets it in its own API's terms. */
  window: string;
  /** Applied per query profile, not per overall batch. */
  limit: number;
}

export interface CandidateProviderResult {
  providerId: NewsProviderId;
  candidates: NewsCandidate[];
  status: "ok" | "unavailable" | "throttled" | "error";
  /** Human-readable context for "unavailable"/"error" (e.g. "missing NEWSDATA_API_KEY", "HTTP 429 … cooldown"), or partial-failure notes on "ok". */
  message?: string;
  durationMs: number;
}

/**
 * Optional capability for providers whose data arrives as immutable,
 * individually addressable units (e.g. GDELT GKG's 15-minute files). The
 * warehouse uses it to process each unit exactly once: it lists unit keys,
 * skips the ones already stored, and fetches only the rest.
 * Unit keys are `<providerId>:<stamp>` and are globally unique.
 */
export interface ProviderUnits {
  /** Unit keys covering the given window, oldest first. */
  list(options: Pick<FetchCandidatesOptions, "window">): Promise<string[]>;
  /** Normalized candidates for one unit, or null when the unit does not exist (yet). */
  fetch(unitKey: string): Promise<NewsCandidate[] | null>;
}

/**
 * Contract every candidate-discovery source must satisfy. This replaces the
 * Phase 1 `NewsProvider` (which produced finished `Story` objects directly —
 * skipping normalize/classify/dedupe/cluster/rank/editorial entirely, which
 * this newsroom pipeline no longer allows). Providers are NOT assumed to
 * have identical capabilities — `requiresApiKey` and `expectedFreshness` are
 * real, inspectable differences a caller (the aggregator, the CLI) should
 * account for, e.g. never letting a delayed provider outrank a fresher one
 * for the same event.
 */
export interface CandidateProvider {
  id: NewsProviderId;
  displayName: string;
  requiresApiKey: boolean;
  expectedFreshness: Freshness;
  fetchCandidates(options: FetchCandidatesOptions): Promise<CandidateProviderResult>;
  /** Present only on providers with immutable units — see ProviderUnits. */
  units?: ProviderUnits;
}
