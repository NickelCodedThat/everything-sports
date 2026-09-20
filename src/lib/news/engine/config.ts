import { getProviderPolicy } from "../policy/registry";

/**
 * Operational configuration for the automated newsroom engine — the one place
 * scheduling behavior lives. It can only further *restrict* what the system
 * does; it never overrides the other two gates:
 *
 *   1. provider policy registry  (src/lib/news/policy/registry.ts)  — legally/product approved?
 *   2. database switch           (news_providers.status = 'disabled') — operator kill switch
 *   3. this config               (enabled / required env)             — engineering intent
 *
 * A provider must pass all three before the worker makes a network call.
 */
export type ScheduleClass = "every-15-minutes" | "hourly" | "every-6-hours" | "manual-only";

export interface EngineProviderConfig {
  providerId: string;
  /** Turned off in code. Cannot enable a provider the policy registry or the database has switched off. */
  enabled: boolean;
  /** Environment variable that must be set for the provider to be schedulable (API-key providers). */
  requiresEnv?: string;
  scheduleClass: ScheduleClass;
  /**
   * Cron expression the migration installs (documentation + test parity; the
   * schedule itself lives in supabase/migrations/*_newsroom_schedule.sql).
   */
  cron?: string;
  /** Lookback handed to the provider (GKG: how many recent 15-minute files to consider). */
  window: string;
  /** Per-sport cap for query-style providers; ignored by providers with immutable units. */
  limit: number;
  /** A scheduled invocation is skipped when the previous attempt started more recently than this. */
  minIntervalMinutes: number;
  /** No successful ingestion for this long → the provider is `stale`. */
  staleAfterMinutes: number;
  /** This many consecutive failed runs → the provider is `down`. */
  downAfterConsecutiveFailures: number;
  /** This many consecutive empty results → `degraded`. Undefined = empty results are never a problem. */
  degradedAfterEmptyRuns?: number;
  /** Overlap-lock lease. Long enough for a full run, short enough to self-heal after a crash. */
  lockTtlMinutes: number;
  /** GKG only: publication grace and lag thresholds, in 15-minute files. */
  gkg?: { graceMinutes: number; degradedLagFiles: number; staleLagFiles: number };
  notes: string;
}

/** A run still 'running' after this long is presumed dead and reaped (SQL reaper + worker preflight). */
export const STALE_RUN_AFTER_MINUTES = 30;

export const ENGINE_PROVIDERS: EngineProviderConfig[] = [
  {
    providerId: "gdelt-gkg",
    enabled: true,
    scheduleClass: "every-15-minutes",
    cron: "2-59/15 * * * *",
    // 3 hours = the 12 most recent 15-minute files: a ~2.5h worker outage self-heals on the next tick
    // (stored files are skipped without download, so the overlap is free).
    window: "3h",
    limit: 25,
    minIntervalMinutes: 10,
    staleAfterMinutes: 45,
    downAfterConsecutiveFailures: 3,
    lockTtlMinutes: 20,
    gkg: { graceMinutes: 10, degradedLagFiles: 2, staleLagFiles: 4 },
    notes: "Immutable 15-minute files; baseline automated source.",
  },
  {
    providerId: "wikipedia-events",
    enabled: true,
    scheduleClass: "hourly",
    cron: "7 * * * *",
    window: "1d",
    limit: 25,
    minIntervalMinutes: 50,
    staleAfterMinutes: 180,
    downAfterConsecutiveFailures: 3,
    // Day-curated and low volume: a quiet stretch is normal, but a full day of nothing is worth a look.
    degradedAfterEmptyRuns: 24,
    lockTtlMinutes: 10,
    notes: "Editor-curated daily pages; hourly respects Wikimedia etiquette and its low volume.",
  },
  {
    providerId: "newsdata",
    // Only schedulable once a key exists — no key means no runs and no noise, not a failing provider.
    enabled: true,
    requiresEnv: "NEWSDATA_API_KEY",
    scheduleClass: "every-6-hours",
    cron: "23 */6 * * *",
    window: "1d",
    limit: 10,
    minIntervalMinutes: 300,
    staleAfterMinutes: 900,
    downAfterConsecutiveFailures: 3,
    lockTtlMinutes: 10,
    notes: "Free tier is ~12h delayed, so polling faster than every few hours gains nothing.",
  },
  {
    providerId: "gdelt",
    enabled: false,
    scheduleClass: "manual-only",
    window: "3h",
    limit: 25,
    minIntervalMinutes: 60,
    staleAfterMinutes: 24 * 60,
    downAfterConsecutiveFailures: 3,
    lockTtlMinutes: 10,
    notes: "DOC API is throttled (HTTP 429). Manual/opportunistic queries only, behind its cooldown — never scheduled.",
  },
];

export function getEngineConfig(providerId: string, configs: EngineProviderConfig[] = ENGINE_PROVIDERS): EngineProviderConfig | undefined {
  return configs.find((config) => config.providerId === providerId);
}

export type Schedulability =
  | { schedulable: true }
  | { schedulable: false; reason: "manual-only" | "disabled-by-config" | "missing-env" | "not-approved"; detail: string };

/** Config + policy gates (the database switch is checked separately, at run time). */
export function assessSchedulability(
  config: EngineProviderConfig,
  env: Record<string, string | undefined> = process.env,
): Schedulability {
  const policy = getProviderPolicy(config.providerId);
  if (!policy || policy.status !== "approved") {
    return { schedulable: false, reason: "not-approved", detail: `policy status is ${policy?.status ?? "missing"}` };
  }
  if (config.scheduleClass === "manual-only") {
    return { schedulable: false, reason: "manual-only", detail: "never scheduled; manual/opportunistic use only" };
  }
  if (!config.enabled) {
    return { schedulable: false, reason: "disabled-by-config", detail: "disabled in engine config" };
  }
  if (config.requiresEnv && !env[config.requiresEnv]?.trim()) {
    return { schedulable: false, reason: "missing-env", detail: `${config.requiresEnv} is not set` };
  }
  return { schedulable: true };
}
