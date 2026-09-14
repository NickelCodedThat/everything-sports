import { flagDuplicateFingerprints } from "./candidates/fingerprint";
import type { NewsCandidate } from "./candidates/types";
import type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "./providers/types";

export interface FetchNewsCandidatesParams {
  providers: CandidateProvider[];
  sport: FetchCandidatesOptions["sport"];
  window: string;
  limit: number;
}

export interface NewsroomSummary {
  totalCandidates: number;
  bySport: Record<string, number>;
  duplicates: number;
}

export interface FetchNewsCandidatesResult {
  candidates: NewsCandidate[];
  providerResults: CandidateProviderResult[];
  summary: NewsroomSummary;
}

/**
 * The Everything Sports newsroom's multi-provider aggregator. Queries every
 * given provider, preserving provider identity in the results and never
 * letting one provider's failure erase another's successful candidates —
 * each provider result is captured independently, with an outer try/catch
 * as a safety net beyond each provider's own internal error handling.
 */
export async function fetchNewsCandidates({
  providers,
  sport,
  window,
  limit,
}: FetchNewsCandidatesParams): Promise<FetchNewsCandidatesResult> {
  const providerResults = await Promise.all(
    providers.map(async (provider): Promise<CandidateProviderResult> => {
      try {
        return await provider.fetchCandidates({ sport, window, limit });
      } catch (error) {
        return {
          providerId: provider.id,
          candidates: [],
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
      }
    }),
  );

  const merged = providerResults.flatMap((result) => result.candidates);
  const candidates = flagDuplicateFingerprints(merged);

  const bySport: Record<string, number> = {};
  let duplicates = 0;
  for (const candidate of candidates) {
    const key = candidate.classification.sport;
    bySport[key] = (bySport[key] ?? 0) + 1;
    if (candidate.isDuplicateUrl) duplicates += 1;
  }

  return {
    candidates,
    providerResults,
    summary: {
      totalCandidates: candidates.length,
      bySport,
      duplicates,
    },
  };
}
