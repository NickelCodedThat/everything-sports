import { randomUUID } from "node:crypto";
import { getProviderPolicy } from "../policy/registry";
import { getCandidateProviderById } from "../providers";
import type { CandidateProvider } from "../providers/types";
import type { WarehouseClient } from "../warehouse/client";
import { getLastAttemptAt, getProviderRow, releaseLock, reapStaleRuns, tryAcquireLock } from "../warehouse/engine-db";
import { runClustering, type ClusterRunReport } from "../clustering/run";
import { runEditorialRanking, type RankRunReport } from "../editorial-ranking/run";
import { runWarehouseIngestion, type WarehouseRunReport } from "../warehouse/ingest";
import { assessSchedulability, ENGINE_PROVIDERS, STALE_RUN_AFTER_MINUTES, type EngineProviderConfig } from "./config";

/**
 * THE orchestration path. The HTTP worker (called by Supabase Cron) and the
 * `pnpm news:worker` CLI both call `runScheduledTick` — there is no second
 * ingestion implementation. `pnpm news:ingest` (manual, one provider, no
 * gating) keeps calling `runWarehouseIngestion` directly.
 *
 * Gate order for each provider, all before any network call:
 *   policy approved → engine config (enabled / env / not manual-only)
 *   → database switch (news_providers.status ≠ disabled) → due (min interval)
 *   → overlap lease lock → ingest.
 * A skipped provider is a normal, reported outcome — never an error and never a run row.
 */
export type TickTrigger = "scheduled" | "manual" | "test";

export type TickOutcome =
  | "ran"
  | "skipped-not-approved"
  | "skipped-not-scheduled"
  | "skipped-disabled"
  | "skipped-not-due"
  | "skipped-locked"
  | "error";

export interface RunSummary {
  runId: string;
  status: string;
  providerState: string;
  returned: number;
  accepted: number;
  rejected: number;
  inserted: number;
  duplicateUrl: number;
  duplicateHeadline: number;
  observations: number;
  sourcesCreated: number;
  unitsProcessed: number;
  unitsSkipped: number;
  durationMs: number;
  notes: string[];
}

export interface ProviderTickResult {
  providerId: string;
  outcome: TickOutcome;
  detail?: string;
  run?: RunSummary;
}

/**
 * The clustering stage runs AFTER ingestion, in its own try/catch and its own audit table
 * (clustering_runs). A clustering failure is reported here and never touches `TickResult.ok`,
 * never rolls back or marks failed a successful ingestion run.
 */
export interface ClusteringStageSummary {
  outcome: "ran" | "skipped-locked" | "failed" | "error";
  detail?: string;
  runId: string | null;
  considered: number;
  clustersCreated: number;
  membershipsCreated: number;
  ambiguousCount: number;
  durationMs: number;
}

/**
 * The ranking stage runs after SUCCESSFUL clustering, in its own try/catch and its own audit
 * table (editorial_ranking_runs). A ranking failure is reported here and never changes
 * `TickResult.ok`, an ingestion run, or clustering results.
 */
export interface RankingStageSummary {
  outcome: "ran" | "skipped-locked" | "failed" | "error";
  detail?: string;
  runId: string | null;
  considered: number;
  eligible: number;
  held: number;
  itemsCreated: number;
  itemsUpdated: number;
  durationMs: number;
}

export interface TickResult {
  trigger: TickTrigger;
  startedAt: string;
  finishedAt: string;
  reaped: { count: number; runIds: string[] };
  results: ProviderTickResult[];
  /** False only when a provider run failed outright or the tick itself errored. Skips are not failures. */
  ok: boolean;
  /** Null when the stage did not run (no provider ran this tick, or clustering is not wired in). */
  clustering: ClusteringStageSummary | null;
  /** Null when ranking did not run (clustering did not succeed, or ranking is not wired in). */
  ranking: RankingStageSummary | null;
}

export interface TickDeps {
  now(): Date;
  reapStaleRuns(staleAfterMinutes: number): Promise<{ reaped: number; runIds: string[] }>;
  /** news_providers.status for the provider, or null when it has no row yet. */
  getProviderStatus(providerId: string): Promise<string | null>;
  getLastAttemptAt(providerId: string): Promise<Date | null>;
  tryAcquireLock(lockKey: string, holder: string, ttlMinutes: number): Promise<boolean>;
  releaseLock(lockKey: string, holder: string): Promise<void>;
  resolveProvider(providerId: string): CandidateProvider | undefined;
  runIngestion(provider: CandidateProvider, params: { window: string; limit: number; trigger: TickTrigger }): Promise<WarehouseRunReport>;
  /** Optional: absent means the tick does no clustering. */
  runClustering?(params: { trigger: TickTrigger }): Promise<ClusterRunReport>;
  /** Optional: absent means the tick does no ranking. */
  runRanking?(params: { trigger: TickTrigger }): Promise<RankRunReport>;
}

export function createTickDeps(client: WarehouseClient, overrides: Partial<TickDeps> = {}): TickDeps {
  return {
    now: () => new Date(),
    reapStaleRuns: (minutes) => reapStaleRuns(client, minutes),
    getProviderStatus: async (providerId) => (await getProviderRow(client, providerId))?.status ?? null,
    getLastAttemptAt: (providerId) => getLastAttemptAt(client, providerId),
    tryAcquireLock: (key, holder, ttl) => tryAcquireLock(client, key, holder, ttl),
    releaseLock: async (key, holder) => {
      await releaseLock(client, key, holder);
    },
    resolveProvider: getCandidateProviderById,
    runIngestion: (provider, params) => runWarehouseIngestion(client, { provider, ...params }),
    runClustering: ({ trigger }) => runClustering(client, { trigger, window: "24h" }),
    runRanking: ({ trigger }) => runEditorialRanking(client, { trigger, window: "24h" }),
    ...overrides,
  };
}

export interface RunScheduledTickOptions {
  deps: TickDeps;
  /** Run only this provider; default is every schedulable provider in the config. */
  providerId?: string;
  trigger?: TickTrigger;
  /** Skip the min-interval "due" check (never skips policy, config, database switch or the lock). */
  force?: boolean;
  configs?: EngineProviderConfig[];
  env?: Record<string, string | undefined>;
}

export const lockKeyFor = (providerId: string) => `ingest:${providerId}`;

const trimNote = (note: string) => (note.length > 300 ? `${note.slice(0, 297)}...` : note);

function summarize(report: WarehouseRunReport): RunSummary {
  return {
    runId: report.run.id,
    status: report.run.status,
    providerState: report.providerState,
    returned: report.returned,
    accepted: report.accepted,
    rejected: report.rejected,
    inserted: report.totals.inserted,
    duplicateUrl: report.totals.existingUrl + report.totals.existingProviderItem,
    duplicateHeadline: report.totals.duplicateHeadline,
    observations: report.totals.observationsCreated,
    sourcesCreated: report.totals.sourcesCreated,
    unitsProcessed: report.unitsProcessed,
    unitsSkipped: report.unitsSkipped,
    durationMs: report.durationMs,
    notes: report.errors.map(trimNote),
  };
}

async function tickProvider(
  config: EngineProviderConfig,
  options: Required<Pick<RunScheduledTickOptions, "deps" | "force">> & { trigger: TickTrigger; env: Record<string, string | undefined> },
): Promise<ProviderTickResult> {
  const { deps, force, trigger, env } = options;
  const providerId = config.providerId;

  const policy = getProviderPolicy(providerId);
  if (!policy || policy.status !== "approved") {
    return { providerId, outcome: "skipped-not-approved", detail: `policy status is ${policy?.status ?? "missing"}` };
  }

  const schedulability = assessSchedulability(config, env);
  if (!schedulability.schedulable) {
    return { providerId, outcome: "skipped-not-scheduled", detail: `${schedulability.reason}: ${schedulability.detail}` };
  }

  // Database kill switch — checked before anything that touches the network.
  const dbStatus = await deps.getProviderStatus(providerId);
  if (dbStatus === "disabled") {
    return { providerId, outcome: "skipped-disabled", detail: "news_providers.status = disabled" };
  }

  const provider = deps.resolveProvider(providerId);
  if (!provider) return { providerId, outcome: "error", detail: "no provider implementation registered" };

  if (trigger === "scheduled" && !force) {
    const lastAttempt = await deps.getLastAttemptAt(providerId);
    if (lastAttempt) {
      const minutesAgo = (deps.now().getTime() - lastAttempt.getTime()) / 60_000;
      if (minutesAgo < config.minIntervalMinutes) {
        return {
          providerId,
          outcome: "skipped-not-due",
          detail: `last attempt ${Math.floor(minutesAgo)}m ago (min interval ${config.minIntervalMinutes}m)`,
        };
      }
    }
  }

  const holder = randomUUID();
  const lockKey = lockKeyFor(providerId);
  if (!(await deps.tryAcquireLock(lockKey, holder, config.lockTtlMinutes))) {
    return { providerId, outcome: "skipped-locked", detail: "already-running: another ingestion holds the lock" };
  }

  try {
    const report = await deps.runIngestion(provider, { window: config.window, limit: config.limit, trigger });
    return { providerId, outcome: "ran", run: summarize(report) };
  } catch (error) {
    return { providerId, outcome: "error", detail: trimNote(error instanceof Error ? error.message : String(error)) };
  } finally {
    // A failed release only means the lease expires on its own TTL; it must never mask the run result.
    await deps.releaseLock(lockKey, holder).catch(() => undefined);
  }
}

async function runClusteringStage(deps: TickDeps, trigger: TickTrigger): Promise<ClusteringStageSummary> {
  try {
    const report = await deps.runClustering!({ trigger });
    return {
      outcome: report.status === "skipped-locked" ? "skipped-locked" : report.status === "failed" ? "failed" : "ran",
      detail: report.errors.length ? trimNote(report.errors[0]) : undefined,
      runId: report.runId,
      considered: report.considered,
      clustersCreated: report.clustersCreated,
      membershipsCreated: report.membershipsCreated,
      ambiguousCount: report.ambiguousCount,
      durationMs: report.durationMs,
    };
  } catch (error) {
    return {
      outcome: "error",
      detail: trimNote(error instanceof Error ? error.message : String(error)),
      runId: null,
      considered: 0,
      clustersCreated: 0,
      membershipsCreated: 0,
      ambiguousCount: 0,
      durationMs: 0,
    };
  }
}

async function runRankingStage(deps: TickDeps, trigger: TickTrigger): Promise<RankingStageSummary> {
  try {
    const report = await deps.runRanking!({ trigger });
    return {
      outcome: report.status === "skipped-locked" ? "skipped-locked" : report.status === "failed" ? "failed" : "ran",
      detail: report.errors.length ? trimNote(report.errors[0]) : undefined,
      runId: report.runId,
      considered: report.considered,
      eligible: report.eligible + report.review,
      held: report.held,
      itemsCreated: report.itemsCreated,
      itemsUpdated: report.itemsUpdated,
      durationMs: report.durationMs,
    };
  } catch (error) {
    return { outcome: "error", detail: trimNote(error instanceof Error ? error.message : String(error)), runId: null, considered: 0, eligible: 0, held: 0, itemsCreated: 0, itemsUpdated: 0, durationMs: 0 };
  }
}

export async function runScheduledTick(options: RunScheduledTickOptions): Promise<TickResult> {
  const { deps } = options;
  const trigger = options.trigger ?? "scheduled";
  const configs = options.configs ?? ENGINE_PROVIDERS;
  const env = options.env ?? process.env;
  const startedAt = deps.now();

  // Recovery first, so a crashed earlier run is closed before this tick's health/lock decisions.
  const reaped = await deps.reapStaleRuns(STALE_RUN_AFTER_MINUTES);

  const targets = options.providerId
    ? configs.filter((config) => config.providerId === options.providerId)
    : configs.filter((config) => config.scheduleClass !== "manual-only");

  const results: ProviderTickResult[] = [];
  if (options.providerId && targets.length === 0) {
    results.push({ providerId: options.providerId, outcome: "skipped-not-scheduled", detail: "no engine configuration for this provider" });
  }
  for (const config of targets) {
    results.push(await tickProvider(config, { deps, force: options.force ?? false, trigger, env }));
  }

  // Clustering is a separate stage with its own failure boundary; it only follows ingestion that ran.
  const ok = results.every((result) => result.outcome !== "error" && !(result.run && result.run.status === "failed"));
  const anyIngested = results.some((result) => result.outcome === "ran" && result.run?.status !== "failed");
  const clustering = anyIngested && deps.runClustering ? await runClusteringStage(deps, trigger) : null;
  // Ranking only follows clustering that actually ran; each stage has its own failure boundary.
  const ranking = clustering?.outcome === "ran" && deps.runRanking ? await runRankingStage(deps, trigger) : null;

  return {
    trigger,
    startedAt: startedAt.toISOString(),
    finishedAt: deps.now().toISOString(),
    reaped: { count: reaped.reaped, runIds: reaped.runIds },
    results,
    ok,
    clustering,
    ranking,
  };
}
