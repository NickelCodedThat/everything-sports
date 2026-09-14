export type PolicyStatus = "approved" | "development-only" | "deferred" | "rejected";

export type Freshness = "realtime" | "near-realtime" | "delayed-12h" | "unknown";

/**
 * A machine-readable record of what our system is allowed to do with a given
 * provider. This is the single source of truth for provider rights — code
 * should consult it rather than assume. When uncertain, every field here
 * should default to the more restrictive value. See docs/NEWS-SOURCE-STRATEGY.md.
 */
export interface ProviderPolicy {
  providerId: string;
  displayName: string;
  status: PolicyStatus;

  commercialUse: boolean;
  attributionRequired: boolean;
  apiKeyRequired: boolean;
  freshness: Freshness;

  headlineDisplayAllowed: boolean;
  snippetDisplayAllowed: boolean;
  imageDisplayAllowed: boolean;
  persistentMetadataStorageAllowed: boolean;
  fullArticleStorageAllowed: boolean;

  advertisingRestrictions: string;
  notes: string;

  /** ISO date (YYYY-MM-DD) this policy record was last reviewed against the provider's actual terms. */
  policyReviewDate: string;
}
