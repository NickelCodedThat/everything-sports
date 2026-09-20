import { collectClusteringHealth } from "../clustering/health";
import type { WarehouseClient } from "../warehouse/client";
import { getSchedulerStatus } from "../warehouse/engine-db";
import { assessSchedulability, ENGINE_PROVIDERS, STALE_RUN_AFTER_MINUTES, type EngineProviderConfig } from "./config";
import {
  evaluateProviderHealth,
  overallState,
  stuckRunAlerts,
  type NewsroomHealth,
  type RunSample,
  type StuckRun,
} from "./health";

const RUN_HISTORY_PER_PROVIDER = 30;

export interface CollectHealthOptions {
  now?: Date;
  configs?: EngineProviderConfig[];
  env?: Record<string, string | undefined>;
  /** Also ask Postgres whether Supabase Cron / Vault are wired up. Off by default (plain Postgres has neither). */
  includeScheduler?: boolean;
  staleRunAfterMinutes?: number;
}

/**
 * Reads run history for every engine provider and evaluates health. Excludes
 * `test`-trigger runs so integration tests and dev experiments cannot make a
 * provider look healthy (or sick).
 */
export async function collectNewsroomHealth(client: WarehouseClient, options: CollectHealthOptions = {}): Promise<NewsroomHealth> {
  const now = options.now ?? new Date();
  const configs = options.configs ?? ENGINE_PROVIDERS;
  const env = options.env ?? process.env;
  const staleAfter = options.staleRunAfterMinutes ?? STALE_RUN_AFTER_MINUTES;

  const { data: providerRows, error: providerError } = await client.from("news_providers").select("id, provider_key, status");
  if (providerError) throw new Error(`health: reading providers failed: ${providerError.message}`);
  const rowByKey = new Map(providerRows.map((row) => [row.provider_key, row]));
  const keyById = new Map(providerRows.map((row) => [row.id, row.provider_key]));

  const { data: runRows, error: runError } = await client
    .from("ingestion_runs")
    .select("*")
    .neq("trigger", "test")
    .order("started_at", { ascending: false })
    .limit(Math.max(200, configs.length * RUN_HISTORY_PER_PROVIDER));
  if (runError) throw new Error(`health: reading runs failed: ${runError.message}`);

  const runsByProvider = new Map<string, RunSample[]>();
  const stuckRuns: StuckRun[] = [];
  for (const row of runRows) {
    const providerKey = keyById.get(row.provider_id);
    if (!providerKey) continue;
    const sample: RunSample = {
      id: row.id,
      status: row.status as RunSample["status"],
      providerState: row.provider_state as RunSample["providerState"],
      trigger: row.trigger as RunSample["trigger"],
      startedAt: new Date(row.started_at),
      finishedAt: row.finished_at ? new Date(row.finished_at) : null,
      recordsReturned: row.records_returned,
      recordsAccepted: row.records_accepted,
      recordsRejected: row.records_rejected,
      recordsInserted: row.records_inserted,
      unitsProcessed: row.units_processed,
      unitsSkipped: row.units_skipped,
      errorMessage: row.error_message,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    };
    const list = runsByProvider.get(providerKey) ?? [];
    if (list.length < RUN_HISTORY_PER_PROVIDER) list.push(sample);
    runsByProvider.set(providerKey, list);

    if (sample.status === "running") {
      const minutesRunning = Math.floor((now.getTime() - sample.startedAt.getTime()) / 60_000);
      if (minutesRunning >= staleAfter) stuckRuns.push({ runId: sample.id, providerId: providerKey, startedAt: sample.startedAt, minutesRunning });
    }
  }

  const { data: unitRows, error: unitError } = await client
    .from("news_ingestion_units")
    .select("provider_id, unit_key")
    .order("unit_key", { ascending: false })
    .limit(200);
  if (unitError) throw new Error(`health: reading units failed: ${unitError.message}`);
  const latestUnitByProvider = new Map<string, string>();
  for (const row of unitRows) {
    const providerKey = keyById.get(row.provider_id);
    if (providerKey && !latestUnitByProvider.has(providerKey)) latestUnitByProvider.set(providerKey, row.unit_key);
  }

  const providers = configs
    .filter((config) => config.scheduleClass !== "manual-only")
    .map((config) =>
      evaluateProviderHealth({
        config,
        schedulability: assessSchedulability(config, env),
        dbStatus: (rowByKey.get(config.providerId)?.status as "active" | "degraded" | "disabled" | undefined) ?? null,
        runs: runsByProvider.get(config.providerId) ?? [],
        latestUnitKey: latestUnitByProvider.get(config.providerId) ?? null,
        now,
      }),
    );

  // Clustering is derived data: if its tables cannot be read, ingestion health must still be reported.
  const clustering = await collectClusteringHealth(client, now).catch(() => null);

  const scheduler = options.includeScheduler ? await getSchedulerStatus(client).catch(() => null) : null;

  return {
    generatedAt: now,
    overall: overallState(providers),
    providers,
    stuckRuns,
    scheduler,
    clustering,
    alerts: [
      ...providers.flatMap((provider) => provider.alerts),
      ...stuckRunAlerts(stuckRuns),
      ...(clustering?.alerts.map((alert) => ({ ...alert, providerId: null })) ?? []),
    ],
  };
}
