import type { WarehouseClient } from "../warehouse/client";
import { releaseLock, tryAcquireLock } from "../warehouse/engine-db";
import { randomUUID } from "node:crypto";
import { ALGORITHM_VERSION, HOURS_MS, NEIGHBOR_LIMIT, NEIGHBOR_SEARCH_WINDOW_HOURS, THRESHOLDS } from "./config";
import { decide, freshAtOf, type AmbiguousMatch, type ClusterableCandidate, type Decision, type Neighbor } from "./decide";
import { teamSearchRegex } from "./entities";
import { extractFeatures, type HeadlineFeatures } from "./features";

export const CLUSTER_LOCK_KEY = "cluster:run";
export const CLUSTER_LOCK_TTL_MINUTES = 10;
export const CLUSTER_STALE_RUN_MINUTES = 30;
export const DEFAULT_CLUSTER_WINDOW = "24h";
export const DEFAULT_CLUSTER_LIMIT = 1000;

const UNIT_MS: Record<string, number> = { min: 60_000, h: HOURS_MS, d: 24 * HOURS_MS, w: 7 * 24 * HOURS_MS };

/** "30min", "24h", "3d", "1w" → milliseconds. */
export function parseWindowMs(window: string): number {
  const match = /^(\d+)(min|h|d|w)$/.exec(window);
  if (!match) throw new Error(`Invalid window "${window}" (expected e.g. 30min, 24h, 3d, 1w)`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

export interface ClusterRunOptions {
  /** Only candidates fresher than this (published, else discovered). Default 24h. */
  window?: string;
  sport?: string;
  /** Max candidates handled per run, oldest first. Default 1000. */
  limit?: number;
  /** Decide and report, write nothing (no clusters, no memberships, no run row, no lock). */
  dryRun?: boolean;
  trigger?: "manual" | "scheduled" | "test";
  now?: Date;
}

export interface DecisionRecord {
  candidateId: string;
  headline: string;
  source: string;
  sport: string;
  action: Decision["action"];
  method: Decision["method"];
  confidence: Decision["confidence"];
  score: number;
  /** Real cluster id, or "new-N" for a cluster a dry run proposes to create. */
  clusterId: string;
  createdCluster: boolean;
  eventType: string | null;
  neighborsConsidered: number;
  ambiguous: AmbiguousMatch[];
  evidence: Record<string, unknown>;
}

export interface ClusterRunReport {
  status: "succeeded" | "failed" | "skipped-locked" | "dry-run";
  dryRun: boolean;
  runId: string | null;
  window: string;
  sport: string | null;
  considered: number;
  clustersCreated: number;
  membershipsCreated: number;
  joinedExisting: number;
  ambiguousCount: number;
  durationMs: number;
  errors: string[];
  decisions: DecisionRecord[];
}

export interface ClusterRunDeps {
  client: WarehouseClient;
}

const CHUNK = 100;

async function loadUnclustered(client: WarehouseClient, since: Date, sport: string | undefined, limit: number): Promise<ClusterableCandidate[]> {
  let query = client
    .from("news_unclustered_candidates")
    .select("candidate_id")
    .gte("fresh_at", since.toISOString())
    .order("fresh_at", { ascending: true })
    .order("candidate_id", { ascending: true })
    .limit(limit);
  if (sport) query = query.eq("sport", sport);
  const { data: ids, error } = await query;
  if (error) throw new Error(`loading unclustered candidates failed: ${error.message}`);
  const order = (ids ?? []).map((row) => row.candidate_id as string);

  const byId = new Map<string, ClusterableCandidate>();
  for (let i = 0; i < order.length; i += CHUNK) {
    const { data, error: rowError } = await client
      .from("news_candidates")
      .select("id, headline, normalized_headline, headline_kind, sport, league, source_id, published_at, discovered_at, news_sources(domain)")
      .in("id", order.slice(i, i + CHUNK));
    if (rowError) throw new Error(`loading candidates failed: ${rowError.message}`);
    for (const row of data ?? []) {
      byId.set(row.id, {
        id: row.id,
        headline: row.headline,
        normalizedHeadline: row.normalized_headline,
        headlineKind: row.headline_kind as ClusterableCandidate["headlineKind"],
        sport: row.sport,
        league: row.league,
        sourceId: row.source_id,
        sourceDomain: row.news_sources?.domain ?? "",
        publishedAt: row.published_at ? new Date(row.published_at) : null,
        discoveredAt: new Date(row.discovered_at),
      });
    }
  }
  // Order matters: oldest first, so a newer copy always finds the older cluster (deterministic).
  return order.map((id) => byId.get(id)).filter((c): c is ClusterableCandidate => c !== undefined);
}

export async function fetchNeighbors(client: WarehouseClient, candidateId: string, teamRegex: string | null = null): Promise<Neighbor[]> {
  const { data, error } = await client.rpc("news_cluster_neighbors", {
    p_candidate_id: candidateId,
    p_window: `${NEIGHBOR_SEARCH_WINDOW_HOURS} hours`,
    p_floor: THRESHOLDS.searchFloor,
    p_limit: NEIGHBOR_LIMIT,
    p_team_regex: teamRegex ?? undefined,
  });
  if (error) throw new Error(`news_cluster_neighbors failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    candidateId: row.candidate_id,
    headline: row.headline,
    headlineKind: row.headline_kind,
    sport: row.sport,
    league: row.league,
    sourceDomain: row.source_domain,
    freshAt: new Date(row.fresh_at),
    clusterId: row.cluster_id,
    clusterFirstFreshAt: row.cluster_first_fresh_at ? new Date(row.cluster_first_fresh_at) : null,
    clusterLastFreshAt: row.cluster_last_fresh_at ? new Date(row.cluster_last_fresh_at) : null,
    clusterEventType: row.cluster_event_type,
    similarity: row.similarity,
    wordSimilarity: row.word_similarity,
    exactHeadline: row.exact_headline,
  }));
}

interface AssignResult {
  status: "assigned" | "already-clustered";
  cluster_id: string;
  created_cluster: boolean;
  ambiguous_recorded?: number;
}

async function assign(client: WarehouseClient, candidateId: string, decision: Decision, runId: string | null): Promise<AssignResult> {
  const { data, error } = await client.rpc("news_cluster_assign", {
    p_candidate_id: candidateId,
    p_decision: {
      cluster_id: decision.clusterId,
      method: decision.method,
      score: decision.score,
      confidence: decision.confidence,
      event_type: decision.eventType,
      entities: decision.entities,
      evidence: decision.evidence,
      run_id: runId,
      ambiguous: decision.ambiguous.map((a) => ({ cluster_id: a.clusterId, score: a.score, confidence: a.confidence, reason: a.reason, evidence: a.evidence })),
    } as never,
  });
  if (error) throw new Error(`news_cluster_assign failed: ${error.message}`);
  return data as unknown as AssignResult;
}

/**
 * Cluster recent unclustered candidates. Idempotent (a candidate that already has a membership
 * is never touched), deterministic (oldest first, ties by id), and bounded (each candidate is
 * compared only against its trigram/exact neighbours within 48h — never against everything).
 *
 * `dryRun` runs the exact same decision code but keeps assignments in memory, so later
 * candidates in the batch can "see" clusters the dry run proposes, and nothing is written.
 */
export async function runClustering(client: WarehouseClient, options: ClusterRunOptions = {}): Promise<ClusterRunReport> {
  const started = Date.now();
  const window = options.window ?? DEFAULT_CLUSTER_WINDOW;
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - parseWindowMs(window));
  const limit = Math.max(1, options.limit ?? DEFAULT_CLUSTER_LIMIT);

  const report: ClusterRunReport = {
    status: dryRun ? "dry-run" : "succeeded",
    dryRun,
    runId: null,
    window,
    sport: options.sport ?? null,
    considered: 0,
    clustersCreated: 0,
    membershipsCreated: 0,
    joinedExisting: 0,
    ambiguousCount: 0,
    durationMs: 0,
    errors: [],
    decisions: [],
  };

  const holder = randomUUID();
  if (!dryRun) {
    await client.rpc("news_reap_stale_clustering_runs", { p_stale_after: `${CLUSTER_STALE_RUN_MINUTES} minutes` });
    if (!(await tryAcquireLock(client, CLUSTER_LOCK_KEY, holder, CLUSTER_LOCK_TTL_MINUTES))) {
      report.status = "skipped-locked";
      report.durationMs = Date.now() - started;
      return report;
    }
  }

  try {
    if (!dryRun) {
      const { data, error } = await client
        .from("clustering_runs")
        .insert({ trigger: options.trigger ?? "manual", algorithm_version: ALGORITHM_VERSION, window_label: window, sport_filter: options.sport ?? null })
        .select("id")
        .single();
      if (error) throw new Error(`starting clustering run failed: ${error.message}`);
      report.runId = data.id;
    }

    const candidates = await loadUnclustered(client, since, options.sport, limit);
    report.considered = candidates.length;

    const featureCache = new Map<string, HeadlineFeatures>();
    const featuresOf = (headline: string) => {
      let features = featureCache.get(headline);
      if (!features) {
        features = extractFeatures(headline);
        featureCache.set(headline, features);
      }
      return features;
    };

    // Dry-run memory: candidate → proposed cluster key, and proposed clusters' time span/event type.
    const simMembership = new Map<string, string>();
    const simClusters = new Map<string, { first: Date; last: Date; eventType: string | null }>();
    let simCounter = 0;

    for (const candidate of candidates) {
      try {
        let neighbors = await fetchNeighbors(client, candidate.id, teamSearchRegex(featuresOf(candidate.headline).teams));
        if (dryRun) {
          neighbors = neighbors.map((n) => {
            const proposed = simMembership.get(n.candidateId);
            const clusterId = proposed ?? n.clusterId;
            const sim = clusterId ? simClusters.get(clusterId) : undefined;
            return {
              ...n,
              clusterId,
              clusterFirstFreshAt: sim ? (n.clusterFirstFreshAt && n.clusterFirstFreshAt < sim.first ? n.clusterFirstFreshAt : sim.first) : n.clusterFirstFreshAt,
              clusterLastFreshAt: sim ? (n.clusterLastFreshAt && n.clusterLastFreshAt > sim.last ? n.clusterLastFreshAt : sim.last) : n.clusterLastFreshAt,
              clusterEventType: n.clusterEventType ?? sim?.eventType ?? null,
            };
          });
        }
        const decision = decide(candidate, neighbors, featuresOf);

        let clusterId: string;
        let created: boolean;
        let ambiguousRecorded = decision.ambiguous.length;
        if (dryRun) {
          created = decision.action === "create";
          clusterId = decision.clusterId ?? `new-${++simCounter}`;
          simMembership.set(candidate.id, clusterId);
          const fresh = freshAtOf(candidate);
          const span = simClusters.get(clusterId);
          simClusters.set(clusterId, {
            first: span && span.first < fresh ? span.first : fresh,
            last: span && span.last > fresh ? span.last : fresh,
            eventType: span?.eventType ?? decision.eventType,
          });
        } else {
          const result = await assign(client, candidate.id, decision, report.runId);
          if (result.status === "already-clustered") continue; // a concurrent worker got there first
          clusterId = result.cluster_id;
          created = result.created_cluster;
          ambiguousRecorded = result.ambiguous_recorded ?? 0;
        }

        report.membershipsCreated += 1;
        if (created) report.clustersCreated += 1;
        else report.joinedExisting += 1;
        report.ambiguousCount += ambiguousRecorded;
        report.decisions.push({
          candidateId: candidate.id,
          headline: candidate.headline,
          source: candidate.sourceDomain,
          sport: candidate.sport,
          action: created ? "create" : "join",
          method: created ? "seed" : decision.method,
          confidence: decision.confidence,
          score: decision.score,
          clusterId,
          createdCluster: created,
          eventType: decision.eventType,
          neighborsConsidered: decision.neighborsConsidered,
          ambiguous: decision.ambiguous,
          evidence: decision.evidence,
        });
      } catch (error) {
        report.errors.push(`${candidate.id}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300));
      }
    }

    if (!dryRun) {
      const { error } = await client.rpc("story_cluster_age_out");
      if (error) report.errors.push(`age-out failed: ${error.message}`);
    }
    if (report.errors.length > 0 && !dryRun) report.status = "failed";
  } catch (error) {
    report.status = dryRun ? "dry-run" : "failed";
    report.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    report.durationMs = Date.now() - started;
    if (!dryRun) {
      if (report.runId) {
        await client
          .from("clustering_runs")
          .update({
            status: report.status === "failed" ? "failed" : "succeeded",
            finished_at: new Date().toISOString(),
            candidates_considered: report.considered,
            clusters_created: report.clustersCreated,
            memberships_created: report.membershipsCreated,
            joined_existing: report.joinedExisting,
            ambiguous_count: report.ambiguousCount,
            error_message: report.errors.length ? report.errors.slice(0, 5).join(" | ").slice(0, 1000) : null,
          })
          .eq("id", report.runId);
      }
      await releaseLock(client, CLUSTER_LOCK_KEY, holder).catch(() => undefined);
    }
  }
  return report;
}
