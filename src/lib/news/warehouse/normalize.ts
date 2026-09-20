import type { NewsCandidate } from "../candidates/types";
import type { RejectedCandidate } from "../filters/intake";
import { normalizeUrl } from "../urls/normalize";
import { getProviderPolicy } from "../policy/registry";
import type { CandidatePayload, RejectionPayload } from "./types";

const ZERO_WIDTH = /[​-‍⁠﻿]/g;

/**
 * Conservative headline key for exact-duplicate detection. Only lossless-ish
 * cosmetic differences are erased: Unicode compatibility form, case, smart
 * quotes/dashes/ellipsis, zero-width characters and whitespace runs. No word
 * is ever removed and nothing fuzzy happens — "Cubs top Reds" and "Cubs beat
 * Reds" stay different.
 */
export function normalizeHeadline(headline: string): string {
  return headline
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 'discovery-text' when the provider's own policy forbids displaying its
 * headline text (Wikipedia Current Events sentences are CC BY-SA prose, not a
 * publisher title). Unknown providers default to the restrictive value.
 */
export function headlineKindFor(providerId: string): CandidatePayload["headline_kind"] {
  return getProviderPolicy(providerId)?.headlineDisplayAllowed ? "publisher-title" : "discovery-text";
}

/** Database uniqueness is on the normalized URL, so it is recomputed here rather than trusted from the caller. */
export function normalizedUrlKey(sourceUrl: string): string {
  return normalizeUrl(sourceUrl)?.href ?? sourceUrl.trim();
}

export function toCandidatePayload(candidate: NewsCandidate): CandidatePayload {
  return {
    provider_item_id: candidate.providerItemId ?? null,
    headline: candidate.headline,
    normalized_headline: normalizeHeadline(candidate.headline),
    headline_kind: headlineKindFor(candidate.provider),
    source_url: candidate.sourceUrl,
    normalized_source_url: normalizedUrlKey(candidate.sourceUrl),
    fingerprint: candidate.fingerprint,
    publisher_domain: candidate.publisherDomain.toLowerCase(),
    publisher_name: candidate.publisherName ?? null,
    source_quality: candidate.sourceQuality,
    published_at: candidate.publishedAt ?? null,
    discovered_at: candidate.discoveredAt,
    sport: candidate.classification.sport,
    league: candidate.possibleLeague ?? null,
    classification_confidence: candidate.classification.confidence,
    classification_signals: candidate.classification.signals,
    provider_categories: candidate.providerCategories ?? null,
    query_profile: candidate.queryProfile ?? null,
    language: candidate.language ?? null,
    remote_image_ref: candidate.imageRef?.url ?? null,
  };
}

/** Headline + link metadata only: enough to debug intake quality, nothing more. */
export function toRejectionPayload({ candidate, reasons }: RejectedCandidate): RejectionPayload {
  return {
    fingerprint: candidate.fingerprint,
    headline: candidate.headline,
    source_url: candidate.sourceUrl,
    publisher_domain: candidate.publisherDomain.toLowerCase(),
    publisher_name: candidate.publisherName ?? null,
    source_quality: candidate.sourceQuality,
    sport: candidate.classification.sport,
    reasons,
  };
}
