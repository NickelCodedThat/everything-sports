import type { Sport } from "@/types/sport";

/** Identifiers for candidate-discovery providers wired into the newsroom (not the same as content-attribution `NewsSource`). */
export type NewsProviderId = "gdelt" | "newsdata" | "local";

export type ClassificationConfidence = "high" | "medium" | "low" | "none";

/** Why a candidate was classified the way it was — kept inspectable, never an opaque score. */
export interface ClassificationResult {
  sport: Sport | "unknown";
  confidence: ClassificationConfidence;
  signals: string[];
}

/** Diagnostic-only pointer to a provider-supplied image. Never rendered, downloaded, or committed — see docs/NEWS-SOURCE-STRATEGY.md. */
export interface CandidateImageRef {
  url: string;
  note?: string;
}

/**
 * Something the newsroom discovered that may eventually become an Everything
 * Sports Story. This is intentionally a thin, provider-neutral record — no
 * article bodies, no large raw payloads. A NewsCandidate is not a Story: it
 * still has to be normalized, classified, deduplicated, clustered, ranked,
 * and editorially processed before it could ever reach the homepage. See
 * docs/NEWS-SOURCE-STRATEGY.md.
 */
export interface NewsCandidate {
  /** Stable id for this candidate within a batch — currently equal to `fingerprint`. */
  id: string;
  /** Deterministic fingerprint for duplicate detection, see urls/fingerprint.ts. */
  fingerprint: string;

  provider: NewsProviderId;
  /** The provider's own item/article id, when it exposes one, for debugging only. */
  providerItemId?: string;

  headline: string;

  publisherName?: string;
  publisherDomain: string;

  /** Normalized original article URL — the source publication, never the provider itself. */
  sourceUrl: string;

  /** ISO 8601. Best-available published time; providers vary in precision/availability. */
  publishedAt?: string;
  /** ISO 8601. When *our* system fetched this candidate. */
  discoveredAt: string;

  language?: string;

  possibleSport?: Sport;
  possibleLeague?: string;

  /** Raw category/theme tags as the provider labeled them, kept for debugging classification. */
  providerCategories?: string[];

  /** Only populated when the provider's policy record permits snippet storage/display. */
  snippet?: string;

  /** Diagnostics only — see CandidateImageRef. Never used for public rendering. */
  imageRef?: CandidateImageRef;

  /** The query profile id that discovered this candidate, e.g. "basketball". */
  queryProfile: string;

  classification: ClassificationResult;

  /** Set by the aggregator when another candidate in the same batch has the same fingerprint. */
  isDuplicateUrl?: boolean;
}
