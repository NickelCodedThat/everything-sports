export type { NewsCandidate, NewsProviderId, ClassificationResult, CandidateImageRef } from "./candidates/types";
export { fingerprintCandidate, flagDuplicateFingerprints } from "./candidates/fingerprint";
export { normalizeUrl, extractDomain } from "./urls/normalize";
export { classifyCandidate } from "./classification/classify";
export { SPORT_QUERY_PROFILES, QUERYABLE_SPORTS, getQueryProfile } from "./queries/sport-profiles";
export { PROVIDER_POLICIES, getProviderPolicy, listApprovedProviderIds } from "./policy/registry";
export type { ProviderPolicy, PolicyStatus, Freshness } from "./policy/types";
export {
  ALL_CANDIDATE_PROVIDERS,
  APPROVED_CANDIDATE_PROVIDERS,
  getCandidateProviderById,
  gdeltProvider,
  gdeltGkgProvider,
  newsDataProvider,
  wikipediaEventsProvider,
  localCandidateProvider,
} from "./providers";
export type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "./providers/types";
export { fetchNewsCandidates } from "./newsroom";
export type { FetchNewsCandidatesParams, FetchNewsCandidatesResult, NewsroomSummary } from "./newsroom";
