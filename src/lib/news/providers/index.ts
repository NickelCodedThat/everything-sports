import { gdeltProvider } from "./gdelt/provider";
import { gdeltGkgProvider } from "./gdelt-gkg/provider";
import { newsDataProvider } from "./newsdata/provider";
import { wikipediaEventsProvider } from "./wikipedia-events/provider";
import { localCandidateProvider } from "./local/provider";
import type { CandidateProvider } from "./types";

export type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions } from "./types";
export { gdeltProvider } from "./gdelt/provider";
export { gdeltGkgProvider } from "./gdelt-gkg/provider";
export { newsDataProvider } from "./newsdata/provider";
export { wikipediaEventsProvider } from "./wikipedia-events/provider";
export { localCandidateProvider } from "./local/provider";

/** Real, policy-approved discovery providers — what `--provider=all` runs. `local` is deliberately excluded (see its own doc comment). */
export const APPROVED_CANDIDATE_PROVIDERS: CandidateProvider[] = [
  gdeltProvider,
  gdeltGkgProvider,
  newsDataProvider,
  wikipediaEventsProvider,
];

/** Every provider the newsroom knows how to invoke, approved ones plus the offline local fixture provider. */
export const ALL_CANDIDATE_PROVIDERS: CandidateProvider[] = [
  gdeltProvider,
  gdeltGkgProvider,
  newsDataProvider,
  wikipediaEventsProvider,
  localCandidateProvider,
];

export function getCandidateProviderById(id: string): CandidateProvider | undefined {
  return ALL_CANDIDATE_PROVIDERS.find((provider) => provider.id === id);
}
