import type { NewsSource } from "@/types/entities";

/**
 * Fixture news sources spanning the credibility tiers the ranking engine
 * weighs. Demo data only — see docs/BRAND-UI-BLUEPRINT.md's copyright rule:
 * we store metadata and attribution, never full third-party article bodies.
 */
export const SOURCES = {
  STAFF: {
    id: "es-staff",
    name: "Everything Sports Staff",
    homepageUrl: "/about/newsroom",
    credibilityTier: "staff",
  },
  WIRE: {
    id: "national-wire",
    name: "National Sports Wire",
    homepageUrl: "https://example.com/national-sports-wire",
    credibilityTier: "wire",
  },
  INSIDER_NETWORK: {
    id: "insider-network",
    name: "League Insider Network",
    homepageUrl: "https://example.com/league-insider-network",
    credibilityTier: "syndicated",
  },
  FAN_AGGREGATOR: {
    id: "fan-aggregator",
    name: "Fan Beat Aggregator",
    homepageUrl: "https://example.com/fan-beat",
    credibilityTier: "aggregated",
  },
} as const satisfies Record<string, NewsSource>;
