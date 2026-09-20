import { randomUUID } from "node:crypto";
import { getProviderPolicy } from "../policy/registry";
import { getCandidateProviderById } from "../providers";
import type { CandidateProvider } from "../providers/types";
import type { WarehouseClient } from "../warehouse/client";
import { getLastAttemptAt, getProviderRow, releaseLock, reapStaleRuns, tryAcquireLock } from "../warehouse/engine-db";
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

export interface TickResult {
  trigger: TickTrigger;
  startedAt: string;
  finishedAt: string;
  reaped: { count: number; runIds: string[] };
  results: ProviderTickResult[];
  /** False only when a provider run failed outright or the tick itself errored. Skips are not failures. */
  ok: boolean;
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

  return {
    trigger,
    startedAt: startedAt.toISOString(),
    finishedAt: deps.now().toISOString(),
    reaped: { count: reaped.reaped, runIds: reaped.runIds },
    results,
    ok: results.every((result) => result.outcome !== "error" && !(result.run && result.run.status === "failed")),
  };
}
