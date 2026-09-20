import { flagDuplicateFingerprints } from "./candidates/fingerprint";
import type { NewsCandidate } from "./candidates/types";
import { applyIntakeFilter, type RejectedCandidate } from "./filters/intake";
import type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "./providers/types";

export interface FetchNewsCandidatesParams {
  providers: CandidateProvider[];
  sport: FetchCandidatesOptions["sport"];
  window: string;
  limit: number;
}

/** Operational state of one provider for this run — what the health report prints. */
export type ProviderHealthState = "ok" | "empty" | "unavailable" | "throttled" | "error";

export interface ProviderHealth {
  providerId: string;
  state: ProviderHealthState;
  /** Candidates the provider returned before intake filtering. */
  returned: number;
  /** Of those, how many passed intake filtering. */
  accepted: number;
  message?: string;
  durationMs: number;
}

export interface NewsroomSummary {
  /** Accepted candidates (after intake filtering). */
  totalCandidates: number;
  bySport: Record<string, number>;
  duplicates: number;
  rejected: number;
  rejectedByReason: Record<string, number>;
}

export interface FetchNewsCandidatesResult {
  /** Accepted candidates, duplicate-flagged. */
  candidates: NewsCandidate[];
  /** Candidates dropped by the intake filter, with the reasons — never silently discarded. */
  rejected: RejectedCandidate[];
  /** Raw per-provider results, before intake filtering. */
  providerResults: CandidateProviderResult[];
  health: ProviderHealth[];
  summary: NewsroomSummary;
}

function toHealth(result: CandidateProviderResult, accepted: number): ProviderHealth {
  let state: ProviderHealthState;
  if (result.status === "ok") state = result.candidates.length > 0 ? "ok" : "empty";
  else state = result.status;
  return {
    providerId: result.providerId,
    state,
    returned: result.candidates.length,
    accepted,
    message: result.message,
    durationMs: result.durationMs,
  };
}

/**
 * The Everything Sports newsroom's multi-provider aggregator. Queries every
 * given provider concurrently, preserving provider identity in the results and
 * never letting one provider's failure erase another's successful candidates —
 * each provider result is captured independently, with an outer try/catch
 * as a safety net beyond each provider's own internal error handling.
 * Merged candidates then pass the conservative intake filter and exact-URL
 * duplicate flagging.
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
  const { accepted, rejected } = applyIntakeFilter(merged);
  const candidates = flagDuplicateFingerprints(accepted);

  const bySport: Record<string, number> = {};
  let duplicates = 0;
  for (const candidate of candidates) {
    const key = candidate.classification.sport;
    bySport[key] = (bySport[key] ?? 0) + 1;
    if (candidate.isDuplicateUrl) duplicates += 1;
  }

  const rejectedByReason: Record<string, number> = {};
  for (const item of rejected) {
    for (const reason of item.reasons) rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + 1;
  }

  const acceptedByProvider = new Map<string, number>();
  for (const candidate of candidates) {
    acceptedByProvider.set(candidate.provider, (acceptedByProvider.get(candidate.provider) ?? 0) + 1);
  }

  return {
    candidates,
    rejected,
    providerResults,
    health: providerResults.map((result) => toHealth(result, acceptedByProvider.get(result.providerId) ?? 0)),
    summary: {
      totalCandidates: candidates.length,
      bySport,
      duplicates,
      rejected: rejected.length,
      rejectedByReason,
    },
  };
}
