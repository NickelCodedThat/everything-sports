import type { ProviderPolicy } from "./types";

const REVIEW_DATE = "2026-09-14";

/**
 * Provider policy registry. This is a product/legal decision record, not a
 * technical convenience — do not change a status or an allowance flag here
 * without an actual terms review. Providers marked anything other than
 * "approved" MUST NOT be wired into an active CandidateProvider.
 */
export const PROVIDER_POLICIES: Record<string, ProviderPolicy> = {
  gdelt: {
    providerId: "gdelt",
    displayName: "GDELT DOC 2.0",
    status: "approved",
    commercialUse: true,
    attributionRequired: true,
    apiKeyRequired: false,
    freshness: "near-realtime",
    headlineDisplayAllowed: true,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: true,
    fullArticleStorageAllowed: false,
    advertisingRestrictions:
      "None specifically identified, but GDELT is a discovery/index layer, not the publisher — " +
      "advertising and monetization decisions must be evaluated against the underlying publisher's " +
      "terms, not GDELT's.",
    notes:
      "GDELT discovers an article; it is never the publisher. Never attribute GDELT as the source " +
      "of a story — attribute the actual publisher domain, and credit GDELT only as the discovery " +
      "mechanism where attribution is shown. Store minimal metadata only; do not store article " +
      "bodies or GDELT's full raw response.",
    policyReviewDate: REVIEW_DATE,
  },

  newsdata: {
    providerId: "newsdata",
    displayName: "NewsData.io",
    status: "approved",
    commercialUse: true,
    attributionRequired: true,
    apiKeyRequired: true,
    freshness: "delayed-12h",
    headlineDisplayAllowed: true,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: true,
    fullArticleStorageAllowed: false,
    advertisingRestrictions:
      "Not fully characterized yet — treat as restricted until a dedicated commercial-terms review " +
      "is completed for our specific free-tier plan.",
    notes:
      "Free tier is approved for commercial use under currently reviewed terms, but free-tier " +
      "stories are delayed roughly 12 hours. A NewsData candidate must never outrank a genuinely " +
      "fresher GDELT-discovered candidate for the same event solely because its payload is richer. " +
      "Requires NEWSDATA_API_KEY (server-only, never NEXT_PUBLIC_*). The provider must degrade to " +
      "an 'unavailable' result, not a crash, when no key is configured.",
    policyReviewDate: REVIEW_DATE,
  },

  gnews: {
    providerId: "gnews",
    displayName: "GNews (free tier)",
    status: "rejected",
    commercialUse: false,
    attributionRequired: true,
    apiKeyRequired: true,
    freshness: "unknown",
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: false,
    fullArticleStorageAllowed: false,
    advertisingRestrictions: "Not evaluated — provider is not integrated.",
    notes:
      "Free tier is development/non-commercial in intent and unsuitable for a production free-first " +
      "product. Policy record kept for future reference only; not wired into any CandidateProvider.",
    policyReviewDate: REVIEW_DATE,
  },

  newsapi: {
    providerId: "newsapi",
    displayName: "NewsAPI.org (free tier)",
    status: "rejected",
    commercialUse: false,
    attributionRequired: true,
    apiKeyRequired: true,
    freshness: "unknown",
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: false,
    fullArticleStorageAllowed: false,
    advertisingRestrictions: "Not evaluated — provider is not integrated.",
    notes:
      "Free tier is explicitly a development/testing tier and disallows production use. Policy " +
      "record kept for future reference only; not wired into any CandidateProvider.",
    policyReviewDate: REVIEW_DATE,
  },

  currents: {
    providerId: "currents",
    displayName: "Currents API",
    status: "deferred",
    commercialUse: false,
    attributionRequired: true,
    apiKeyRequired: true,
    freshness: "unknown",
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: false,
    fullArticleStorageAllowed: false,
    advertisingRestrictions: "Not evaluated — provider is not integrated.",
    notes:
      "Current terms appear to conflict with parts of our planned long-term permanent warehouse/" +
      "derivative-works workflow. Deferred pending a further rights review, not rejected outright — " +
      "revisit before activating. Not wired into any CandidateProvider.",
    policyReviewDate: REVIEW_DATE,
  },

  "espn-rss": {
    providerId: "espn-rss",
    displayName: "ESPN RSS",
    status: "rejected",
    commercialUse: false,
    attributionRequired: true,
    apiKeyRequired: false,
    freshness: "unknown",
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: false,
    fullArticleStorageAllowed: false,
    advertisingRestrictions:
      "ESPN's feed terms restrict display, modification, and advertising use around the content.",
    notes:
      "Display/modification/advertising restrictions make this unsuitable as a foundational " +
      "monetizable feed for a free-first product. Policy record kept for future reference only; " +
      "not wired into any CandidateProvider.",
    policyReviewDate: REVIEW_DATE,
  },
};

export function getProviderPolicy(providerId: string): ProviderPolicy | undefined {
  return PROVIDER_POLICIES[providerId];
}

/** Providers whose policy status permits active integration. Anything else must stay a record-only policy entry. */
export function listApprovedProviderIds(): string[] {
  return Object.values(PROVIDER_POLICIES)
    .filter((policy) => policy.status === "approved")
    .map((policy) => policy.providerId);
}
