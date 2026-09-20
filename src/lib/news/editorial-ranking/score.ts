import { CONFIDENCE_POINTS, UNCORROBORATED_PENALTY, EVENT_IMPORTANCE, OVERRIDE, PRIORITY_BANDS, SPORT_BASE, STAKES_BONUS, TIER_POINTS, URGENCY_POINTS } from "./config";
import { assessEligibility } from "./eligibility";
import { assessSections, deskForSport } from "./sections";
import { breadthPoints, buildMetrics, corroboratedImportance, eventImportancePoints, hasStakes, hoursBetween, inferTier, newestAt, firstAt, recencyPoints, velocityPoints } from "./signals";
import { classifyUrgency, hasSpeculativeLanguage } from "./urgency";
import type { ClusterInput, EditorialStatus, OverrideInput, RankedCluster, ScorePart } from "./types";

const round2 = (value: number) => Number(value.toFixed(2));

export interface ScoreContext {
  now: Date;
  overrides?: OverrideInput[];
  /** Existing editor-owned status, if the cluster already has an editorial item. */
  itemStatus?: EditorialStatus | null;
}

export function priorityForScore(score: number): 1 | 2 | 3 | 4 {
  for (const band of PRIORITY_BANDS) if (score >= band.min) return band.priority;
  return 4;
}

/**
 * Score ONE cluster. The final score is the plain sum of `scoreParts`:
 *
 *   sport priority     basketball 100 · football 95 · baseball 90 · boxing/mma/soccer 70 · … (Phase 1 hierarchy)
 *   competition tier   professional +20 · international +16 · unspecified +10 · college +6 · developmental 0
 *   recency            0–60, smooth half-life decay (latest report 6h, event age 12h)
 *   event importance   death 55 · trade/coaching/retirement 45 · injury/discipline 40 · signing/record 35
 *                      · business/draft 30 · transaction 20 · game result 15 · preview −15
 *   stakes language    +12 when headlines say Finals / World Series / Super Bowl / title / Game 7 …
 *   breadth            distinct publisher domains (log, cap 34 @ 20) + independence 8 + known confirmation 6 + providers 2
 *   velocity           new domains in the last 15m (5 each, ≤4) and rest of the hour (2 each, ≤5); needs ≥ 2 domains
 *   urgency            developing +12 · breaking-candidate +30
 *   cluster confidence high +5 · medium −25
 *   manual overrides   pin +1000 · boost +n · suppress −n (80) · force_priority replaces the total
 *
 * Caps: no single non-override family exceeds 100 (sport) / 60 (recency) / 55 (event) / 50 (breadth) /
 * 30 (velocity or urgency), so a baseball story can beat a basketball one on a massive event but
 * the sport prior still wins ties. Ineligible clusters are scored too (for inspection) but get no rank.
 */
export function scoreCluster(input: ClusterInput, ctx: ScoreContext): RankedCluster {
  const { now } = ctx;
  const headlines = [...new Set(input.members.filter((m) => m.headlineKind === "publisher-title").map((m) => m.headline))];
  const tier = inferTier(input, headlines);
  const metrics = buildMetrics(input, now, headlines, tier);
  const latestAge = Math.max(0, hoursBetween(now, newestAt(input)));
  const eventAge = Math.max(0, hoursBetween(now, firstAt(input)));

  const eligibility = assessEligibility(input, now, ctx.itemStatus);
  const breadth = breadthPoints(input.members, input.providerCount, input.eventType);
  const velocity = velocityPoints(input.members, now, input.eventType);
  const urgency = classifyUrgency({
    eventType: input.eventType,
    latestAgeHours: latestAge,
    domains: breadth.domains,
    sourcesLastHour: velocity.lastHour,
    confidence: input.confidence,
    headlines,
  });
  const importance = eventImportancePoints(input.eventType);
  const corroborated = corroboratedImportance(importance, breadth.domains);
  const stakes = hasStakes(headlines);

  const parts: ScorePart[] = [];
  const sportBase = SPORT_BASE[input.sport] ?? SPORT_BASE.other;
  parts.push({ key: "sport", label: `sport priority (${input.sport})`, points: sportBase });
  parts.push({ key: "tier", label: `competition tier (${tier})`, points: TIER_POINTS[tier] });
  parts.push({ key: "recency", label: `recency (newest ${latestAge.toFixed(1)}h, event ${eventAge.toFixed(1)}h old)`, points: recencyPoints(latestAge, eventAge) });
  parts.push({ key: "event", label: `event type (${input.eventType ?? "unclear"})`, points: corroborated.points, detail: corroborated.factor < 1 ? `×${corroborated.factor} — ${breadth.domains === 1 ? "single source" : "two sources"}, not yet corroborated` : undefined });
  if (stakes && input.eventType !== "preview") parts.push({ key: "stakes", label: "high-stakes language in headlines", points: STAKES_BONUS });
  parts.push(...breadth.parts);
  if (velocity.part) parts.push(velocity.part);
  if (urgency.level !== "normal") parts.push({ key: "urgency", label: `urgency (${urgency.level})`, points: URGENCY_POINTS[urgency.level], detail: urgency.reasons[0] });
  if (breadth.domains <= 1) parts.push({ key: "corroboration", label: "uncorroborated (single publisher)", points: UNCORROBORATED_PENALTY });
  const confidencePts = CONFIDENCE_POINTS[input.confidence];
  if (confidencePts) parts.push({ key: "confidence", label: `cluster confidence (${input.confidence})`, points: confidencePts });

  // --- manual overrides: applied AFTER eligibility, so they only ever change priority/placement ---
  const overrides = ctx.overrides ?? [];
  const ignoredOverrides: RankedCluster["ignoredOverrides"] = [];
  for (const override of overrides) {
    if (override.kind === "pin") parts.push({ key: "override.pin", label: "editor pin", points: OVERRIDE.pinBonus, detail: override.reason ?? undefined });
    else if (override.kind === "boost") parts.push({ key: "override.boost", label: "editor boost", points: Math.min(OVERRIDE.boostMax, override.amount ?? 0), detail: override.reason ?? undefined });
    else if (override.kind === "suppress") parts.push({ key: "override.suppress", label: "editor suppress", points: -(override.amount ?? OVERRIDE.suppressDefault), detail: override.reason ?? undefined });
  }
  const forcePriority = overrides.find((o) => o.kind === "force_priority");
  if (forcePriority) {
    const withoutForce = round2(parts.reduce((sum, p) => sum + p.points, 0));
    parts.push({ key: "override.force_priority", label: `editor force-priority → ${forcePriority.amount}`, points: round2((forcePriority.amount ?? 0) - withoutForce), detail: forcePriority.reason ?? undefined });
  }
  const finalScore = round2(parts.reduce((sum, p) => sum + p.points, 0));

  const desk = deskForSport(input.sport);
  // Publication-safe headline: a verbatim PUBLISHER headline of a real representative. Independent of
  // eligibility (an editor-held or too-old item still has its headline); discovery text never qualifies.
  const hasPublisherHeadline =
    Boolean(input.canonicalHeadline && input.representativeCandidateId) && input.members.some((m) => m.candidateId === input.representativeCandidateId && m.headlineKind === "publisher-title");
  const hasHeadline = hasPublisherHeadline && eligibility.state !== "ineligible";
  const sectionEligibility = assessSections({
    eligibility: eligibility.state,
    hasPublishableHeadline: hasHeadline,
    confidence: input.confidence,
    eventType: input.eventType,
    eventImportance: importance,
    urgency: urgency.level,
    domains: breadth.domains,
    sourcesLastHour: velocity.lastHour,
    latestAgeHours: latestAge,
    stakes,
    speculative: hasSpeculativeLanguage(headlines),
    allLowQuality: input.members.length > 0 && input.members.filter((m) => m.sourceEnabled).every((m) => m.quality === "low-quality"),
  });

  const forced = overrides.find((o) => o.kind === "force_section");
  if (forced) {
    const target = forced.text ?? "";
    const okTarget = target === "lead" ? sectionEligibility.lead : target === "wire" ? sectionEligibility.wire : target === "now" ? sectionEligibility.now : eligibility.state !== "ineligible";
    if (!okTarget) ignoredOverrides.push({ kind: "force_section", reason: `item does not qualify for ${target}` });
  }

  const reasons = [
    ...eligibility.reasons.map((r) => `${r.severity}: ${r.detail}`),
    ...urgency.reasons.map((r) => `urgency: ${r}`),
    ...sectionEligibility.notes,
  ];

  return {
    clusterId: input.clusterId,
    input,
    headline: hasPublisherHeadline ? input.canonicalHeadline : null,
    eligibility,
    urgency: urgency.level,
    urgencyReasons: urgency.reasons,
    desk,
    sectionEligibility,
    finalScore,
    scoreParts: parts,
    priority: priorityForScore(finalScore),
    position: null,
    overrides,
    ignoredOverrides,
    reasons,
    metrics,
  };
}

/** Deterministic total order: score, then sport priority (basketball wins ties), then newest, then id. */
export function compareRanked(a: RankedCluster, b: RankedCluster): number {
  return (
    b.finalScore - a.finalScore ||
    (SPORT_BASE[b.input.sport] ?? 0) - (SPORT_BASE[a.input.sport] ?? 0) ||
    newestAt(b.input).getTime() - newestAt(a.input).getTime() ||
    (a.clusterId < b.clusterId ? -1 : 1)
  );
}

export interface RankOptions {
  now: Date;
  overridesByCluster?: Map<string, OverrideInput[]>;
  statusByCluster?: Map<string, EditorialStatus>;
}

/** Score every cluster and assign 1-based positions to the eligible ones. */
export function rankClusters(inputs: ClusterInput[], options: RankOptions): RankedCluster[] {
  const scored = inputs.map((input) =>
    scoreCluster(input, { now: options.now, overrides: options.overridesByCluster?.get(input.clusterId), itemStatus: options.statusByCluster?.get(input.clusterId) }),
  );
  scored.sort(compareRanked);
  let position = 0;
  for (const ranked of scored) if (ranked.eligibility.state !== "ineligible") ranked.position = ++position;
  return scored;
}

export { EVENT_IMPORTANCE };
