import { describe, expect, it } from "vitest";
import { ENGINE_PROVIDERS, type EngineProviderConfig } from "@/lib/news/engine/config";
import { evaluateProviderHealth, overallState, stuckRunAlerts, type ProviderHealth, type RunSample } from "@/lib/news/engine/health";

const NOW = new Date("2026-09-20T05:05:00Z");
const gkg = ENGINE_PROVIDERS.find((c) => c.providerId === "gdelt-gkg") as EngineProviderConfig;
const wiki = ENGINE_PROVIDERS.find((c) => c.providerId === "wikipedia-events") as EngineProviderConfig;
const schedulable = { schedulable: true } as const;

let seq = 0;
/** minutesAgo = when the run STARTED; it finishes 1 minute later. */
function run(minutesAgo: number, over: Partial<RunSample> = {}): RunSample {
  const startedAt = new Date(NOW.getTime() - minutesAgo * 60_000);
  return {
    id: `run-${++seq}`,
    status: "succeeded",
    providerState: "ok",
    trigger: "scheduled",
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 60_000),
    recordsReturned: 10,
    recordsAccepted: 9,
    recordsRejected: 1,
    recordsInserted: 9,
    unitsProcessed: 1,
    unitsSkipped: 0,
    errorMessage: null,
    metadata: {},
    ...over,
  };
}
const failed = (minutesAgo: number, state: RunSample["providerState"] = "error", msg = "boom") =>
  run(minutesAgo, { status: "failed", providerState: state, errorMessage: msg, recordsReturned: 0, recordsAccepted: 0, recordsInserted: 0 });

function evaluate(config: EngineProviderConfig, runs: RunSample[], over: Partial<Parameters<typeof evaluateProviderHealth>[0]> = {}) {
  return evaluateProviderHealth({ config, schedulability: schedulable, dbStatus: "active", runs, latestUnitKey: null, now: NOW, ...over });
}

describe("provider health states", () => {
  it("healthy: a recent scheduled success", () => {
    const h = evaluate(wiki, [run(10)]);
    expect(h.state).toBe("healthy");
    expect(h.lastSuccessAt).not.toBeNull();
    expect(h.minutesSinceLastSuccess).toBe(9);
    expect(h.alerts).toEqual([]);
  });

  it("unknown: schedulable but never run — with an informational alert only", () => {
    const h = evaluate(gkg, []);
    expect(h.state).toBe("unknown");
    expect(h.alerts.map((a) => a.code)).toEqual(["provider-never-run"]);
    expect(h.alerts[0].severity).toBe("info");
  });

  it("disabled: the database switch, before any other rule", () => {
    const h = evaluate(gkg, [failed(5), failed(20), failed(35)], { dbStatus: "disabled" });
    expect(h.state).toBe("disabled");
    expect(h.alerts.map((a) => a.code)).toEqual(["provider-disabled"]);
  });

  it("disabled: config/policy says not schedulable (e.g. missing API key), with the reason", () => {
    const h = evaluate(gkg, [], { schedulability: { schedulable: false, reason: "missing-env", detail: "NEWSDATA_API_KEY is not set" } });
    expect(h.state).toBe("disabled");
    expect(h.reasons.join(" ")).toMatch(/NEWSDATA_API_KEY/);
  });

  it("degraded: one failed run after a success", () => {
    const h = evaluate(wiki, [failed(5), run(65)]);
    expect(h.state).toBe("degraded");
    expect(h.consecutiveFailures).toBe(1);
  });

  it("degraded: latest run partial", () => {
    expect(evaluate(wiki, [run(5, { status: "partial", errorMessage: "one file failed" })]).state).toBe("degraded");
  });

  it("degraded: the database marks the provider degraded", () => {
    expect(evaluate(wiki, [run(5)], { dbStatus: "degraded" }).state).toBe("degraded");
  });

  it("degraded: a throttled run (even if data landed earlier)", () => {
    const h = evaluate(wiki, [failed(5, "throttled", "HTTP 429"), run(60)]);
    expect(h.state).toBe("degraded");
    expect(h.consecutiveThrottles).toBe(1);
  });

  it("down: N consecutive failures (N = config threshold), and down beats stale", () => {
    const h = evaluate(gkg, [failed(5), failed(20), failed(35), run(200)]);
    expect(h.consecutiveFailures).toBe(3);
    expect(h.state).toBe("down");
    expect(h.alerts.map((a) => a.code)).toEqual(expect.arrayContaining(["provider-down", "consecutive-failures"]));
    expect(h.alerts.find((a) => a.code === "consecutive-failures")?.severity).toBe("critical");
  });

  it("just under the down threshold is degraded, with a warning-level failures alert at 2", () => {
    const h = evaluate(gkg, [failed(5), failed(20), run(35)]);
    expect(h.state).toBe("degraded");
    expect(h.alerts.find((a) => a.code === "consecutive-failures")?.severity).toBe("warning");
  });

  it("stale: no success within the provider's threshold (a success 90m ago, GKG threshold 45m)", () => {
    const h = evaluate(gkg, [run(90)]);
    expect(h.state).toBe("stale");
    expect(h.alerts.map((a) => a.code)).toContain("provider-stale");
  });

  it("stale: attempts exist but none ever succeeded (and not yet 'down')", () => {
    const h = evaluate(gkg, [failed(5)]);
    // 1 failure < down threshold, but there is no success on record at all.
    expect(h.state).toBe("stale");
    expect(h.minutesSinceLastSuccess).toBeNull();
  });

  it("a recent partial run still counts as a success for freshness", () => {
    const h = evaluate(gkg, [run(5, { status: "partial", errorMessage: "x" })]);
    expect(h.minutesSinceLastSuccess).toBe(4);
    expect(h.state).toBe("degraded");
  });

  it("a fresh 'running' run neither breaks nor extends failure streaks", () => {
    const h = evaluate(gkg, [run(0, { status: "running", providerState: null, finishedAt: null }), failed(15), run(30)]);
    expect(h.consecutiveFailures).toBe(1);
    expect(h.lastAttemptAt).toEqual(new Date(NOW.getTime()));
  });
});

describe("consecutive counters", () => {
  it("counts consecutive throttles and stops at the first non-throttle", () => {
    const h = evaluate(gkg, [failed(5, "throttled"), failed(20, "throttled"), failed(35, "throttled"), run(50), failed(65, "throttled")]);
    expect(h.consecutiveThrottles).toBe(3);
    expect(h.consecutiveFailures).toBe(3);
    expect(h.alerts.map((a) => a.code)).toContain("consecutive-throttles");
  });

  it("counts consecutive empties; only degrades when the provider's threshold is set and reached", () => {
    const empties = Array.from({ length: 24 }, (_, i) => run(5 + i * 60, { providerState: "empty", recordsReturned: 0, recordsAccepted: 0, recordsInserted: 0 }));
    const h = evaluate({ ...wiki, staleAfterMinutes: 100_000 }, empties);
    expect(h.consecutiveEmpty).toBe(24);
    expect(h.state).toBe("degraded");
    // GKG has no empty threshold: empties are not a problem by themselves.
    const gkgEmpty = evaluate(gkg, [run(5, { providerState: "empty" }), run(20, { providerState: "empty" })]);
    expect(gkgEmpty.state).toBe("healthy");
  });

  it("keeps the counters at zero after a success", () => {
    const h = evaluate(wiki, [run(5), failed(20), failed(35)]);
    expect(h.consecutiveFailures).toBe(0);
    expect(h.state).toBe("healthy");
  });
});

describe("recent volume and latest error come from run history", () => {
  it("sums only the last hour and reports the latest error", () => {
    const h = evaluate(gkg, [run(5), run(20, { recordsReturned: 30, recordsAccepted: 28, recordsRejected: 2, recordsInserted: 25 }), run(120, { recordsReturned: 999 }), failed(150, "error", "network reset")]);
    expect(h.recent).toEqual({ windowMinutes: 60, runs: 2, returned: 40, accepted: 37, rejected: 3, inserted: 34 });
    expect(h.latestError).toMatchObject({ message: "network reset" });
  });
});

describe("GKG lag in health", () => {
  const unit = (stamp: string) => `gdelt-gkg:${stamp}`;
  const withAvailable = (stamp: string) => ({ latest_available_unit: unit(stamp) });

  it("healthy when caught up", () => {
    const h = evaluate(gkg, [run(3, { metadata: withAvailable("20260920050000") })], { latestUnitKey: unit("20260920050000") });
    expect(h.gkgLag?.processedLagFiles).toBe(0);
    expect(h.state).toBe("healthy");
  });

  it("does not report a problem merely because the newest quarter-hour file is not out yet", () => {
    // 05:05 → 05:00 file not due (grace 10). Processed 04:45 is fully current.
    const h = evaluate(gkg, [run(3, { metadata: withAvailable("20260920044500") })], { latestUnitKey: unit("20260920044500") });
    expect(h.gkgLag?.newestBoundaryDue).toBe(false);
    expect(h.state).toBe("healthy");
    expect(h.alerts).toEqual([]);
  });

  it("degraded at 2 files behind, with a warning alert naming the cause", () => {
    const h = evaluate(gkg, [run(3, { metadata: withAvailable("20260920044500") })], { latestUnitKey: unit("20260920041500") });
    expect(h.state).toBe("degraded");
    const alert = h.alerts.find((a) => a.code === "gkg-file-lag");
    expect(alert?.severity).toBe("warning");
    expect(alert?.message).toMatch(/ingestion behind/);
  });

  it("stale at 4+ files behind even when runs themselves succeed, blaming GDELT if upstream is late", () => {
    const h = evaluate(gkg, [run(3, { metadata: withAvailable("20260920033000") })], { latestUnitKey: unit("20260920033000") });
    expect(h.state).toBe("stale");
    const alert = h.alerts.find((a) => a.code === "gkg-file-lag");
    expect(alert?.severity).toBe("critical");
    expect(alert?.message).toMatch(/GDELT publishing late/);
  });
});

describe("overall state and stuck-run alerts", () => {
  const health = (state: ProviderHealth["state"]) => ({ state }) as ProviderHealth;
  it("is the worst state among providers that are expected to run", () => {
    expect(overallState([health("healthy"), health("degraded")])).toBe("degraded");
    expect(overallState([health("healthy"), health("stale"), health("down")])).toBe("down");
    expect(overallState([health("healthy"), health("disabled"), health("unknown")])).toBe("healthy");
    expect(overallState([health("disabled")])).toBe("unknown");
  });

  it("turns stuck runs into critical alerts", () => {
    const alerts = stuckRunAlerts([{ runId: "r1", providerId: "gdelt-gkg", startedAt: NOW, minutesRunning: 45 }]);
    expect(alerts).toEqual([expect.objectContaining({ code: "stuck-run", severity: "critical", providerId: "gdelt-gkg" })]);
  });
});
