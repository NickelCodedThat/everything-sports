import { fixtureStories } from "@/data/stories";
import type { Sport } from "@/types/sport";
import { buildCandidate } from "../../normalization/build-candidate";
import type { NewsCandidate } from "../../candidates/types";
import type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "../types";

/**
 * Offline, no-network candidate provider for CLI development and demos —
 * runs the existing fixture stories through the same
 * normalize/fingerprint/classify pipeline as the real providers, so the
 * pipeline itself can be exercised and inspected without hitting GDELT or
 * NewsData. Not a real discovery source and intentionally excluded from
 * `--provider=all` and the policy registry's approved-provider list.
 */
export const localCandidateProvider: CandidateProvider = {
  id: "local",
  displayName: "Local Fixtures (offline)",
  requiresApiKey: false,
  expectedFreshness: "unknown",

  async fetchCandidates({ sport, limit }: FetchCandidatesOptions): Promise<CandidateProviderResult> {
    const startedAt = Date.now();

    // Only "aggregated" fixtures have a genuinely external sourceUrl — an
    // "original" story's sourceUrl is intentionally our own canonical route
    // (see src/lib/routes.ts), which wouldn't make sense to simulate as a
    // newly "discovered" external candidate.
    const matching = fixtureStories.filter(
      (story) => story.originality === "aggregated" && (sport === "all" || story.sport === sport),
    );

    const candidates = matching
      .map((story) =>
        buildCandidate({
          provider: "local",
          providerItemId: story.id,
          headline: story.headline,
          sourceUrl: story.sourceUrl,
          publisherName: story.source.name,
          publishedAt: story.publishedAt,
          queryProfileSport: story.sport as Sport,
        }),
      )
      .filter((candidate): candidate is NewsCandidate => candidate !== null)
      .slice(0, limit);

    return {
      providerId: "local",
      candidates,
      status: "ok",
      durationMs: Date.now() - startedAt,
    };
  },
};
