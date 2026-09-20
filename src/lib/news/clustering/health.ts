import type { WarehouseClient } from "../warehouse/client";

export interface ClusteringHealth {
  lastSuccessAt: Date | null;
  lastRun: { status: string; startedAt: Date; error: string | null } | null;
  /** Failed clustering runs in the last 24h. */
  failuresLast24h: number;
  /** Candidates fresher than 24h that belong to no cluster. */
  unclusteredRecent: number;
  /** Near-miss candidates awaiting review. */
  ambiguousOpen: number;
  liveClusters: number;
  alerts: { code: "clustering-failed" | "clustering-stale"; severity: "warning"; message: string }[];
}

/** After a successful ingestion, unclustered work older than this means clustering is not keeping up. */
export const CLUSTERING_STALE_AFTER_MINUTES = 60;

/**
 * Minimal clustering health: last successful run, unclustered recent candidates, near-miss
 * count, failures. Clustering alerts are warnings only — clustering is derived data, and a
 * failure there never means ingestion is unhealthy.
 */
export async function collectClusteringHealth(client: WarehouseClient, now: Date = new Date()): Promise<ClusteringHealth> {
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();

  const [success, latest, failures, unclustered, ambiguous, live] = await Promise.all([
    client.from("clustering_runs").select("started_at, finished_at").neq("trigger", "test").eq("status", "succeeded").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("clustering_runs").select("status, started_at, error_message").neq("trigger", "test").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("clustering_runs").select("id", { count: "exact", head: true }).neq("trigger", "test").eq("status", "failed").gte("started_at", dayAgo),
    client.from("news_unclustered_candidates").select("candidate_id", { count: "exact", head: true }).gte("fresh_at", dayAgo),
    client.from("story_cluster_review_queue").select("ambiguity_id", { count: "exact", head: true }),
    client.from("story_cluster_feed").select("cluster_id", { count: "exact", head: true }),
  ]);
  for (const result of [success, latest, failures, unclustered, ambiguous, live]) {
    if (result.error) throw new Error(`clustering health failed: ${result.error.message}`);
  }

  const lastSuccessAt = success.data ? new Date(success.data.finished_at ?? success.data.started_at) : null;
  const health: ClusteringHealth = {
    lastSuccessAt,
    lastRun: latest.data ? { status: latest.data.status, startedAt: new Date(latest.data.started_at), error: latest.data.error_message } : null,
    failuresLast24h: failures.count ?? 0,
    unclusteredRecent: unclustered.count ?? 0,
    ambiguousOpen: ambiguous.count ?? 0,
    liveClusters: live.count ?? 0,
    alerts: [],
  };

  if (health.lastRun?.status === "failed") {
    health.alerts.push({ code: "clustering-failed", severity: "warning", message: `latest clustering run failed: ${(health.lastRun.error ?? "no message").slice(0, 160)}` });
  }
  if (health.unclusteredRecent > 0) {
    const minutesSince = lastSuccessAt ? (now.getTime() - lastSuccessAt.getTime()) / 60_000 : Infinity;
    if (minutesSince >= CLUSTERING_STALE_AFTER_MINUTES) {
      health.alerts.push({
        code: "clustering-stale",
        severity: "warning",
        message: `${health.unclusteredRecent} recent candidates are unclustered and the last successful run was ${Number.isFinite(minutesSince) ? `${Math.floor(minutesSince)}m ago` : "never"}`,
      });
    }
  }
  return health;
}
