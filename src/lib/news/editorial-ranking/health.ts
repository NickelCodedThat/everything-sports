import type { WarehouseClient } from "../warehouse/client";

export interface EditorialHealth {
  lastSuccessAt: Date | null;
  /** Minutes since the last successful ranking run finished. */
  lastSuccessAgeMinutes: number | null;
  lastRun: { status: string; startedAt: Date; error: string | null } | null;
  failuresLast24h: number;
  /** Items ranked in the latest run that are eligible or awaiting review. */
  eligibleItems: number;
  /** Ineligible clusters plus items an editor is holding or has rejected. */
  heldItems: number;
  approvedItems: number;
  alerts: { code: "ranking-failed" | "ranking-stale"; severity: "warning"; message: string }[];
}

export const RANKING_STALE_AFTER_MINUTES = 60;

/**
 * Minimal editorial-ranking health. Ranking is derived data: its alerts are warnings only, and
 * an unhealthy ranker never makes ingestion or clustering look down.
 */
export async function collectEditorialHealth(client: WarehouseClient, now: Date = new Date()): Promise<EditorialHealth> {
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const [success, latest, failures, eligible, held, approved] = await Promise.all([
    client.from("editorial_ranking_runs").select("started_at, finished_at").neq("trigger", "test").eq("status", "succeeded").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("editorial_ranking_runs").select("status, started_at, error_message").neq("trigger", "test").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("editorial_ranking_runs").select("id", { count: "exact", head: true }).neq("trigger", "test").eq("status", "failed").gte("started_at", dayAgo),
    client.from("editorial_items").select("id", { count: "exact", head: true }).not("rank_position", "is", null).in("eligibility", ["eligible", "review"]),
    client.from("editorial_items").select("id", { count: "exact", head: true }).or("status.in.(held,rejected),eligibility.eq.ineligible"),
    client.from("editorial_items").select("id", { count: "exact", head: true }).eq("status", "approved"),
  ]);
  for (const result of [success, latest, failures, eligible, held, approved]) if (result.error) throw new Error(`editorial health failed: ${result.error.message}`);

  const lastSuccessAt = success.data ? new Date(success.data.finished_at ?? success.data.started_at) : null;
  const ageMinutes = lastSuccessAt ? Math.floor((now.getTime() - lastSuccessAt.getTime()) / 60_000) : null;
  const health: EditorialHealth = {
    lastSuccessAt,
    lastSuccessAgeMinutes: ageMinutes,
    lastRun: latest.data ? { status: latest.data.status, startedAt: new Date(latest.data.started_at), error: latest.data.error_message } : null,
    failuresLast24h: failures.count ?? 0,
    eligibleItems: eligible.count ?? 0,
    heldItems: held.count ?? 0,
    approvedItems: approved.count ?? 0,
    alerts: [],
  };
  if (health.lastRun?.status === "failed") health.alerts.push({ code: "ranking-failed", severity: "warning", message: `latest ranking run failed: ${(health.lastRun.error ?? "no message").slice(0, 160)}` });
  if (lastSuccessAt && ageMinutes !== null && ageMinutes >= RANKING_STALE_AFTER_MINUTES) {
    health.alerts.push({ code: "ranking-stale", severity: "warning", message: `last successful ranking run was ${ageMinutes}m ago` });
  }
  return health;
}
