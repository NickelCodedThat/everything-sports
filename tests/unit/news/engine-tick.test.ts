import { describe, expect, it, vi } from "vitest";
import { ENGINE_PROVIDERS, type EngineProviderConfig } from "@/lib/news/engine/config";
import { runScheduledTick, type TickDeps } from "@/lib/news/engine/tick";
import type { CandidateProvider } from "@/lib/news/providers/types";
import type { WarehouseRunReport } from "@/lib/news/warehouse/ingest";
import { emptyMetrics } from "@/lib/news/warehouse/types";

const NOW = new Date("2026-09-20T05:00:00Z");
const config = (id: string) => ENGINE_PROVIDERS.find((c) => c.providerId === id) as EngineProviderConfig;

function provider(id: string) {
  const fetchCandidates = vi.fn(async () => ({ providerId: id as never, candidates: [], status: "ok" as const, durationMs: 0 }));
  return { id, displayName: id, requiresApiKey: false, expectedFreshness: "near-realtime", fetchCandidates } as unknown as CandidateProvider & { fetchCandidates: typeof fetchCandidates };
}

function report(over: Partial<{ status: string; providerState: string }> = {}): WarehouseRunReport {
  return {
    run: { id: "run-1", status: over.status ?? "succeeded" },
    providerState: over.providerState ?? "ok",
    totals: { ...emptyMetrics(), inserted: 5, existingUrl: 1, duplicateHeadline: 2, observationsCreated: 6, sourcesCreated: 3 },
    returned: 7, accepted: 6, rejected: 1, unitsProcessed: 2, unitsSkipped: 1, errors: ["a note"], durationMs: 12,
  } as unknown as WarehouseRunReport;
}

function makeDeps(over: Partial<TickDeps> = {}) {
  const calls: string[] = [];
  const providers = new Map<string, ReturnType<typeof provider>>();
  const deps: TickDeps = {
    now: () => NOW,
    reapStaleRuns: vi.fn(async () => (calls.push("reap"), { reaped: 0, runIds: [] })),
    getProviderStatus: vi.fn(async () => "active"),
    getLastAttemptAt: vi.fn(async () => null),
    tryAcquireLock: vi.fn(async () => (calls.push("lock"), true)),
    releaseLock: vi.fn(async () => void calls.push("release")),
    resolveProvider: vi.fn((id: string) => {
      if (!providers.has(id)) providers.set(id, provider(id));
      return providers.get(id);
    }),
    runIngestion: vi.fn(async () => (calls.push("ingest"), report())),
    ...over,
  };
  return { deps, calls, providers };
}

const ENV = { NEWSDATA_API_KEY: "set" };
const tick = (deps: TickDeps, extra: Partial<Parameters<typeof runScheduledTick>[0]> = {}) => runScheduledTick({ deps, env: ENV, ...extra });

describe("runScheduledTick — orchestration", () => {
  it("reaps stale runs first, then gates, locks, ingests and releases, in that order", async () => {
    const { deps, calls } = makeDeps();
    const result = await tick(deps, { providerId: "gdelt-gkg" });
    expect(calls).toEqual(["reap", "lock", "ingest", "release"]);
    expect(result.results[0]).toMatchObject({ providerId: "gdelt-gkg", outcome: "ran" });
    expect(result.ok).toBe(true);
  });

  it("passes the config's window/limit and the 'scheduled' trigger to the shared ingestion path", async () => {
    const { deps } = makeDeps();
    await tick(deps, { providerId: "gdelt-gkg" });
    expect(deps.runIngestion).toHaveBeenCalledWith(expect.objectContaining({ id: "gdelt-gkg" }), { window: "3h", limit: 25, trigger: "scheduled" });
  });

  it("distinguishes manual from scheduled triggers", async () => {
    const { deps } = makeDeps();
    await tick(deps, { providerId: "wikipedia-events", trigger: "manual" });
    expect(deps.runIngestion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ trigger: "manual" }));
  });

  it("reconciles the run summary from the ingestion report (no separate counters)", async () => {
    const { deps } = makeDeps();
    const { results } = await tick(deps, { providerId: "gdelt-gkg" });
    expect(results[0].run).toEqual({
      runId: "run-1", status: "succeeded", providerState: "ok", returned: 7, accepted: 6, rejected: 1, inserted: 5,
      duplicateUrl: 1, duplicateHeadline: 2, observations: 6, sourcesCreated: 3, unitsProcessed: 2, unitsSkipped: 1,
      durationMs: 12, notes: ["a note"],
    });
  });

  it("with no provider given, runs every schedulable provider and skips manual-only and unconfigured ones", async () => {
    const { deps } = makeDeps();
    const result = await runScheduledTick({ deps, env: {} });
    const outcomes = Object.fromEntries(result.results.map((r) => [r.providerId, r.outcome]));
    expect(outcomes).toEqual({ "gdelt-gkg": "ran", "wikipedia-events": "ran", newsdata: "skipped-not-scheduled" });
    expect(result.results.find((r) => r.providerId === "newsdata")?.detail).toMatch(/NEWSDATA_API_KEY/);
  });

  it("never runs the DOC API from a schedule, even if asked for by name", async () => {
    const { deps } = makeDeps();
    const result = await tick(deps, { providerId: "gdelt" });
    expect(result.results[0]).toMatchObject({ outcome: "skipped-not-scheduled" });
    expect(deps.runIngestion).not.toHaveBeenCalled();
  });

  it("reports an unknown provider as skipped, not as a crash", async () => {
    const { deps } = makeDeps();
    const result = await tick(deps, { providerId: "nope" });
    expect(result.results[0].outcome).toBe("skipped-not-scheduled");
    expect(result.ok).toBe(true);
  });

  it("surfaces reaped runs", async () => {
    const { deps } = makeDeps({ reapStaleRuns: vi.fn(async () => ({ reaped: 2, runIds: ["a", "b"] })) });
    const result = await tick(deps, { providerId: "gdelt-gkg" });
    expect(result.reaped).toEqual({ count: 2, runIds: ["a", "b"] });
  });
});

describe("runScheduledTick — switches (zero network calls when off)", () => {
  it("a provider disabled in the database makes no fetch, takes no lock, creates no run, and is not an error", async () => {
    const { deps, providers } = makeDeps({ getProviderStatus: vi.fn(async () => "disabled") });
    const result = await tick(deps, { providerId: "gdelt-gkg" });
    expect(result.results[0]).toMatchObject({ outcome: "skipped-disabled" });
    expect(result.ok).toBe(true);
    expect(deps.runIngestion).not.toHaveBeenCalled();
    expect(deps.tryAcquireLock).not.toHaveBeenCalled();
    // The implementation is not even instantiated, so no fetch can possibly happen.
    expect(deps.resolveProvider).not.toHaveBeenCalled();
    expect(providers.size).toBe(0);
  });

  it("'degraded' in the database still runs (only 'disabled' stops work)", async () => {
    const { deps } = makeDeps({ getProviderStatus: vi.fn(async () => "degraded") });
    expect((await tick(deps, { providerId: "gdelt-gkg" })).results[0].outcome).toBe("ran");
  });

  it("config-disabled and missing-env providers are skipped before the database is even consulted", async () => {
    const { deps } = makeDeps();
    const off = { ...config("wikipedia-events"), enabled: false };
    const result = await runScheduledTick({ deps, env: {}, configs: [off, config("newsdata")] });
    expect(result.results.map((r) => r.outcome)).toEqual(["skipped-not-scheduled", "skipped-not-scheduled"]);
    const noKey = await runScheduledTick({ deps, env: {}, providerId: "newsdata" });
    expect(noKey.results[0]).toMatchObject({ outcome: "skipped-not-scheduled" });
    expect(deps.getProviderStatus).not.toHaveBeenCalled();
    expect(deps.runIngestion).not.toHaveBeenCalled();
  });

  it("a provider the policy registry does not approve is never run, whatever the config says", async () => {
    const { deps } = makeDeps();
    const rogue = { ...config("wikipedia-events"), providerId: "gnews" };
    const result = await runScheduledTick({ deps, env: {}, configs: [rogue], providerId: "gnews" });
    expect(result.results[0].outcome).toBe("skipped-not-approved");
    expect(deps.runIngestion).not.toHaveBeenCalled();
  });
});

describe("runScheduledTick — due check", () => {
  it("skips a scheduled invocation when the last attempt is more recent than the min interval", async () => {
    const { deps } = makeDeps({ getLastAttemptAt: vi.fn(async () => new Date(NOW.getTime() - 4 * 60_000)) });
    const result = await tick(deps, { providerId: "gdelt-gkg" });
    expect(result.results[0]).toMatchObject({ outcome: "skipped-not-due" });
    expect(deps.tryAcquireLock).not.toHaveBeenCalled();
  });

  it("runs once the interval has elapsed", async () => {
    const { deps } = makeDeps({ getLastAttemptAt: vi.fn(async () => new Date(NOW.getTime() - 11 * 60_000)) });
    expect((await tick(deps, { providerId: "gdelt-gkg" })).results[0].outcome).toBe("ran");
  });

  it("force bypasses the due check, and manual triggers are never rate-limited", async () => {
    const recent = vi.fn(async () => new Date(NOW.getTime() - 60_000));
    const forced = makeDeps({ getLastAttemptAt: recent });
    expect((await tick(forced.deps, { providerId: "gdelt-gkg", force: true })).results[0].outcome).toBe("ran");
    const manual = makeDeps({ getLastAttemptAt: recent });
    expect((await tick(manual.deps, { providerId: "gdelt-gkg", trigger: "manual" })).results[0].outcome).toBe("ran");
  });
});

describe("runScheduledTick — overlap protection", () => {
  it("exits cleanly as skipped/already-running when the lock is held: no ingestion, no failure", async () => {
    const { deps, calls } = makeDeps({ tryAcquireLock: vi.fn(async () => false) });
    const result = await tick(deps, { providerId: "gdelt-gkg" });
    expect(result.results[0]).toMatchObject({ outcome: "skipped-locked" });
    expect(result.results[0].detail).toMatch(/already-running/);
    expect(result.ok).toBe(true);
    expect(deps.runIngestion).not.toHaveBeenCalled();
    expect(calls).not.toContain("release");
  });

  it("locks per provider, with the configured lease", async () => {
    const { deps } = makeDeps();
    await tick(deps, { providerId: "wikipedia-events" });
    expect(deps.tryAcquireLock).toHaveBeenCalledWith("ingest:wikipedia-events", expect.any(String), 10);
  });

  it("releases the lock with the same holder token after success", async () => {
    const { deps } = makeDeps();
    await tick(deps, { providerId: "gdelt-gkg" });
    const [, acquireHolder] = (deps.tryAcquireLock as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(deps.releaseLock).toHaveBeenCalledWith("ingest:gdelt-gkg", acquireHolder);
  });
});

describe("runScheduledTick — failures", () => {
  it("records an ingestion exception as an error outcome, releases the lock, and marks the tick not ok", async () => {
    const { deps, calls } = makeDeps({ runIngestion: vi.fn(async () => { throw new Error("db exploded"); }) });
    const result = await tick(deps, { providerId: "gdelt-gkg" });
    expect(result.results[0]).toMatchObject({ outcome: "error", detail: "db exploded" });
    expect(result.ok).toBe(false);
    expect(calls).toContain("release");
  });

  it("a run that ends 'failed' (throttled/unavailable provider) makes the tick not ok but keeps the run summary", async () => {
    const { deps } = makeDeps({ runIngestion: vi.fn(async () => report({ status: "failed", providerState: "throttled" })) });
    const result = await tick(deps, { providerId: "gdelt-gkg" });
    expect(result.results[0].run).toMatchObject({ status: "failed", providerState: "throttled" });
    expect(result.ok).toBe(false);
  });

  it("a 'partial' run is still ok", async () => {
    const { deps } = makeDeps({ runIngestion: vi.fn(async () => report({ status: "partial" })) });
    expect((await tick(deps, { providerId: "gdelt-gkg" })).ok).toBe(true);
  });

  it("a failing lock release never masks the run result", async () => {
    const { deps } = makeDeps({ releaseLock: vi.fn(async () => { throw new Error("release failed"); }) });
    expect((await tick(deps, { providerId: "gdelt-gkg" })).results[0].outcome).toBe("ran");
  });

  it("one provider failing does not stop the next provider", async () => {
    let n = 0;
    const { deps } = makeDeps({ runIngestion: vi.fn(async () => { if (++n === 1) throw new Error("first fails"); return report(); }) });
    const result = await runScheduledTick({ deps, env: {} });
    expect(result.results.map((r) => r.outcome)).toEqual(["error", "ran", "skipped-not-scheduled"]);
  });

  it("truncates very long error notes", async () => {
    const { deps } = makeDeps({ runIngestion: vi.fn(async () => { throw new Error("x".repeat(1000)); }) });
    const detail = (await tick(deps, { providerId: "gdelt-gkg" })).results[0].detail!;
    expect(detail.length).toBeLessThanOrEqual(300);
  });
});
