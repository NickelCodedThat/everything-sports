import { ALGORITHM_VERSION, CLUSTER_SPAN_FACTOR, HOURS_MS, THRESHOLDS, WINDOWS_HOURS, type EventType, type MatchConfidence } from "./config";
import { compareEventTypes } from "./event-type";
import { entityKeys, type HeadlineFeatures } from "./features";
import type { Contradiction } from "./guards";
import { CONFIDENCE_RANK, scorePair, type MatchRoute, type PairEvidence } from "./score";

export interface ClusterableCandidate {
  id: string;
  headline: string;
  normalizedHeadline: string;
  headlineKind: "publisher-title" | "discovery-text";
  sport: string;
  league: string | null;
  sourceId: number;
  sourceDomain: string;
  publishedAt: Date | null;
  discoveredAt: Date;
}

/** One row from news_cluster_neighbors. */
export interface Neighbor {
  candidateId: string;
  headline: string;
  headlineKind: string;
  sport: string;
  league: string | null;
  sourceDomain: string;
  freshAt: Date;
  clusterId: string | null;
  clusterFirstFreshAt: Date | null;
  clusterLastFreshAt: Date | null;
  clusterEventType: string | null;
  similarity: number;
  wordSimilarity: number;
  exactHeadline: boolean;
}

export interface AmbiguousMatch {
  clusterId: string;
  score: number;
  confidence: MatchConfidence;
  reason: "medium-confidence-match" | "competing-high-confidence-cluster" | "exact-headline-sport-mismatch";
  evidence: Record<string, unknown>;
}

export interface Decision {
  action: "join" | "create";
  clusterId: string | null;
  method: "seed" | "exact-headline" | "fuzzy-headline" | "entity-overlap";
  score: number;
  confidence: MatchConfidence;
  eventType: EventType | null;
  entities: string[];
  evidence: Record<string, unknown>;
  ambiguous: AmbiguousMatch[];
  neighborsConsidered: number;
}

export const freshAtOf = (candidate: Pick<ClusterableCandidate, "publishedAt" | "discoveredAt">): Date => candidate.publishedAt ?? candidate.discoveredAt;
const hoursBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / HOURS_MS;

/** Identical text is compatible with identical text unless the sport labels are genuinely different sports. */
export function sportsCompatibleForExact(a: string, b: string): boolean {
  return a === b || a === "unknown" || a === "other" || b === "unknown" || b === "other";
}

const compact = (evidence: PairEvidence) => ({
  similarity: evidence.similarity,
  wordSimilarity: evidence.wordSimilarity,
  tokenJaccard: evidence.tokenJaccard,
  sharedTeams: evidence.sharedTeams,
  sharedNames: evidence.sharedNames,
  sharedScores: evidence.sharedScores,
  events: [evidence.eventA, evidence.eventB],
  eventAgreement: evidence.eventAgreement,
  hoursApart: evidence.hoursApart,
  windowHours: evidence.windowHours,
  contradictions: evidence.contradictions,
  parts: evidence.parts,
  score: evidence.score,
  confidence: evidence.confidence,
  route: evidence.route,
});

export type FeatureLookup = (headline: string) => HeadlineFeatures;

interface ClusterMatch {
  clusterId: string;
  neighbor: Neighbor;
  evidence: PairEvidence;
}

/**
 * Decide where ONE candidate goes. Pure: neighbours in, decision out — so the same function
 * powers the real run and --dry-run, and every decision is reproducible from its inputs.
 *
 *   1. exact normalized headline already clustered (compatible sport, ≤48h) → join, HIGH
 *   2. otherwise (publisher titles only) score every clustered neighbour with the deterministic
 *      pair scorer; keep the best pair per cluster; join the best cluster only if it is HIGH
 *   3. otherwise seed a new cluster. Near misses (MEDIUM) are returned as `ambiguous`.
 */
export function decide(candidate: ClusterableCandidate, neighbors: Neighbor[], featuresOf: FeatureLookup): Decision {
  const features = featuresOf(candidate.headline);
  const freshAt = freshAtOf(candidate);
  const base = { eventType: features.event.type, entities: entityKeys(features), neighborsConsidered: neighbors.length };
  const ambiguous: AmbiguousMatch[] = [];

  // 1 — exact-headline seed (also the only path for discovery-text)
  const exact = neighbors
    .filter((n) => n.exactHeadline && n.clusterId && n.headlineKind === candidate.headlineKind)
    .map((n) => ({ n, hours: hoursBetween(n.freshAt, freshAt) }))
    .sort((x, y) => x.hours - y.hours || (x.n.clusterId! < y.n.clusterId! ? -1 : 1));
  const exactInWindow = exact.filter((e) => e.hours <= WINDOWS_HOURS.exactHeadline);
  const exactCompatible = exactInWindow.find((e) => sportsCompatibleForExact(e.n.sport, candidate.sport));
  for (const e of exactInWindow) {
    if (!sportsCompatibleForExact(e.n.sport, candidate.sport)) {
      ambiguous.push({
        clusterId: e.n.clusterId!,
        score: 1,
        confidence: "medium",
        reason: "exact-headline-sport-mismatch",
        evidence: { matched: e.n.headline, matchedSport: e.n.sport, candidateSport: candidate.sport },
      });
    }
  }
  if (exactCompatible) {
    const sources = [...new Set(exactInWindow.map((e) => e.n.sourceDomain))];
    return {
      ...base,
      action: "join",
      clusterId: exactCompatible.n.clusterId,
      method: "exact-headline",
      score: 1,
      confidence: "high",
      evidence: {
        algorithm: ALGORITHM_VERSION,
        matchedCandidateId: exactCompatible.n.candidateId,
        matchedHeadline: exactCompatible.n.headline,
        hoursApart: Number(exactCompatible.hours.toFixed(2)),
        windowHours: WINDOWS_HOURS.exactHeadline,
        sameHeadlineSources: sources,
      },
      ambiguous,
    };
  }

  const seed = (extra: Record<string, unknown> = {}): Decision => ({
    ...base,
    action: "create",
    clusterId: null,
    method: "seed",
    score: 1,
    confidence: "high",
    evidence: { algorithm: ALGORITHM_VERSION, reason: candidate.headlineKind === "discovery-text" ? "discovery-text-exact-only" : "no-confident-match", ...extra },
    ambiguous,
  });

  // Discovery text is CC BY-SA prose, not a publisher headline: exact seeds only, never fuzzy.
  if (candidate.headlineKind !== "publisher-title") return seed();

  // 2 — fuzzy / entity evidence against clustered neighbours of the same sport
  const bestPerCluster = new Map<string, ClusterMatch>();
  for (const neighbor of neighbors) {
    if (!neighbor.clusterId || neighbor.headlineKind !== "publisher-title" || neighbor.sport !== candidate.sport) continue;
    if (neighbor.candidateId === candidate.id) continue;

    const hoursApart = hoursBetween(neighbor.freshAt, freshAt);
    const neighborFeatures = featuresOf(neighbor.headline);
    const extra: Contradiction[] = [];

    if (neighbor.clusterEventType && features.event.type) {
      const agreement = compareEventTypes(features.event, { type: neighbor.clusterEventType as EventType, types: [neighbor.clusterEventType as EventType], signals: [] });
      if (agreement === "conflict") extra.push({ code: "cluster-event-conflict", severity: "block", detail: `cluster is ${neighbor.clusterEventType}, candidate is ${features.event.type}` });
    }

    const evidence = scorePair({
      similarity: neighbor.similarity,
      wordSimilarity: neighbor.wordSimilarity,
      a: features,
      b: neighborFeatures,
      sportA: candidate.sport,
      sportB: neighbor.sport,
      leagueA: candidate.league,
      leagueB: neighbor.league,
      hoursApart,
      extraContradictions: extra,
    });

    // A cluster may not stretch over more than twice the pair window (stops slow chaining A~B~C~D).
    const first = neighbor.clusterFirstFreshAt ?? neighbor.freshAt;
    const last = neighbor.clusterLastFreshAt ?? neighbor.freshAt;
    const span = (Math.max(last.getTime(), freshAt.getTime()) - Math.min(first.getTime(), freshAt.getTime())) / HOURS_MS;
    if (span > CLUSTER_SPAN_FACTOR * evidence.windowHours && !evidence.blocked) {
      const contradiction: Contradiction = { code: "cluster-span-exceeded", severity: "block", detail: `cluster would span ${span.toFixed(1)}h (max ${CLUSTER_SPAN_FACTOR * evidence.windowHours}h)` };
      evidence.contradictions.push(contradiction);
      evidence.blocked = true;
      evidence.confidence = "low";
      evidence.route = null;
      evidence.score = Math.min(evidence.score, 0.2);
    }

    const current = bestPerCluster.get(neighbor.clusterId);
    const better =
      !current ||
      CONFIDENCE_RANK[evidence.confidence] > CONFIDENCE_RANK[current.evidence.confidence] ||
      (evidence.confidence === current.evidence.confidence && evidence.score > current.evidence.score);
    if (better) bestPerCluster.set(neighbor.clusterId, { clusterId: neighbor.clusterId, neighbor, evidence });
  }

  const ranked = [...bestPerCluster.values()].sort(
    (x, y) =>
      CONFIDENCE_RANK[y.evidence.confidence] - CONFIDENCE_RANK[x.evidence.confidence] ||
      y.evidence.score - x.evidence.score ||
      (x.clusterId < y.clusterId ? -1 : 1),
  );

  const alternatives = ranked.slice(0, 5).map((m) => ({ clusterId: m.clusterId, score: m.evidence.score, confidence: m.evidence.confidence, blocked: m.evidence.blocked }));
  const best = ranked[0];

  if (best && best.evidence.confidence === "high" && best.evidence.route) {
    for (const other of ranked.slice(1)) {
      if (other.evidence.confidence === "high") {
        ambiguous.push({ clusterId: other.clusterId, score: other.evidence.score, confidence: "high", reason: "competing-high-confidence-cluster", evidence: { matched: other.neighbor.headline, ...compact(other.evidence) } });
      }
    }
    const route: MatchRoute = best.evidence.route;
    return {
      ...base,
      action: "join",
      clusterId: best.clusterId,
      method: route,
      score: best.evidence.score,
      confidence: "high",
      evidence: {
        algorithm: ALGORITHM_VERSION,
        matchedCandidateId: best.neighbor.candidateId,
        matchedHeadline: best.neighbor.headline,
        matchedSource: best.neighbor.sourceDomain,
        ...compact(best.evidence),
        alternatives,
      },
      ambiguous,
    };
  }

  // 3 — no confident match: separate cluster. Surface the near misses.
  for (const match of ranked) {
    if (match.evidence.confidence === "medium" && !match.evidence.blocked && ambiguous.length < 3) {
      ambiguous.push({ clusterId: match.clusterId, score: match.evidence.score, confidence: "medium", reason: "medium-confidence-match", evidence: { matched: match.neighbor.headline, ...compact(match.evidence) } });
    }
  }
  return seed({ alternatives, thresholds: { high: THRESHOLDS.high, nearIdentical: THRESHOLDS.nearIdentical, medium: THRESHOLDS.medium } });
}
