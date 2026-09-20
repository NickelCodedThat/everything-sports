import type { Story } from "@/types/story";
import type { EditorialStatus, Urgency } from "./types";
import type { EligibilityReason } from "./types";

/**
 * MAPPING LAYER: editorial item → future public Story. Deliberately NOT a `Story`: the Phase 1
 * `Story` requires fields (`deck`, `byline`, `image`, a `NewsSource` credibility tier, a slug…)
 * that warehouse metadata cannot honestly supply, and this layer must never fabricate them.
 * A `StoryPreview` carries exactly what we truly have; `STORY_FIELD_MAP` documents the rest.
 */
export interface SupportingSource {
  publisher: string;
  domain: string;
  url: string;
  publishedAt: Date | null;
  /** The publisher's own headline for that report — metadata only. Null for provider prose (never displayable). */
  headline: string | null;
  isRepresentative: boolean;
  quality: "known" | "unknown" | "low-quality";
}

export interface StoryPreview {
  editorialItemId: string;
  clusterId: string;
  /** Verbatim publisher headline of the representative — never rewritten. */
  headline: string;
  status: EditorialStatus;
  /** True only for `approved` items: ready for FUTURE publication. Nothing here is public. */
  readyForPublication: boolean;
  attribution: { publisher: string; domain: string; url: string } | null;
  sourcesReporting: number;
  supportingSources: SupportingSource[];
  sport: string;
  league: string | null;
  eventType: string | null;
  /** Maps to Story.urgency. `breaking-candidate` deliberately maps to `developing`; only an editor may later say `breaking`. */
  storyUrgency: Extract<Story["urgency"], "developing" | "none">;
  breakingCandidate: boolean;
  publishedAt: Date | null;
  updatedAt: Date | null;
  /** Fields deliberately absent. Not empty strings, not placeholders: absent. */
  missing: readonly ("deck" | "byline" | "image" | "articleBody" | "slug" | "credibilityTier")[];
  imageStatus: "missing";
  eligibility: { state: string; reasons: EligibilityReason[] };
}

export interface MappableItem {
  id: string;
  clusterId: string;
  headline: string | null;
  status: EditorialStatus;
  sport: string;
  league: string | null;
  eventType: string | null;
  urgency: Urgency;
  sourceCount: number;
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
  eligibility: string;
  eligibilityReasons: EligibilityReason[];
}

/**
 * Returns null when the item is not publication-safe (no publisher headline, or ineligible):
 * there is then nothing that may legitimately become a Story.
 */
export function toStoryPreview(item: MappableItem, sources: SupportingSource[]): StoryPreview | null {
  if (!item.headline?.trim() || item.eligibility === "ineligible" || item.status === "held" || item.status === "rejected") return null;
  const representative = sources.find((s) => s.isRepresentative) ?? null;
  return {
    editorialItemId: item.id,
    clusterId: item.clusterId,
    headline: item.headline,
    status: item.status,
    readyForPublication: item.status === "approved",
    attribution: representative ? { publisher: representative.publisher, domain: representative.domain, url: representative.url } : null,
    sourcesReporting: item.sourceCount,
    supportingSources: sources,
    sport: item.sport,
    league: item.league,
    eventType: item.eventType,
    storyUrgency: item.urgency === "normal" ? "none" : "developing",
    breakingCandidate: item.urgency === "breaking-candidate",
    publishedAt: item.firstPublishedAt,
    updatedAt: item.lastPublishedAt,
    missing: ["deck", "byline", "image", "articleBody", "slug", "credibilityTier"],
    imageStatus: "missing",
    eligibility: { state: item.eligibility, reasons: item.eligibilityReasons },
  };
}

/** Order the source panel: representative first, then known quality, earliest report, then domain. */
export function orderSupportingSources(sources: SupportingSource[]): SupportingSource[] {
  const rank = { known: 0, unknown: 1, "low-quality": 2 } as const;
  return [...sources].sort(
    (a, b) =>
      Number(b.isRepresentative) - Number(a.isRepresentative) ||
      rank[a.quality] - rank[b.quality] ||
      (a.publishedAt?.getTime() ?? Infinity) - (b.publishedAt?.getTime() ?? Infinity) ||
      a.domain.localeCompare(b.domain),
  );
}

/** Documentation as data: what each Phase 1 `Story` field maps to. Asserted by a unit test. */
export const STORY_FIELD_MAP = {
  id: "available: editorial item id (a real slug/route is a later phase)",
  slug: "unavailable: derive later from the editorial headline — not fabricated now",
  headline: "available: representative publisher headline, verbatim",
  deck: "UNAVAILABLE — must NOT be fabricated: original Everything Sports summary comes later",
  source: "partial: publisher name + domain; credibilityTier is NOT a warehouse concept and is not invented",
  sourceUrl: "available: representative candidate URL",
  byline: "UNAVAILABLE — must NOT be fabricated",
  publishedAt: "available: cluster first published time (GKG stamp granularity)",
  updatedAt: "available: cluster last published time",
  sport: "available",
  league: "partial: only when the warehouse recorded one",
  teams: "partial: canonical team keys only (no TeamRef ids yet)",
  people: "unavailable: no athlete database",
  topics: "unavailable",
  image: "UNAVAILABLE — provider image refs are diagnostic only; licensed photography is a later phase",
  originality: "always 'aggregated' — we did not report it",
  storyType: "unavailable until editorial formats exist",
  urgency: "partial: never 'breaking' automatically; breaking-candidate maps to 'developing'",
  status: "n/a: the editorial lifecycle (candidate/review/approved/held/rejected) is separate from published/updated/corrected",
  editorialPriority: "available: score, priority band and overrides live on the editorial item",
} as const;
