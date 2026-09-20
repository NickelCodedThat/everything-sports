import type { EventType, MatchConfidence } from "../clustering/config";
import { BREAKING_EVENT_TYPES, NEWSY_EVENT_TYPES, URGENCY } from "./config";
import type { Urgency } from "./types";

/**
 * Language that means "not confirmed news": rumors, speculation, hypotheticals, previews,
 * betting and fantasy. Any headline in the cluster carrying it caps urgency at normal — the
 * blueprint rule: no rumors labeled breaking.
 */
const RUMOR_OR_NOISE =
  /\brumou?rs?\b|\bspeculat\w*|\bcould\b|\blikely\b|\bmight\b|\bwould\b|\bpredict\w*|\bmock\b|\bodds\b|\bbet(?:s|ting)?\b|\bparlay\b|\bfantasy\b|\bprops?\b|\bpicks?\b|\bhow to watch\b|\bwhat to know\b|\bwish ?list\b|\bopinion\b|\btake\b|\bpower rankings?\b/i;

/** True when any headline carries rumor / speculation / preview / betting language. */
export function hasSpeculativeLanguage(headlines: string[]): boolean {
  return headlines.some((h) => RUMOR_OR_NOISE.test(h));
}

export interface UrgencyInput {
  eventType: EventType | null;
  latestAgeHours: number;
  domains: number;
  sourcesLastHour: number;
  confidence: MatchConfidence;
  headlines: string[];
}

export interface UrgencyResult {
  level: Urgency;
  reasons: string[];
}

/**
 * Internal urgency. "breaking-candidate" means an EDITOR should consider it breaking — nothing
 * here labels anything BREAKING publicly. Conservative by design because we never read article
 * bodies:
 *
 *   breaking-candidate  a real news event type (trade/signing/injury/coaching/discipline/
 *                       retirement/death — never results, previews or records),
 *                       HIGH cluster confidence, newest report ≤ 2h old, ≥ 2 independent
 *                       publisher domains, ≥ 2 domains first reporting within the last hour,
 *                       and no rumor/preview/betting language. A single source NEVER qualifies.
 *   developing          a news-type event (incl. record/transaction), confidence ≥ medium,
 *                       ≥ 2 independent domains, newest report ≤ 6h old, no rumor language.
 *   normal              everything else — including game results and previews.
 *
 * No exceptions are defined: there is no source-specific fast path in this phase.
 */
export function classifyUrgency(input: UrgencyInput): UrgencyResult {
  const { eventType } = input;
  const reasons: string[] = [];

  if (hasSpeculativeLanguage(input.headlines)) return { level: "normal", reasons: ["rumor/preview/betting language caps urgency at normal"] };
  if (eventType === null) return { level: "normal", reasons: ["event type unclear"] };
  if (!NEWSY_EVENT_TYPES.has(eventType)) return { level: "normal", reasons: [`${eventType} is not an urgency-eligible event type`] };
  if (input.domains < URGENCY.developingMinSources) return { level: "normal", reasons: [`single-source (${input.domains}) — never automatic`] };
  if (input.confidence === "low") return { level: "normal", reasons: ["low cluster confidence"] };

  const breaking =
    BREAKING_EVENT_TYPES.has(eventType) &&
    input.confidence === "high" &&
    input.domains >= URGENCY.breakingMinSources &&
    input.latestAgeHours <= URGENCY.breakingMaxAgeHours &&
    input.sourcesLastHour >= URGENCY.breakingMinSourcesLastHour;
  if (breaking) {
    reasons.push(`${eventType} reported by ${input.domains} independent sources, ${input.sourcesLastHour} within the last hour, newest ${input.latestAgeHours.toFixed(1)}h old`);
    return { level: "breaking-candidate", reasons };
  }

  if (input.latestAgeHours <= URGENCY.developingMaxAgeHours) {
    reasons.push(`${eventType} with ${input.domains} independent sources, newest ${input.latestAgeHours.toFixed(1)}h old`);
    return { level: "developing", reasons };
  }
  return { level: "normal", reasons: [`${eventType} is ${input.latestAgeHours.toFixed(1)}h old — past the developing window`] };
}
