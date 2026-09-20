import { NEWSY_EVENT_TYPES, SECTION, STRONG_NEWS_EVENT_TYPES } from "./config";
import type { DeskId, SectionEligibility, Urgency } from "./types";
import type { EventType } from "../clustering/config";

/** Native desk for a sport. Existing homepage desks — not redesigned. */
export function deskForSport(sport: string): DeskId {
  switch (sport) {
    case "basketball": return "run";
    case "football": return "huddle";
    case "baseball": return "diamond";
    case "boxing":
    case "mma": return "fight-desk";
    case "soccer": return "world-game";
    default: return "across-the-board";
  }
}

export const DESK_IDS: DeskId[] = ["run", "huddle", "diamond", "fight-desk", "world-game", "across-the-board"];
export const ALL_SECTION_IDS = ["lead", "wire", "now", ...DESK_IDS] as const;

export interface SectionInput {
  eligibility: "eligible" | "review" | "ineligible";
  hasPublishableHeadline: boolean;
  confidence: "high" | "medium" | "low";
  eventType: EventType | null;
  eventImportance: number;
  urgency: Urgency;
  domains: number;
  sourcesLastHour: number;
  latestAgeHours: number;
  stakes: boolean;
  allLowQuality: boolean;
  /** Any headline carries rumor / speculation / preview / betting language. */
  speculative: boolean;
}

/**
 * Which cross-sport placements an item qualifies for. Deterministic and explained:
 *
 *   LEAD  eligible (never `review`), publishable headline, HIGH confidence, newest ≤ 12h,
 *         not a preview, not all low-quality, and real support: ≥ 3 independent sources, or
 *         ≥ 2 with a high-importance event type (≥ 40). A routine game result additionally
 *         needs stakes language in its headlines or ≥ 12 sources. Nothing here mentions a sport:
 *         a massive NFL/MLB/fight/global story leads on its merits; basketball wins only ties.
 *   WIRE  fresh (≤ 6h), ≥ 2 sources, not a preview, not speculative, and moving: developing /
 *         breaking-candidate, or fast-moving (≥ 4 sources, ≥ 2 first reporting in the last hour)
 *         AND either a news-type event or high-stakes language. A routine game recap being
 *         re-syndicated is not wire news.
 *   NOW / DESK  eligible or review, publishable, not a preview, and SUBSTANTIVE: ≥ 2 independent
 *         publishers, or a strong news-type event (trade, signing, injury, coaching, discipline,
 *         retirement, death, record) that is not speculation.
 *         Now also needs newest ≤ 12h. Quiet is fine: no filler.
 */
export function assessSections(input: SectionInput): SectionEligibility {
  const notes: string[] = [];
  const usable = input.eligibility !== "ineligible" && input.hasPublishableHeadline;
  const preview = input.eventType === "preview";

  let lead = usable && input.eligibility === "eligible";
  if (usable && input.eligibility === "review") notes.push("lead: needs editor review first");
  if (lead && input.confidence !== "high") { lead = false; notes.push("lead: cluster confidence not high"); }
  if (lead && input.latestAgeHours > SECTION.lead.maxAgeHours) { lead = false; notes.push(`lead: newest report ${input.latestAgeHours.toFixed(1)}h old (max ${SECTION.lead.maxAgeHours}h)`); }
  if (lead && preview) { lead = false; notes.push("lead: previews cannot lead"); }
  if (lead && input.allLowQuality) { lead = false; notes.push("lead: low-quality sources"); }
  if (lead) {
    const supported = input.domains >= SECTION.lead.minSources || (input.domains >= SECTION.lead.minSourcesWithImportance && input.eventImportance >= SECTION.lead.importanceThreshold);
    if (!supported) { lead = false; notes.push(`lead: only ${input.domains} independent source${input.domains === 1 ? "" : "s"} for a ${input.eventType ?? "unclear"} event`); }
  }
  if (lead && input.eventType === "game-result" && !input.stakes && input.domains < SECTION.lead.gameResultMinSources) {
    lead = false;
    notes.push(`lead: routine game result (${input.domains} sources, no stakes language)`);
  }

  const newsy = input.eventType !== null && NEWSY_EVENT_TYPES.has(input.eventType);
  let wire = usable && !preview && !input.speculative && input.domains >= SECTION.wire.minSources && input.latestAgeHours <= SECTION.wire.maxAgeHours;
  if (wire) {
    const fast = input.domains >= SECTION.wire.velocitySources && input.sourcesLastHour >= SECTION.wire.velocityLastHour && (newsy || input.stakes);
    if (input.urgency === "normal" && !fast) { wire = false; notes.push("wire: not developing, and not fast-moving news or a high-stakes result"); }
  } else if (usable && !preview) notes.push(input.speculative ? "wire: speculative language" : "wire: too few sources or too old");
  if (usable && preview) notes.push("wire: previews are not wire news");

  const strongNews = input.eventType !== null && STRONG_NEWS_EVENT_TYPES.has(input.eventType);
  const substantive = input.domains >= SECTION.substantiveMinSources || (strongNews && !input.speculative);
  if (usable && !substantive) notes.push(`placement: single source with no news-type event${input.speculative ? " (speculative language)" : ""} — not enough substance for a desk or Now`);
  const desk = usable && !preview && substantive;
  const now = desk && input.latestAgeHours <= SECTION.now.maxAgeHours;
  return { lead, wire, now, desk, notes };
}
