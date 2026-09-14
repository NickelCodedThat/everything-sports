import type { Sport } from "@/types/sport";
import { classifyCandidate } from "../classification/classify";
import { fingerprintCandidate } from "../candidates/fingerprint";
import { normalizeUrl } from "../urls/normalize";
import { getProviderPolicy } from "../policy/registry";
import type { CandidateImageRef, NewsCandidate, NewsProviderId } from "../candidates/types";

export interface RawCandidateInput {
  provider: NewsProviderId;
  providerItemId?: string;
  headline: string | undefined | null;
  sourceUrl: string | undefined | null;
  publisherName?: string;
  /** Used only when the URL itself doesn't yield a usable hostname. */
  publisherDomainHint?: string;
  publishedAt?: string;
  language?: string;
  providerCategories?: string[];
  snippet?: string;
  imageRef?: CandidateImageRef;
  queryProfileSport: Sport;
  possibleLeague?: string;
}

/**
 * Shared candidate construction for every provider's normalize step: URL
 * normalization, fingerprinting, policy-gated snippet/image handling, and
 * classification all happen here so providers can't each implement (and
 * drift on) these rules independently. Returns null for anything missing a
 * headline or a usable source URL/publisher domain — callers should skip
 * malformed provider rows rather than throw.
 */
export function buildCandidate(input: RawCandidateInput): NewsCandidate | null {
  const headline = input.headline?.trim();
  if (!headline) return null;

  const rawUrl = input.sourceUrl?.trim();
  if (!rawUrl) return null;

  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return null;

  const publisherDomain = normalized.hostname || input.publisherDomainHint;
  if (!publisherDomain) return null;

  const policy = getProviderPolicy(input.provider);
  const fingerprint = fingerprintCandidate(normalized.href);
  const discoveredAt = new Date().toISOString();

  const classification = classifyCandidate({
    headline,
    queryProfileSport: input.queryProfileSport,
    providerCategories: input.providerCategories,
  });

  const candidate: NewsCandidate = {
    id: fingerprint,
    fingerprint,
    provider: input.provider,
    providerItemId: input.providerItemId,
    headline,
    publisherName: input.publisherName,
    publisherDomain,
    sourceUrl: normalized.href,
    publishedAt: input.publishedAt,
    discoveredAt,
    language: input.language,
    possibleSport: classification.sport === "unknown" ? undefined : classification.sport,
    possibleLeague: input.possibleLeague,
    providerCategories: input.providerCategories,
    queryProfile: input.queryProfileSport,
    classification,
  };

  if (policy?.snippetDisplayAllowed && input.snippet) {
    candidate.snippet = input.snippet;
  }

  // Image references are diagnostic-only regardless of policy — see the
  // no-third-party-image rule in docs/NEWS-SOURCE-STRATEGY.md — but we still
  // gate on imageDisplayAllowed being explicitly false-safe (never render).
  if (input.imageRef) {
    candidate.imageRef = input.imageRef;
  }

  return candidate;
}
