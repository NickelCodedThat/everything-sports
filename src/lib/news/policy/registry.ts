import type { ProviderPolicy } from "./types";

const REVIEW_DATE = "2026-09-14";
/** Review date for providers evaluated during the 2026-09-20 live-validation pass. */
const LIVE_VALIDATION_REVIEW_DATE = "2026-09-20";

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

  "gdelt-gkg": {
    providerId: "gdelt-gkg",
    displayName: "GDELT GKG 15-minute files",
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
      "None from GDELT (\"unlimited and unrestricted use for any academic, commercial, or governmental use\"), " +
      "but GDELT is a discovery index — advertising/monetization around a story is governed by the underlying " +
      "publisher's terms, not GDELT's.",
    notes:
      "Same GDELT Project dataset and terms as the DOC 2.0 API (gdeltproject.org/about.html, reviewed " +
      "2026-09-20): commercial use permitted, citation to the GDELT Project with a link required on any use or " +
      "redistribution. Reads the plain-file 15-minute GKG downloads (data.gdeltproject.org/gdeltv2), which are " +
      "a separate, unmetered path from the DOC API that returns 429. Uses only URL, domain, timestamp and the " +
      "page <title>; never fetches article bodies. Page titles are the site's HTML <title> and may carry a " +
      "publisher-name suffix (stripped). The feed is the global firehose, so sport filtering happens locally.",
    policyReviewDate: LIVE_VALIDATION_REVIEW_DATE,
  },

  "wikipedia-events": {
    providerId: "wikipedia-events",
    displayName: "Wikipedia Current Events (Sports)",
    status: "approved",
    commercialUse: true,
    attributionRequired: true,
    apiKeyRequired: false,
    freshness: "daily-curated",
    // Restrictive on purpose: the bullet text is Wikipedia contributors' prose under CC BY-SA 4.0.
    // We use it only as internal discovery text; the public headline must come from the publisher.
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: true,
    fullArticleStorageAllowed: false,
    advertisingRestrictions:
      "None on the API itself (Wikimedia Terms of Use allow commercial reuse under CC BY-SA 4.0). " +
      "The cited publisher articles keep their own terms — advertising/monetization around a story is " +
      "governed by that publisher, not by Wikipedia.",
    notes:
      "Discovery/link layer only. Text is CC BY-SA 4.0: reusing or displaying it requires attribution " +
      "(link to the page history) and share-alike for adaptations, so the bullet text is kept as internal " +
      "diagnostic text and never displayed. What we keep from an item is the cited publisher's URL, the " +
      "publisher name, the day, and the sport signals. Wikimedia API etiquette is mandatory: a descriptive " +
      "User-Agent with contact info and sequential (not parallel) requests, which the provider follows. " +
      "Timestamps have UTC-day precision only. Volume is low (roughly 1–8 sports items/day, editor-curated " +
      "to notable events) — this is a reliability floor and cross-check, not a firehose. " +
      "Source: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use and " +
      "https://www.mediawiki.org/wiki/API:Etiquette (reviewed 2026-09-20).",
    policyReviewDate: LIVE_VALIDATION_REVIEW_DATE,
  },

  wikinews: {
    providerId: "wikinews",
    displayName: "Wikinews (Sports category)",
    status: "deferred",
    commercialUse: true,
    attributionRequired: true,
    apiKeyRequired: false,
    freshness: "unknown",
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: false,
    fullArticleStorageAllowed: false,
    advertisingRestrictions: "Not evaluated — provider is not integrated.",
    notes:
      "License is fine (CC BY 4.0 after 2024-12-16, CC BY 2.5 before) but live check on 2026-09-20 found " +
      "sports posts weeks apart, mostly amateur/soccer, and Wikinews articles are themselves the content " +
      "rather than links to publishers. Deferred as not useful, not as a rights problem. Not wired into any CandidateProvider.",
    policyReviewDate: LIVE_VALIDATION_REVIEW_DATE,
  },

  "google-news-rss": {
    providerId: "google-news-rss",
    displayName: "Google News RSS search",
    status: "rejected",
    commercialUse: false,
    attributionRequired: true,
    apiKeyRequired: false,
    freshness: "near-realtime",
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: false,
    fullArticleStorageAllowed: false,
    advertisingRestrictions: "Not evaluated — provider is not integrated.",
    notes:
      "Unofficial, undocumented feed with no published grant for commercial aggregation or storage; links " +
      "are Google redirect wrappers. Ambiguous terms default restrictive. It was fetched a handful of times " +
      "on 2026-09-20 purely as an internal engineering sample to tune classification/filtering — nothing was " +
      "stored in the repo, and it is not a candidate source. Not wired into any CandidateProvider.",
    policyReviewDate: LIVE_VALIDATION_REVIEW_DATE,
  },

  "bing-news-rss": {
    providerId: "bing-news-rss",
    displayName: "Bing News RSS search",
    status: "rejected",
    commercialUse: false,
    attributionRequired: true,
    apiKeyRequired: false,
    freshness: "near-realtime",
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: false,
    fullArticleStorageAllowed: false,
    advertisingRestrictions: "Not evaluated — provider is not integrated.",
    notes:
      "Unofficial feed endpoint; Microsoft's supported route is the paid/metered Bing Search API. No grant " +
      "for commercial aggregation. Ambiguous terms default restrictive. Not wired into any CandidateProvider.",
    policyReviewDate: LIVE_VALIDATION_REVIEW_DATE,
  },

  "publisher-rss": {
    providerId: "publisher-rss",
    displayName: "Publisher / team sports RSS (Fox Sports, CNN, team sites, CBS Sports)",
    status: "rejected",
    commercialUse: false,
    attributionRequired: true,
    apiKeyRequired: false,
    freshness: "near-realtime",
    headlineDisplayAllowed: false,
    snippetDisplayAllowed: false,
    imageDisplayAllowed: false,
    persistentMetadataStorageAllowed: false,
    fullArticleStorageAllowed: false,
    advertisingRestrictions:
      "Fox Sports and NFL team feeds are 'free of charge for use by individuals and non-profit organizations " +
      "for non-commercial use'; CNN prohibits advertising placed with RSS content; ESPN prohibits advertising " +
      "(see espn-rss).",
    notes:
      "Reviewed 2026-09-20 from each publisher's own RSS terms page: Fox Sports (foxsports.com/rss-feeds), " +
      "Denver Broncos/NFL team sites (non-commercial + right to require cessation at any time), CNN. CBS Sports " +
      "(cbssports.com/xml/rss) publishes no RSS-specific commercial grant and defers to general Terms of Use " +
      "— ambiguous, so restrictive. Yahoo Sports' feed republishes third-party publishers' content under their own " +
      "terms. None permit an advertising-supported aggregator. Revisit per publisher only via a written syndication " +
      "agreement. Not wired into any CandidateProvider.",
    policyReviewDate: LIVE_VALIDATION_REVIEW_DATE,
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
