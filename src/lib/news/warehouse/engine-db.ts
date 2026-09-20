import type { SchedulerStatus } from "../engine/health";
import type { WarehouseClient } from "./client";
import type { WarehouseProviderRow } from "./types";

/** Closes runs stuck in 'running' as failed/stale-run-reaped. Never deletes. */
export async function reapStaleRuns(client: WarehouseClient, staleAfterMinutes: number): Promise<{ reaped: number; runIds: string[] }> {
  const { data, error } = await client.rpc("news_reap_stale_runs", { p_stale_after: `${staleAfterMinutes} minutes` });
  if (error) throw new Error(`news_reap_stale_runs failed: ${error.message}`);
  const result = (data ?? {}) as { reaped?: number; run_ids?: string[] };
  return { reaped: result.reaped ?? 0, runIds: result.run_ids ?? [] };
}

/** Lease lock: true when the caller now holds `lockKey` for `ttlMinutes`. Expired leases are taken over. */
export async function tryAcquireLock(client: WarehouseClient, lockKey: string, holder: string, ttlMinutes: number): Promise<boolean> {
  const { data, error } = await client.rpc("newsroom_try_acquire_lock", {
    p_lock_key: lockKey,
    p_holder: holder,
    p_ttl: `${ttlMinutes} minutes`,
  });
  if (error) throw new Error(`newsroom_try_acquire_lock failed: ${error.message}`);
  return data === true;
}

export async function releaseLock(client: WarehouseClient, lockKey: string, holder: string): Promise<boolean> {
  const { data, error } = await client.rpc("newsroom_release_lock", { p_lock_key: lockKey, p_holder: holder });
  if (error) throw new Error(`newsroom_release_lock failed: ${error.message}`);
  return data === true;
}

export async function getProviderRow(client: WarehouseClient, providerKey: string): Promise<WarehouseProviderRow | null> {
  const { data, error } = await client.from("news_providers").select("*").eq("provider_key", providerKey).maybeSingle();
  if (error) throw new Error(`getProviderRow(${providerKey}) failed: ${error.message}`);
  return data;
}

/** Start time of the provider's newest non-test run, or null if it has never run. */
export async function getLastAttemptAt(client: WarehouseClient, providerKey: string): Promise<Date | null> {
  const provider = await getProviderRow(client, providerKey);
  if (!provider) return null;
  const { data, error } = await client
    .from("ingestion_runs")
    .select("started_at")
    .eq("provider_id", provider.id)
    .neq("trigger", "test")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLastAttemptAt(${providerKey}) failed: ${error.message}`);
  return data ? new Date(data.started_at) : null;
}

/** Whether cron/pg_net/Vault are wired up, plus job names. Booleans only — never a URL or secret. */
export async function getSchedulerStatus(client: WarehouseClient): Promise<SchedulerStatus> {
  const { data, error } = await client.rpc("newsroom_scheduler_status");
  if (error) throw new Error(`newsroom_scheduler_status failed: ${error.message}`);
  const raw = (data ?? {}) as {
    pg_cron_installed?: boolean;
    pg_net_installed?: boolean;
    worker_configured?: boolean;
    jobs?: { name: string; schedule: string; active: boolean }[];
  };
  return {
    pgCronInstalled: raw.pg_cron_installed === true,
    pgNetInstalled: raw.pg_net_installed === true,
    workerConfigured: raw.worker_configured === true,
    jobs: raw.jobs ?? [],
  };
}
