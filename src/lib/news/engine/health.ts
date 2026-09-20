import type { EngineProviderConfig, Schedulability } from "./config";
import { computeGkgLag, stampFromUnitKey, type GkgLag } from "./gkg-lag";

/**
 * Deterministic provider-health evaluation. Pure functions over run history —
 * no I/O, no clock reads — so every rule is unit-testable. All counts come
 * straight from `ingestion_runs`; there is no parallel metrics store to drift.
 *
 * States (evaluated in this order, first match wins):
 *   disabled  the database switch is off, or config/policy makes it unschedulable
 *   unknown   schedulable but never run
 *   down      ≥ N consecutive failed runs (N = config.downAfterConsecutiveFailures)
 *   stale     no successful run within config.staleAfterMinutes, or (GKG) processed
 *             lag ≥ staleLagFiles
 *   degraded  still working but not clean: DB status 'degraded', latest run partial,
 *             any recent failure/throttle, too many consecutive empties, or (GKG) lag
 *             ≥ degradedLagFiles
 *   healthy   none of the above
 */
export type HealthState = "healthy" | "degraded" | "stale" | "down" | "disabled" | "unknown";
export type AlertSeverity = "info" | "warning" | "critical";

export type AlertCode =
  | "provider-down"
  | "provider-stale"
  | "provider-disabled"
  | "provider-never-run"
  | "consecutive-failures"
  | "consecutive-throttles"
  | "gkg-file-lag"
  | "stuck-run";

export interface Alert {
  code: AlertCode;
  severity: AlertSeverity;
  providerId: string | null;
  message: string;
}

export interface RunSample {
  id: string;
  status: "running" | "succeeded" | "partial" | "failed";
  providerState: "ok" | "empty" | "unavailable" | "throttled" | "error" | null;
  trigger: "manual" | "scheduled" | "test";
  startedAt: Date;
  finishedAt: Date | null;
  recordsReturned: number;
  recordsAccepted: number;
  recordsRejected: number;
  recordsInserted: number;
  unitsProcessed: number;
  unitsSkipped: number;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface ProviderHealthInput {
  config: EngineProviderConfig;
  schedulability: Schedulability;
  /** news_providers.status, or null when the provider has no row yet. */
  dbStatus: "active" | "degraded" | "disabled" | null;
  /** Newest first. `test`-trigger runs must already be excluded by the caller. */
  runs: RunSample[];
  /** Newest stored unit key for the provider (e.g. gdelt-gkg:20260920014500), if it has units. */
  latestUnitKey: string | null;
  now: Date;
  recentWindowMinutes?: number;
}

export interface ProviderHealth {
  providerId: string;
  state: HealthState;
  reasons: string[];
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  minutesSinceLastSuccess: number | null;
  consecutiveFailures: number;
  consecutiveThrottles: number;
  consecutiveEmpty: number;
  recent: { windowMinutes: number; runs: number; returned: number; accepted: number; rejected: number; inserted: number };
  latestError: { message: string; at: Date } | null;
  latestUnitKey: string | null;
  gkgLag: GkgLag | null;
  alerts: Alert[];
}

const minutesBetween = (later: Date, earlier: Date) => Math.floor((later.getTime() - earlier.getTime()) / 60_000);

/** Success = usable data path worked: the run finished (not failed) and the provider answered (ok/empty). */
export function isSuccessfulRun(run: RunSample): boolean {
  return (run.status === "succeeded" || run.status === "partial") && (run.providerState === "ok" || run.providerState === "empty");
}

/** Counts how many of the newest *finished* runs in a row satisfy `predicate`. Fresh `running` runs are skipped. */
function leadingStreak(runs: RunSample[], predicate: (run: RunSample) => boolean): number {
  let count = 0;
  for (const run of runs) {
    if (run.status === "running") continue;
    if (!predicate(run)) break;
    count += 1;
  }
  return count;
}

export function evaluateProviderHealth(input: ProviderHealthInput): ProviderHealth {
  const { config, runs, now } = input;
  const recentWindowMinutes = input.recentWindowMinutes ?? 60;

  const finished = runs.filter((run) => run.status !== "running");
  const lastSuccess = finished.find(isSuccessfulRun) ?? null;
  const lastAttempt = runs[0] ?? null;
  const lastSuccessAt = lastSuccess ? (lastSuccess.finishedAt ?? lastSuccess.startedAt) : null;

  const consecutiveFailures = leadingStreak(runs, (run) => run.status === "failed");
  const consecutiveThrottles = leadingStreak(runs, (run) => run.providerState === "throttled");
  const consecutiveEmpty = leadingStreak(runs, (run) => run.providerState === "empty");

  const recentCutoff = now.getTime() - recentWindowMinutes * 60_000;
  const recentRuns = runs.filter((run) => run.startedAt.getTime() >= recentCutoff);
  const recent = recentRuns.reduce(
    (acc, run) => ({
      ...acc,
      returned: acc.returned + run.recordsReturned,
      accepted: acc.accepted + run.recordsAccepted,
      rejected: acc.rejected + run.recordsRejected,
      inserted: acc.inserted + run.recordsInserted,
    }),
    { windowMinutes: recentWindowMinutes, runs: recentRuns.length, returned: 0, accepted: 0, rejected: 0, inserted: 0 },
  );

  const latestFailure = finished.find((run) => run.errorMessage);
  const latestError = latestFailure ? { message: latestFailure.errorMessage as string, at: latestFailure.finishedAt ?? latestFailure.startedAt } : null;

  // GKG file lag, from the newest stored unit and the newest available stamp recorded by the last run.
  let gkgLag: GkgLag | null = null;
  if (config.gkg) {
    const latestAvailable = runs
      .map((run) => run.metadata?.latest_available_unit)
      .find((value): value is string => typeof value === "string");
    gkgLag = computeGkgLag({
      now,
      graceMinutes: config.gkg.graceMinutes,
      latestAvailableStamp: stampFromUnitKey(latestAvailable ?? null),
      latestProcessedStamp: stampFromUnitKey(input.latestUnitKey),
    });
  }

  const minutesSinceLastSuccess = lastSuccessAt ? minutesBetween(now, lastSuccessAt) : null;
  const reasons: string[] = [];
  const alerts: Alert[] = [];
  const alert = (code: AlertCode, severity: AlertSeverity, message: string) =>
    alerts.push({ code, severity, providerId: config.providerId, message });

  let state: HealthState;

  if (input.dbStatus === "disabled") {
    state = "disabled";
    reasons.push("provider switched off in the database (news_providers.status = disabled)");
    alert("provider-disabled", "info", "disabled in the database");
  } else if (!input.schedulability.schedulable) {
    state = "disabled";
    reasons.push(`not schedulable: ${input.schedulability.detail}`);
  } else if (finished.length === 0 && runs.length === 0) {
    state = "unknown";
    reasons.push("no ingestion attempts recorded yet");
    alert("provider-never-run", "info", "no ingestion attempts recorded yet");
  } else {
    const lagFiles = gkgLag?.processedLagFiles ?? 0;
    const down = consecutiveFailures >= config.downAfterConsecutiveFailures;
    const noRecentSuccess = minutesSinceLastSuccess === null || minutesSinceLastSuccess > config.staleAfterMinutes;
    const lagStale = config.gkg ? lagFiles >= config.gkg.staleLagFiles : false;

    if (down) {
      state = "down";
      reasons.push(`${consecutiveFailures} consecutive failed runs (threshold ${config.downAfterConsecutiveFailures})`);
    } else if (noRecentSuccess || lagStale) {
      state = "stale";
      if (noRecentSuccess) {
        reasons.push(
          minutesSinceLastSuccess === null
            ? "no successful run on record"
            : `last success ${minutesSinceLastSuccess}m ago (threshold ${config.staleAfterMinutes}m)`,
        );
      }
      if (lagStale) reasons.push(`GKG processed lag ${lagFiles} files (stale at ${config.gkg?.staleLagFiles})`);
    } else {
      const degradedReasons: string[] = [];
      if (input.dbStatus === "degraded") degradedReasons.push("marked degraded in the database");
      if (finished[0]?.status === "partial") degradedReasons.push("latest run was partial");
      if (consecutiveFailures >= 1) degradedReasons.push(`${consecutiveFailures} consecutive failed run(s)`);
      if (consecutiveThrottles >= 1) degradedReasons.push(`${consecutiveThrottles} consecutive throttled run(s)`);
      if (config.degradedAfterEmptyRuns && consecutiveEmpty >= config.degradedAfterEmptyRuns) {
        degradedReasons.push(`${consecutiveEmpty} consecutive empty results`);
      }
      if (config.gkg && lagFiles >= config.gkg.degradedLagFiles) degradedReasons.push(`GKG processed lag ${lagFiles} files`);
      state = degradedReasons.length > 0 ? "degraded" : "healthy";
      reasons.push(...(degradedReasons.length > 0 ? degradedReasons : ["recent successful ingestion"]));
    }
  }

  // Alert conditions are independent of the state label so they can be routed later.
  if (state === "down") alert("provider-down", "critical", reasons.join("; "));
  if (state === "stale") alert("provider-stale", "critical", reasons.join("; "));
  if (input.dbStatus !== "disabled" && input.schedulability.schedulable) {
    if (consecutiveFailures >= 2) {
      alert(
        "consecutive-failures",
        consecutiveFailures >= config.downAfterConsecutiveFailures ? "critical" : "warning",
        `${consecutiveFailures} consecutive failed runs`,
      );
    }
    if (consecutiveThrottles >= 2) alert("consecutive-throttles", "warning", `${consecutiveThrottles} consecutive throttled runs`);
    if (config.gkg && gkgLag && (gkgLag.processedLagFiles ?? 0) >= config.gkg.degradedLagFiles) {
      const files = gkgLag.processedLagFiles ?? 0;
      alert(
        "gkg-file-lag",
        files >= config.gkg.staleLagFiles ? "critical" : "warning",
        `GKG ${files} files behind (${gkgLag.cause === "upstream-late" ? "GDELT publishing late" : "ingestion behind"}); expected ${gkgLag.expectedStamp}, processed ${gkgLag.latestProcessedStamp ?? "none"}`,
      );
    }
  }

  return {
    providerId: config.providerId,
    state,
    reasons,
    lastSuccessAt,
    lastAttemptAt: lastAttempt ? lastAttempt.startedAt : null,
    minutesSinceLastSuccess,
    consecutiveFailures,
    consecutiveThrottles,
    consecutiveEmpty,
    recent,
    latestError,
    latestUnitKey: input.latestUnitKey,
    gkgLag,
    alerts,
  };
}

export interface StuckRun {
  runId: string;
  providerId: string;
  startedAt: Date;
  minutesRunning: number;
}

export interface NewsroomHealth {
  generatedAt: Date;
  overall: HealthState;
  providers: ProviderHealth[];
  stuckRuns: StuckRun[];
  scheduler: SchedulerStatus | null;
  alerts: Alert[];
}

export interface SchedulerStatus {
  pgCronInstalled: boolean;
  pgNetInstalled: boolean;
  workerConfigured: boolean;
  jobs: { name: string; schedule: string; active: boolean }[];
}

const STATE_RANK: Record<HealthState, number> = { healthy: 0, unknown: 1, disabled: 1, degraded: 2, stale: 3, down: 4 };

/** Worst state among providers that are actually expected to be running (disabled/unknown never worsen "overall"). */
export function overallState(providers: ProviderHealth[]): HealthState {
  const active = providers.filter((provider) => provider.state !== "disabled" && provider.state !== "unknown");
  if (active.length === 0) return "unknown";
  return active.reduce<HealthState>((worst, provider) => (STATE_RANK[provider.state] > STATE_RANK[worst] ? provider.state : worst), "healthy");
}

export function stuckRunAlerts(stuck: StuckRun[]): Alert[] {
  return stuck.map((run) => ({
    code: "stuck-run" as const,
    severity: "critical" as const,
    providerId: run.providerId,
    message: `run ${run.runId} still 'running' after ${run.minutesRunning}m (will be reaped as stale-run-reaped)`,
  }));
}
