import { randomUUID } from "node:crypto";
import type { WarehouseClient } from "../warehouse/client";
import { releaseLock, tryAcquireLock } from "../warehouse/engine-db";
import { parseWindowMs } from "../clustering/run";
import { ALGORITHM_VERSION } from "./config";
import { loadClusterInputs, loadEditorialState } from "./data";
import { rankClusters } from "./score";
import type { EditorialStatus, RankedCluster } from "./types";

export const RANK_LOCK_KEY = "rank:run";
export const RANK_LOCK_TTL_MINUTES = 10;
export const RANK_STALE_RUN_MINUTES = 30;
export const DEFAULT_RANK_WINDOW = "24h";
const UPSERT_CHUNK = 100;

export interface RankRunOptions {
  window?: string;
  sport?: string;
  /** Compute and report; write nothing (no items, no run row, no lock). */
  dryRun?: boolean;
  trigger?: "manual" | "scheduled" | "test";
  now?: Date;
}

export interface RankRunReport {
  status: "succeeded" | "failed" | "skipped-locked" | "dry-run";
  dryRun: boolean;
  runId: string | null;
  window: string;
  sport: string | null;
  considered: number;
  eligible: number;
  review: number;
  held: number;
  itemsCreated: number;
  itemsUpdated: number;
  durationMs: number;
  errors: string[];
  ranked: RankedCluster[];
}

/** The persisted shape of one ranked cluster (see editorial_upsert_items). */
export function toItemPayload(ranked: RankedCluster, existingStatus: EditorialStatus | undefined) {
  const { input } = ranked;
  return {
    cluster_id: ranked.clusterId,
    initial_status: existingStatus ?? (ranked.eligibility.state === "review" ? "review" : "candidate"),
    headline: ranked.headline,
    sport: input.sport,
    league: input.league,
    event_type: input.eventType,
    urgency: ranked.urgency,
    editorial_score: ranked.finalScore,
    editorial_priority: ranked.priority,
    rank_position: ranked.position,
    section: ranked.desk,
    section_eligibility: { lead: ranked.sectionEligibility.lead, wire: ranked.sectionEligibility.wire, now: ranked.sectionEligibility.now, desk: ranked.sectionEligibility.desk, notes: ranked.sectionEligibility.notes },
    eligibility: ranked.eligibility.state,
    eligibility_reasons: ranked.eligibility.reasons,
    score_parts: ranked.scoreParts,
    active_overrides: ranked.overrides.map((o) => ({ id: o.id, kind: o.kind, amount: o.amount, text: o.text, reason: o.reason })),
    representative_candidate_id: input.representativeCandidateId,
    cluster_confidence: input.confidence,
    candidate_count: input.candidateCount,
    source_count: ranked.metrics.domains,
    provider_count: input.providerCount,
    entities: input.entities,
    first_seen_at: input.firstSeenAt.toISOString(),
    last_seen_at: input.lastSeenAt.toISOString(),
    first_published_at: input.firstPublishedAt?.toISOString() ?? null,
    last_published_at: input.lastPublishedAt?.toISOString() ?? null,
    algorithm_version: ALGORITHM_VERSION,
  };
}

/**
 * Rank recent story clusters and persist one editorial item per cluster.
 *
 * Idempotent: `editorial_items.cluster_id` is UNIQUE and the write is an upsert, so re-running
 * with unchanged inputs updates scores and creates nothing new (each run adds only an audit
 * row). Derived data — a failure here is recorded in `editorial_ranking_runs` and never touches
 * ingestion or clustering.
 */
export async function runEditorialRanking(client: WarehouseClient, options: RankRunOptions = {}): Promise<RankRunReport> {
  const started = Date.now();
  const window = options.window ?? DEFAULT_RANK_WINDOW;
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - parseWindowMs(window));

  const report: RankRunReport = {
    status: dryRun ? "dry-run" : "succeeded",
    dryRun,
    runId: null,
    window,
    sport: options.sport ?? null,
    considered: 0,
    eligible: 0,
    review: 0,
    held: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    durationMs: 0,
    errors: [],
    ranked: [],
  };

  const holder = randomUUID();
  if (!dryRun) {
    await client.rpc("news_reap_stale_ranking_runs", { p_stale_after: `${RANK_STALE_RUN_MINUTES} minutes` });
    if (!(await tryAcquireLock(client, RANK_LOCK_KEY, holder, RANK_LOCK_TTL_MINUTES))) {
      report.status = "skipped-locked";
      report.durationMs = Date.now() - started;
      return report;
    }
  }

  try {
    if (!dryRun) {
      const { data, error } = await client
        .from("editorial_ranking_runs")
        .insert({ trigger: options.trigger ?? "manual", algorithm_version: ALGORITHM_VERSION, window_label: window, sport_filter: options.sport ?? null })
        .select("id")
        .single();
      if (error) throw new Error(`starting ranking run failed: ${error.message}`);
      report.runId = data.id;
    }

    const inputs = await loadClusterInputs(client, { since, sport: options.sport });
    const state = await loadEditorialState(client);
    const ranked = rankClusters(inputs, { now, overridesByCluster: state.overridesByCluster, statusByCluster: state.statusByCluster });
    report.ranked = ranked;
    report.considered = ranked.length;
    report.eligible = ranked.filter((r) => r.eligibility.state === "eligible").length;
    report.review = ranked.filter((r) => r.eligibility.state === "review").length;
    report.held = ranked.filter((r) => r.eligibility.state === "ineligible").length;

    if (!dryRun) {
      for (let i = 0; i < ranked.length; i += UPSERT_CHUNK) {
        const chunk = ranked.slice(i, i + UPSERT_CHUNK).map((r) => toItemPayload(r, state.statusByCluster.get(r.clusterId)));
        const { data, error } = await client.rpc("editorial_upsert_items", { p_run_id: report.runId!, p_items: chunk as never });
        if (error) throw new Error(`editorial_upsert_items failed: ${error.message}`);
        const counts = data as { created: number; updated: number };
        report.itemsCreated += counts.created;
        report.itemsUpdated += counts.updated;
      }
      const { error } = await client.rpc("editorial_finish_rank", { p_run_id: report.runId! });
      if (error) throw new Error(`editorial_finish_rank failed: ${error.message}`);
    }
  } catch (error) {
    report.status = dryRun ? "dry-run" : "failed";
    report.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    report.durationMs = Date.now() - started;
    if (!dryRun) {
      if (report.runId) {
        await client
          .from("editorial_ranking_runs")
          .update({
            status: report.status === "failed" ? "failed" : "succeeded",
            finished_at: new Date().toISOString(),
            clusters_considered: report.considered,
            eligible_count: report.eligible,
            review_count: report.review,
            held_count: report.held,
            items_created: report.itemsCreated,
            items_updated: report.itemsUpdated,
            error_message: report.errors.length ? report.errors[0].slice(0, 1000) : null,
            metadata: report.ranked[0] ? { top: { cluster_id: report.ranked[0].clusterId, score: report.ranked[0].finalScore } } : {},
          })
          .eq("id", report.runId);
      }
      await releaseLock(client, RANK_LOCK_KEY, holder).catch(() => undefined);
    }
  }
  return report;
}
