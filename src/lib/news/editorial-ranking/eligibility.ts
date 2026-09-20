import { MAX_AGE_HOURS } from "./config";

/**
 * Betting promos, sportsbook bonuses and fantasy content are not news, and the product is not
 * optimized around them. Checked on the publisher headlines the cluster carries.
 */
const BETTING_OR_FANTASY =
  /\b(?:bonus code|promo code|sportsbook|best bets?|free bets?|prop bets?|parlay|betting (?:odds|picks|preview|guide|tips)|odds (?:and|&) (?:picks|predictions)|bet \$?\d+|bet365|draftkings|fanduel|caesars|betmgm|fantasy (?:football|basketball|baseball|hockey)|fantasy (?:start|sit|rankings?|waiver|draft)|dfs picks|start\/sit)\b/i;
import { newestAt, hoursBetween } from "./signals";
import type { ClusterInput, EditorialStatus, EligibilityReason, EligibilityResult } from "./types";

/**
 * Editorial eligibility, decided BEFORE ranking and BEFORE any manual override, so an override
 * can change priority but can never make an unsafe item publishable. Every reason is returned —
 * nothing is dropped silently.
 *
 *   ineligible  no publisher headline / discovery-text only · low confidence · closed or
 *               needs-review cluster · every source disabled · every source low-quality ·
 *               older than 48h · rejected or held by an editor
 *   review      medium confidence · an unresolved high-confidence clustering ambiguity
 *               (competing cluster, or identical text in two sports) — ranked (medium
 *               takes a penalty) but flagged for an editor and never Lead
 *   eligible    everything else
 *
 * Mixed source quality is fine: one unknown publisher is not a problem; only an ALL-low-quality
 * cluster is held. `quality` is an operational bucket, never a credibility judgment.
 */
export function publicationHeadline(input: ClusterInput): string | null {
  const representative = input.members.find((m) => m.candidateId === input.representativeCandidateId);
  return representative?.headlineKind === "publisher-title" && representative.sourceEnabled &&
    representative.headline.trim() && representative.headline === input.canonicalHeadline
    ? representative.headline : null;
}

export function assessEligibility(input: ClusterInput, now: Date, itemStatus?: EditorialStatus | null): EligibilityResult {
  const reasons: EligibilityReason[] = [];
  const hold = (code: string, detail: string) => reasons.push({ code, severity: "ineligible", detail });
  const review = (code: string, detail: string) => reasons.push({ code, severity: "review", detail });

  if (input.status === "closed") hold("closed-cluster", "cluster is closed (aged out or merged)");
  if (input.status === "needs_review") hold("needs-review-state", "cluster is flagged needs_review");

  const publisherMembers = input.members.filter((m) => m.headlineKind === "publisher-title");
  if (input.members.length > 0 && publisherMembers.length === 0) hold("discovery-text-only", "every member is provider prose (discovery text) — not a publishable headline");
  else if (!publicationHeadline(input)) hold("no-publisher-headline", "no representative publisher headline");

  const publisherHeadlines = publisherMembers.map((m) => m.headline);
  if (publisherHeadlines.length > 0 && publisherHeadlines.filter((h) => BETTING_OR_FANTASY.test(h)).length * 2 >= publisherHeadlines.length) {
    hold("betting-or-fantasy", "betting promo / fantasy content — not editorial news");
  }

  if (input.confidence === "low") hold("low-confidence", "cluster confidence is low");
  else if (input.confidence === "medium") review("medium-confidence", "cluster confidence is medium — ranking penalty, editor review required");

  if (input.members.length > 0) {
    const enabled = input.members.filter((m) => m.sourceEnabled);
    if (enabled.length === 0) hold("all-sources-disabled", "every source in the cluster is disabled");
    else if (enabled.every((m) => m.quality === "low-quality")) hold("all-sources-low-quality", "every source is in the low-quality bucket");
  }

  const ageHours = hoursBetween(now, newestAt(input));
  if (ageHours > MAX_AGE_HOURS) hold("too-old", `newest report is ${ageHours.toFixed(1)}h old (max ${MAX_AGE_HOURS}h)`);

  const risky = input.nearMisses.filter((n) => n.reason === "competing-high-confidence-cluster" || n.reason === "exact-headline-sport-mismatch");
  if (risky.length > 0) review("unresolved-near-miss", `unresolved clustering ambiguity: ${[...new Set(risky.map((n) => n.reason))].join(", ")}`);

  if (itemStatus === "rejected") hold("editor-rejected", "rejected by an editor");
  if (itemStatus === "held") hold("editor-held", "held by an editor");

  const state = reasons.some((r) => r.severity === "ineligible") ? "ineligible" : reasons.some((r) => r.severity === "review") ? "review" : "eligible";
  return { state, reasons };
}
