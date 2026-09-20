import type { NewsroomHealth, ProviderHealth } from "./health";
import type { TickResult } from "./tick";

function ago(minutes: number | null): string {
  if (minutes === null) return "never";
  if (minutes < 1) return "<1m ago";
  if (minutes < 120) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function providerBlock(provider: ProviderHealth, now: Date): string[] {
  const lines = [
    provider.providerId,
    `  status: ${provider.state}`,
    `  why: ${provider.reasons.join("; ")}`,
    `  last success: ${ago(provider.minutesSinceLastSuccess)}`,
    `  last attempt: ${provider.lastAttemptAt ? ago(Math.floor((now.getTime() - provider.lastAttemptAt.getTime()) / 60_000)) : "never"}`,
  ];
  if (provider.latestUnitKey) lines.push(`  latest unit: ${provider.latestUnitKey.split(":")[1] ?? provider.latestUnitKey}`);
  if (provider.gkgLag) {
    const lag = provider.gkgLag;
    lines.push(
      `  gkg lag: expected ${lag.expectedStamp}, available ${lag.latestAvailableStamp ?? "?"}, processed ${lag.latestProcessedStamp ?? "none"} ` +
        `(${lag.processedLagFiles ?? "?"} files behind, cause: ${lag.cause})`,
    );
  }
  lines.push(
    `  last ${provider.recent.windowMinutes}m: ${provider.recent.runs} runs — returned ${provider.recent.returned}, accepted ${provider.recent.accepted}, rejected ${provider.recent.rejected}, inserted ${provider.recent.inserted}`,
    `  consecutive failures: ${provider.consecutiveFailures}  throttles: ${provider.consecutiveThrottles}  empty: ${provider.consecutiveEmpty}`,
  );
  if (provider.latestError) lines.push(`  latest error: ${provider.latestError.message.slice(0, 200)}`);
  return lines;
}

/** Human-readable health report. Never contains secrets: only states, counts, stamps and job names. */
export function formatHealthReport(health: NewsroomHealth): string {
  const lines = ["NEWSROOM HEALTH", `overall: ${health.overall}`, ""];
  for (const provider of health.providers) {
    lines.push(...providerBlock(provider, health.generatedAt), "");
  }
  lines.push(`stuck runs: ${health.stuckRuns.length}`);
  for (const run of health.stuckRuns) lines.push(`  ${run.runId} (${run.providerId}) running ${run.minutesRunning}m`);

  if (health.scheduler) {
    const s = health.scheduler;
    lines.push(
      "",
      `scheduler: pg_cron ${s.pgCronInstalled ? "installed" : "MISSING"}, pg_net ${s.pgNetInstalled ? "installed" : "MISSING"}, worker ${s.workerConfigured ? "configured (Vault)" : "NOT configured (Vault secrets unset)"}`,
    );
    for (const job of s.jobs) lines.push(`  job ${job.name}  ${job.schedule}  ${job.active ? "active" : "paused"}`);
  }

  lines.push("", `alerts: ${health.alerts.length}`);
  for (const alert of health.alerts) lines.push(`  [${alert.severity}] ${alert.code}${alert.providerId ? ` (${alert.providerId})` : ""}: ${alert.message}`);
  return lines.join("\n");
}

export function formatTickReport(result: TickResult): string {
  const lines = [
    `Newsroom tick — trigger=${result.trigger} ok=${result.ok}`,
    `reaped stale runs: ${result.reaped.count}${result.reaped.runIds.length ? ` (${result.reaped.runIds.join(", ")})` : ""}`,
    "",
  ];
  for (const item of result.results) {
    if (!item.run) {
      lines.push(`${item.providerId}: ${item.outcome}${item.detail ? ` — ${item.detail}` : ""}`);
      continue;
    }
    const r = item.run;
    lines.push(
      `${item.providerId}: ran — run ${r.runId}`,
      `  status ${r.status} (${r.providerState}); units ${r.unitsProcessed} processed / ${r.unitsSkipped} skipped`,
      `  returned ${r.returned}, accepted ${r.accepted}, rejected ${r.rejected}, inserted ${r.inserted}, dup URL ${r.duplicateUrl}, dup headline ${r.duplicateHeadline}`,
      `  observations ${r.observations}, sources created ${r.sourcesCreated}, ${r.durationMs}ms`,
    );
    for (const note of r.notes) lines.push(`  note: ${note}`);
  }
  return lines.join("\n");
}
