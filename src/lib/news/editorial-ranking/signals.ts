import type { MatchConfidence } from "../clustering/config";
import { VELOCITY_EVENT_FACTOR, BREADTH_EVENT_FACTOR, CORROBORATION_FACTOR, COLLEGE_STRUCTURED_SPORTS, BREADTH, EVENT_IMPORTANCE, RECENCY, STAKES_BONUS, VELOCITY, type Tier } from "./config";
import { COLLEGE_TEAM_KEYS, PRO_TEAM_KEYS } from "../clustering/entities";
import type { ClusterInput, ClusterMetrics, MemberInput, ScorePart } from "./types";

const HOUR = 3_600_000;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const halfLife = (ageHours: number, halfLifeHours: number) => Math.pow(0.5, Math.max(0, ageHours) / halfLifeHours);

export const hoursBetween = (later: Date, earlier: Date) => (later.getTime() - earlier.getTime()) / HOUR;

// ---------------------------------------------------------------------------
// Recency — smooth exponential decay, no cliffs
// ---------------------------------------------------------------------------

export function newestAt(input: ClusterInput): Date {
  return input.lastPublishedAt ?? input.lastSeenAt;
}
export function firstAt(input: ClusterInput): Date {
  return input.firstPublishedAt ?? input.firstSeenAt;
}

/**
 * 60 × (0.65·½^(age of newest report / 6h) + 0.35·½^(age of first report / 12h)).
 * A 2h-old event scores ~47; the same event 18h old ~9. A cluster still receiving fresh reports
 * stays warm, but a story that broke long ago fades even while it is still being re-reported.
 */
export function recencyPoints(latestAgeHours: number, eventAgeHours: number): number {
  const { max, latestWeight, latestHalfLifeHours, eventWeight, eventHalfLifeHours } = RECENCY;
  return round(max * (latestWeight * halfLife(latestAgeHours, latestHalfLifeHours) + eventWeight * halfLife(eventAgeHours, eventHalfLifeHours)));
}

// ---------------------------------------------------------------------------
// Sources: breadth and velocity — always DISTINCT PUBLISHER DOMAINS
// ---------------------------------------------------------------------------

const logScale = (n: number, saturateAt: number) => (n <= 1 ? 0 : Math.min(1, Math.log(n) / Math.log(saturateAt)));

/** Distinct enabled publisher domains and the per-domain first report time. */
export function domainFirstReports(members: MemberInput[]): Map<string, { firstAt: Date; quality: MemberInput["quality"] }> {
  const byDomain = new Map<string, { firstAt: Date; quality: MemberInput["quality"] }>();
  for (const member of members) {
    if (!member.sourceEnabled) continue;
    const current = byDomain.get(member.domain);
    if (!current || member.reportedAt < current.firstAt) byDomain.set(member.domain, { firstAt: member.reportedAt, quality: member.quality });
  }
  return byDomain;
}

const normalizeVariant = (headline: string) => headline.toLowerCase().replace(/\s[–—|]\s[^–—|]{2,60}$/, "").replace(/[^a-z0-9]+/g, " ").trim();

export interface BreadthResult {
  points: number;
  parts: ScorePart[];
  domains: number;
  knownDomains: number;
  variants: number;
}

export function breadthPoints(members: MemberInput[], providerCount: number, eventType: string | null = null): BreadthResult {
  const byDomain = domainFirstReports(members);
  const domains = byDomain.size;
  const knownDomains = [...byDomain.values()].filter((d) => d.quality === "known").length;
  const variants = new Set(members.filter((m) => m.sourceEnabled && m.headlineKind === "publisher-title").map((m) => normalizeVariant(m.headline))).size;

  const factor = BREADTH_EVENT_FACTOR[(eventType ?? "unknown") as keyof typeof BREADTH_EVENT_FACTOR] ?? 1;
  const domainPts = round(BREADTH.domainsMax * logScale(domains, BREADTH.domainsSaturateAt) * factor);
  const variantPts = round(BREADTH.variantsMax * logScale(variants, BREADTH.variantsSaturateAt) * factor);
  const knownPts = knownDomains >= 3 ? BREADTH.knownConfirmation.threePlus : knownDomains === 2 ? BREADTH.knownConfirmation.two : 0;
  const providerPts = Math.min(BREADTH.providerMax, Math.max(0, providerCount - 1) * BREADTH.providerPerExtra);

  const parts: ScorePart[] = [
    { key: "breadth.sources", label: `${domains} independent publisher${domains === 1 ? "" : "s"}`, points: domainPts, detail: `log scale, saturates at ${BREADTH.domainsSaturateAt} domains (max ${BREADTH.domainsMax})${factor < 1 ? `; ×${factor} — routine ${eventType} coverage` : ""}` },
  ];
  if (variantPts) parts.push({ key: "breadth.independence", label: `${variants} distinct headline wordings`, points: variantPts, detail: "verbatim syndicated copies count as one voice" });
  if (knownPts) parts.push({ key: "breadth.confirmation", label: `${knownDomains} known publishers`, points: knownPts, detail: "operational quality bucket, not a credibility rating" });
  if (providerPts) parts.push({ key: "breadth.providers", label: `${providerCount} discovery providers`, points: providerPts });
  return { points: round(parts.reduce((sum, p) => sum + p.points, 0)), parts, domains, knownDomains, variants };
}

export interface VelocityResult {
  points: number;
  last15m: number;
  lastHour: number;
  part: ScorePart | null;
}

/**
 * Coverage velocity: how many DISTINCT domains first reported inside the last 15 minutes, and
 * in the rest of the last hour. Needs ≥ 2 domains overall — one source cannot have "velocity".
 */
export function velocityPoints(members: MemberInput[], now: Date, eventType: string | null = null): VelocityResult {
  const byDomain = domainFirstReports(members);
  let last15m = 0;
  let earlierHour = 0;
  for (const { firstAt: at } of byDomain.values()) {
    const ageMinutes = Math.max(0, (now.getTime() - at.getTime()) / 60_000);
    if (ageMinutes <= 15) last15m += 1;
    else if (ageMinutes <= 60) earlierHour += 1;
  }
  const lastHour = last15m + earlierHour;
  if (byDomain.size < VELOCITY.minDomains || lastHour === 0) return { points: 0, last15m, lastHour, part: null };
  const factor = VELOCITY_EVENT_FACTOR[(eventType ?? "unknown") as keyof typeof VELOCITY_EVENT_FACTOR] ?? 1;
  const points = round((Math.min(VELOCITY.maxCount15m, last15m) * VELOCITY.perSourceLast15m + Math.min(VELOCITY.maxCountEarlierHour, earlierHour) * VELOCITY.perSourceEarlierHour) * factor);
  return {
    points,
    last15m,
    lastHour,
    part: { key: "velocity", label: `${last15m} new source${last15m === 1 ? "" : "s"} in 15m, ${lastHour} in the last hour`, points, detail: factor < 1 ? `×${factor} — routine ${eventType} coverage` : undefined },
  };
}

// ---------------------------------------------------------------------------
// Event importance and stakes
// ---------------------------------------------------------------------------

const STAKES =
  /\b(?:nba|wnba) finals\b|\bfinals (?:mvp|game)\b|\bworld series\b|\bsuper bowl\b|\bconference finals\b|\bchampionship\b|\bnational title\b|\btitle game\b|\bgame [5-7]\b|\bwin(?:s|ning)? (?:the )?(?:title|crown)\b|\b(?:retain|retains|defend|defends|win|wins|won|claim|claims|capture|captures)\b[^.]{0,30}\b(?:title|belt|crown)\b/i;

/** High-stakes language present in the headlines. Text evidence only — never invented game-stage data. */
export function hasStakes(headlines: string[]): boolean {
  return headlines.some((headline) => STAKES.test(headline));
}

export function eventImportancePoints(eventType: string | null): number {
  return EVENT_IMPORTANCE[(eventType ?? "unknown") as keyof typeof EVENT_IMPORTANCE] ?? EVENT_IMPORTANCE.unknown;
}

/** Positive importance is scaled by corroboration; a negative one (previews) is never softened. */
export function corroboratedImportance(base: number, domains: number): { points: number; factor: number } {
  if (base <= 0) return { points: base, factor: 1 };
  const factor = domains >= 3 ? CORROBORATION_FACTOR.threePlus : domains === 2 ? CORROBORATION_FACTOR.two : CORROBORATION_FACTOR.one;
  return { points: round(base * factor), factor };
}
export { STAKES_BONUS };

// ---------------------------------------------------------------------------
// Competition tier from entity/league evidence
// ---------------------------------------------------------------------------

const COLLEGE_LEAGUES = new Set(["ncaa", "fbs"]);
const PRO_LEAGUES = new Set(["nba", "wnba", "nfl", "mlb", "nhl", "mls"]);
const COLLEGE_WORDS = /\b(?:college|ncaa|fbs|heisman|march madness|big ten|big 12|sec|acc|freshman|sophomore|campus|bowl game)\b/i;

const LEAGUE_TIER: Record<string, Tier> = {
  nba: "professional", wnba: "professional", nfl: "professional", mlb: "professional", nhl: "professional",
  mls: "professional", ufc: "professional", boxing: "professional", pga: "professional",
  ncaab: "college", ncaaf: "college", milb: "developmental", olympics: "international", "intl-soccer": "international",
};

/** Tier from evidence we actually have: the cluster league, league/team entities, and college vocabulary in headlines. */
export function inferTier(input: ClusterInput, headlines: string[]): Tier {
  if (input.league && LEAGUE_TIER[input.league.toLowerCase()]) return LEAGUE_TIER[input.league.toLowerCase()];
  const teams = input.entities.filter((e) => e.startsWith("team:")).map((e) => e.slice(5));
  const leagues = input.entities.filter((e) => e.startsWith("league:")).map((e) => e.slice(7));
  if (leagues.some((l) => COLLEGE_LEAGUES.has(l)) || headlines.some((h) => COLLEGE_WORDS.test(h))) return "college";
  if (teams.some((t) => COLLEGE_TEAM_KEYS.has(t)) && !teams.some((t) => PRO_TEAM_KEYS.has(t))) return "college";
  if (leagues.some((l) => PRO_LEAGUES.has(l)) || teams.some((t) => PRO_TEAM_KEYS.has(t))) return "professional";
  if (input.sport === "olympics") return "international";
  return COLLEGE_STRUCTURED_SPORTS.has(input.sport) ? "unspecified-major" : "professional";
}

export function teamsOf(input: ClusterInput): string[] {
  return input.entities.filter((e) => e.startsWith("team:")).map((e) => e.slice(5)).sort();
}

export function confidenceLabel(confidence: MatchConfidence): string {
  return confidence;
}

export function buildMetrics(input: ClusterInput, now: Date, headlines: string[], tier: Tier): ClusterMetrics {
  const breadth = domainFirstReports(input.members);
  const velocity = velocityPoints(input.members, now, input.eventType);
  return {
    domains: breadth.size,
    knownDomains: [...breadth.values()].filter((d) => d.quality === "known").length,
    headlineVariants: new Set(input.members.filter((m) => m.sourceEnabled && m.headlineKind === "publisher-title").map((m) => normalizeVariant(m.headline))).size,
    sourcesLast15m: velocity.last15m,
    sourcesLastHour: velocity.lastHour,
    latestAgeHours: round(Math.max(0, hoursBetween(now, newestAt(input)))),
    eventAgeHours: round(Math.max(0, hoursBetween(now, firstAt(input)))),
    tier,
    stakes: hasStakes(headlines),
    teams: teamsOf(input),
  };
}
