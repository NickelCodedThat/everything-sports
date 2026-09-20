import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGINE_PROVIDERS } from "@/lib/news/engine/config";
import { collectNewsroomHealth } from "@/lib/news/engine/health-data";
import { formatGkgStamp, latestExpectedStamp } from "@/lib/news/engine/gkg-lag";
import { createTickDeps, runScheduledTick } from "@/lib/news/engine/tick";
import { ProviderRateLimitedError } from "@/lib/news/errors";
import type { CandidateProvider } from "@/lib/news/providers/types";
import { ingestBatch } from "@/lib/news/warehouse/candidates";
import { getSchedulerStatus, releaseLock, reapStaleRuns, tryAcquireLock } from "@/lib/news/warehouse/engine-db";
import { getPublishableHeadline, listFreshCandidates, listHeadlineGroupInputs } from "@/lib/news/warehouse/feed";
import { runWarehouseIngestion } from "@/lib/news/warehouse/ingest";
import { startRun } from "@/lib/news/warehouse/ingestion-runs";
import { setProviderStatus, syncProvider } from "@/lib/news/warehouse/providers";
import { setSourceEnabled } from "@/lib/news/warehouse/sources";
import { fakeFeedProvider, fakeUnitProvider, makeCandidate, makeClient, openRun, pool, resetWarehouse, scalar, withVaultSecrets } from "./helpers";

const client = makeClient();
beforeEach(resetWarehouse);
afterAll(() => pool.end());

const GKG = "gdelt-gkg";
const stamp = (n: string) => `gdelt-gkg:${n}`;
const three = () => [
  makeCandidate({ url: "https://eng.example/1", headline: "Engine story one about a walk-off win" }),
  makeCandidate({ url: "https://eng.example/2", headline: "Engine story two about a shutout" }),
];

/** Wraps a provider so tests can prove it was (not) touched. */
function spied(provider: CandidateProvider) {
  const list = vi.spyOn(provider.units!, "list");
  const fetchUnit = vi.spyOn(provider.units!, "fetch");
  const fetchCandidates = vi.spyOn(provider, "fetchCandidates");
  return { provider, list, fetchUnit, fetchCandidates, touched: () => list.mock.calls.length + fetchUnit.mock.calls.length + fetchCandidates.mock.calls.length };
}

const tick = (provider: CandidateProvider, extra: Partial<Parameters<typeof runScheduledTick>[0]> = {}) =>
  runScheduledTick({
    deps: createTickDeps(client, { resolveProvider: (id) => (id === provider.id ? provider : undefined) }),
    providerId: provider.id,
    env: {},
    ...extra,
  });

describe("lease lock (overlap protection primitive)", () => {
  it("grants one holder at a time and releases only for the holder", async () => {
    const a = "00000000-0000-0000-0000-00000000000a";
    const b = "00000000-0000-0000-0000-00000000000b";
    expect(await tryAcquireLock(client, "ingest:x", a, 5)).toBe(true);
    expect(await tryAcquireLock(client, "ingest:x", b, 5)).toBe(false);
    expect(await releaseLock(client, "ingest:x", b)).toBe(false);
    expect(await tryAcquireLock(client, "ingest:x", b, 5)).toBe(false);
    expect(await releaseLock(client, "ingest:x", a)).toBe(true);
    expect(await tryAcquireLock(client, "ingest:x", b, 5)).toBe(true);
  });

  it("locks are independent per key", async () => {
    expect(await tryAcquireLock(client, "ingest:one", crypto.randomUUID(), 5)).toBe(true);
    expect(await tryAcquireLock(client, "ingest:two", crypto.randomUUID(), 5)).toBe(true);
  });

  it("self-heals: an expired lease (crashed holder) can be taken over", async () => {
    await tryAcquireLock(client, "ingest:crashed", crypto.randomUUID(), 5);
    await pool.query("update newsroom_locks set acquired_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where lock_key = 'ingest:crashed'");
    const newHolder = crypto.randomUUID();
    expect(await tryAcquireLock(client, "ingest:crashed", newHolder, 5)).toBe(true);
    expect(await scalar<string>("select holder::text from newsroom_locks where lock_key = 'ingest:crashed'")).toBe(newHolder);
  });

  it("under a 12-way race exactly one caller wins", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => tryAcquireLock(client, "ingest:race", crypto.randomUUID(), 5)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await scalar("select count(*)::int from newsroom_locks where lock_key = 'ingest:race'")).toBe(1);
  });
});

describe("stale-run reaper", () => {
  it("closes only runs stuck past the threshold — as failed, with a reason and finished_at — and never deletes", async () => {
    const provider = fakeUnitProvider({});
    const row = await syncProvider(client, provider);
    const stale = await startRun(client, { providerId: row.id, trigger: "scheduled" });
    const fresh = await startRun(client, { providerId: row.id, trigger: "scheduled" });
    await pool.query("update ingestion_runs set started_at = now() - interval '45 minutes' where id = $1", [stale.id]);

    const before = await scalar("select count(*)::int from ingestion_runs");
    const result = await reapStaleRuns(client, 30);

    expect(result).toEqual({ reaped: 1, runIds: [stale.id] });
    const reaped = (await pool.query("select * from ingestion_runs where id = $1", [stale.id])).rows[0];
    expect(reaped).toMatchObject({ status: "failed", provider_state: "error" });
    expect(reaped.finished_at).not.toBeNull();
    expect(reaped.error_message).toMatch(/^stale-run-reaped/);
    expect(reaped.metadata).toMatchObject({ failure_reason: "stale-run-reaped" });
    expect((await pool.query("select status from ingestion_runs where id = $1", [fresh.id])).rows[0].status).toBe("running");
    expect(await scalar("select count(*)::int from ingestion_runs")).toBe(before);
    expect((await reapStaleRuns(client, 30)).reaped).toBe(0);
  });

  it("leaves finished runs alone", async () => {
    await runWarehouseIngestion(client, { provider: fakeUnitProvider({ [stamp("20260920100000")]: three() }), window: "1h", limit: 5, trigger: "test" });
    await pool.query("update ingestion_runs set started_at = now() - interval '5 hours'");
    expect((await reapStaleRuns(client, 30)).reaped).toBe(0);
  });
});

describe("scheduled tick against the real warehouse", () => {
  it("runs a scheduled ingestion whose summary reconciles exactly with the ingestion_runs row", async () => {
    const provider = fakeUnitProvider({ [stamp("20260920100000")]: three(), [stamp("20260920101500")]: [makeCandidate({ url: "https://eng.example/3", headline: "Engine story three about a trade" })] });
    const result = await tick(provider);

    expect(result.ok).toBe(true);
    const outcome = result.results[0];
    expect(outcome.outcome).toBe("ran");
    const row = (await pool.query("select * from ingestion_runs where id = $1", [outcome.run!.runId])).rows[0];
    expect(row).toMatchObject({
      trigger: "scheduled", status: "succeeded", provider_state: "ok",
      records_returned: outcome.run!.returned, records_accepted: outcome.run!.accepted, records_rejected: outcome.run!.rejected,
      records_inserted: outcome.run!.inserted, records_duplicate_url: outcome.run!.duplicateUrl, records_duplicate_headline: outcome.run!.duplicateHeadline,
      observations_created: outcome.run!.observations, sources_created: outcome.run!.sourcesCreated,
      units_processed: outcome.run!.unitsProcessed, units_skipped: outcome.run!.unitsSkipped,
    });
    expect(row).toMatchObject({ records_inserted: 3, units_processed: 2 });
    expect(row.metadata).toMatchObject({ latest_available_unit: stamp("20260920101500"), units_listed: 2 });
  });

  it("an immediate second invocation is 'not due', and a forced one duplicates nothing", async () => {
    const provider = fakeUnitProvider({ [stamp("20260920100000")]: three() });
    await tick(provider);
    const again = await tick(provider);
    expect(again.results[0].outcome).toBe("skipped-not-due");
    expect(await scalar("select count(*)::int from ingestion_runs")).toBe(1);

    const forced = await tick(provider, { force: true });
    expect(forced.results[0].run).toMatchObject({ status: "succeeded", inserted: 0, unitsProcessed: 0, unitsSkipped: 1, returned: 0 });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(2);
    expect(await scalar("select count(*)::int from candidate_ingestion_events")).toBe(2);
  });

  it("does not start a competing ingestion while the lock is held: skipped/already-running, no run, no fetch", async () => {
    const spy = spied(fakeUnitProvider({ [stamp("20260920100000")]: three() }));
    await syncProvider(client, spy.provider);
    await tryAcquireLock(client, "ingest:gdelt-gkg", crypto.randomUUID(), 20);

    const result = await tick(spy.provider);

    expect(result.results[0]).toMatchObject({ outcome: "skipped-locked" });
    expect(result.results[0].detail).toMatch(/already-running/);
    expect(result.ok).toBe(true);
    expect(spy.touched()).toBe(0);
    expect(await scalar("select count(*)::int from ingestion_runs")).toBe(0);
  });

  it("releases the lock when the run finishes — and when it throws", async () => {
    await tick(fakeUnitProvider({ [stamp("20260920100000")]: three() }));
    expect(await scalar("select count(*)::int from newsroom_locks")).toBe(0);

    const boom = fakeUnitProvider({});
    boom.units!.list = async () => { throw new Error("upstream exploded"); };
    const result = await tick(boom, { force: true });
    expect(result.results[0].run).toMatchObject({ status: "failed", providerState: "error" });
    expect(await scalar("select count(*)::int from newsroom_locks")).toBe(0);
  });

  it("two simultaneous scheduled ticks: exactly one runs, the other backs off, data lands once", async () => {
    const provider = fakeUnitProvider({ [stamp("20260920100000")]: three() });
    const slow = provider.units!.fetch;
    provider.units!.fetch = async (key) => { await new Promise((r) => setTimeout(r, 300)); return slow(key); };

    const [a, b] = await Promise.all([tick(provider, { force: true }), tick(provider, { force: true })]);
    const outcomes = [a.results[0].outcome, b.results[0].outcome].sort();
    expect(outcomes).toEqual(["ran", "skipped-locked"]);
    expect(await scalar("select count(*)::int from ingestion_runs")).toBe(1);
    expect(await scalar("select count(*)::int from news_candidates")).toBe(2);
  });

  it("a provider disabled in the database makes zero provider calls, creates no run, and is reported (not an error)", async () => {
    const spy = spied(fakeUnitProvider({ [stamp("20260920100000")]: three() }));
    await syncProvider(client, spy.provider);
    await setProviderStatus(client, GKG, "disabled");

    const result = await tick(spy.provider, { force: true });

    expect(result.results[0]).toMatchObject({ outcome: "skipped-disabled" });
    expect(result.ok).toBe(true);
    expect(spy.touched()).toBe(0);
    expect(await scalar("select count(*)::int from ingestion_runs")).toBe(0);

    await setProviderStatus(client, GKG, "active");
    expect((await tick(spy.provider, { force: true })).results[0].outcome).toBe("ran");
  });

  it("records a partial run when one file fails but others land", async () => {
    const provider = fakeUnitProvider({ [stamp("20260920100000")]: three(), [stamp("20260920101500")]: new Error("connection reset") });
    const result = await tick(provider);
    expect(result.ok).toBe(true);
    expect(result.results[0].run).toMatchObject({ status: "partial", providerState: "ok", unitsProcessed: 1 });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(2);
  });

  it("records a throttled provider as a failed run and reports the tick as not ok", async () => {
    const provider = fakeUnitProvider({ [stamp("20260920100000")]: new ProviderRateLimitedError("HTTP 429") });
    const result = await tick(provider);
    expect(result.ok).toBe(false);
    expect(await scalar("select status || '/' || provider_state from ingestion_runs")).toBe("failed/throttled");
  });

  it("reaps a crashed run before doing anything else", async () => {
    const provider = fakeUnitProvider({ [stamp("20260920100000")]: three() });
    const row = await syncProvider(client, provider);
    const stuck = await startRun(client, { providerId: row.id, trigger: "scheduled" });
    await pool.query("update ingestion_runs set started_at = now() - interval '2 hours' where id = $1", [stuck.id]);

    const result = await tick(provider, { force: true });

    expect(result.reaped).toEqual({ count: 1, runIds: [stuck.id] });
    expect(await scalar("select status from ingestion_runs where id = $1", [stuck.id])).toBe("failed");
  });

  it("distinguishes manual and scheduled triggers, and the plain manual ingest path is unchanged", async () => {
    const provider = fakeUnitProvider({ [stamp("20260920100000")]: three() });
    await tick(provider, { trigger: "manual" });
    await runWarehouseIngestion(client, { provider, window: "1h", limit: 5 }); // what `pnpm news:ingest` calls
    await tick(provider, { force: true }); // scheduled
    const triggers = (await pool.query("select trigger from ingestion_runs order by started_at")).rows.map((r) => r.trigger);
    expect(triggers).toEqual(["manual", "manual", "scheduled"]);
  });

  it("keeps a source disabled in the database out of canonical storage under scheduled ingestion", async () => {
    const provider = fakeUnitProvider({ [stamp("20260920100000")]: [makeCandidate({ url: "https://bad-source.example/a", headline: "Story before disabling the source" })] });
    await tick(provider);
    await setSourceEnabled(client, "bad-source.example", false);
    const next = fakeUnitProvider({ [stamp("20260920101500")]: [makeCandidate({ url: "https://bad-source.example/b", headline: "Story after disabling the source" })] });
    await tick(next, { force: true });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(1);
    expect(await scalar("select reasons[1] from candidate_rejections")).toBe("disabled-source");
  });

  it("makes no promotion: scheduled ingestion only creates warehouse candidates", async () => {
    await tick(fakeUnitProvider({ [stamp("20260920100000")]: three() }));
    expect(await scalar("select count(*)::int from news_candidates where status in ('accepted','clustered','promoted')")).toBe(0);
  });
});

describe("health from real run history", () => {
  const nowExpected = () => latestExpectedStamp(new Date());

  it("healthy with current GKG files, and reports the latest unit and zero lag", async () => {
    const current = nowExpected();
    await tick(fakeUnitProvider({ [stamp(current)]: three() }));
    const health = await collectNewsroomHealth(client, { env: {} });
    const gkg = health.providers.find((p) => p.providerId === GKG)!;
    expect(gkg.state).toBe("healthy");
    expect(gkg.latestUnitKey).toBe(stamp(current));
    expect(gkg.gkgLag?.processedLagFiles).toBe(0);
    expect(gkg.recent).toMatchObject({ runs: 1, returned: 2, accepted: 2, inserted: 2 });
    expect(health.stuckRuns).toEqual([]);
  });

  it("excludes 'test' runs so experiments cannot fake health", async () => {
    await runWarehouseIngestion(client, { provider: fakeUnitProvider({ [stamp(nowExpected())]: three() }), window: "1h", limit: 5, trigger: "test" });
    const gkg = (await collectNewsroomHealth(client, { env: {} })).providers.find((p) => p.providerId === GKG)!;
    expect(gkg.state).toBe("unknown");
    expect(gkg.lastSuccessAt).toBeNull();
  });

  it("goes down after consecutive throttled runs and raises alerts", async () => {
    const throttled = fakeUnitProvider({ [stamp("20260920100000")]: new ProviderRateLimitedError("HTTP 429") });
    for (let i = 0; i < 3; i += 1) await tick(throttled, { force: true });
    const health = await collectNewsroomHealth(client, { env: {} });
    const gkg = health.providers.find((p) => p.providerId === GKG)!;
    expect(gkg).toMatchObject({ state: "down", consecutiveFailures: 3, consecutiveThrottles: 3 });
    expect(gkg.latestError?.message).toMatch(/429/);
    expect(health.overall).toBe("down");
    expect(health.alerts.map((a) => a.code)).toEqual(expect.arrayContaining(["provider-down", "consecutive-failures", "consecutive-throttles"]));
  });

  it("recovers to healthy after a success", async () => {
    const throttled = fakeUnitProvider({ [stamp("20260920100000")]: new ProviderRateLimitedError("HTTP 429") });
    await tick(throttled, { force: true });
    await tick(fakeUnitProvider({ [stamp(nowExpected())]: three() }), { force: true });
    const gkg = (await collectNewsroomHealth(client, { env: {} })).providers.find((p) => p.providerId === GKG)!;
    expect(gkg).toMatchObject({ state: "healthy", consecutiveFailures: 0 });
  });

  it("flags GKG file lag when the newest processed file is far behind, even though runs succeed", async () => {
    const old = formatGkgStamp(new Date(Date.now() - 3 * 3_600_000));
    await tick(fakeUnitProvider({ [stamp(old)]: three() }));
    const health = await collectNewsroomHealth(client, { env: {} });
    const gkg = health.providers.find((p) => p.providerId === GKG)!;
    expect(gkg.state).toBe("stale");
    expect(gkg.alerts.map((a) => a.code)).toContain("gkg-file-lag");
  });

  it("shows a run stuck past the threshold, then nothing once reaped", async () => {
    const row = await syncProvider(client, fakeUnitProvider({}));
    const run = await startRun(client, { providerId: row.id, trigger: "scheduled" });
    await pool.query("update ingestion_runs set started_at = now() - interval '50 minutes' where id = $1", [run.id]);
    const health = await collectNewsroomHealth(client, { env: {} });
    expect(health.stuckRuns).toEqual([expect.objectContaining({ runId: run.id, providerId: GKG })]);
    expect(health.alerts.map((a) => a.code)).toContain("stuck-run");
    await reapStaleRuns(client, 30);
    expect((await collectNewsroomHealth(client, { env: {} })).stuckRuns).toEqual([]);
  });

  it("reports disabled providers and unconfigured API-key providers as disabled, not as failures", async () => {
    await syncProvider(client, fakeUnitProvider({}));
    await setProviderStatus(client, GKG, "disabled");
    const health = await collectNewsroomHealth(client, { env: {} });
    expect(health.providers.find((p) => p.providerId === GKG)?.state).toBe("disabled");
    expect(health.providers.find((p) => p.providerId === "newsdata")?.state).toBe("disabled");
    expect(health.providers.some((p) => p.providerId === "gdelt")).toBe(false); // manual-only providers are not part of scheduled health
  });

  it("reports scheduler wiring (jobs installed, Vault not configured) without exposing secrets", async () => {
    const status = await withVaultSecrets({}, () => getSchedulerStatus(client));
    expect(status).toMatchObject({ pgCronInstalled: true, pgNetInstalled: true, workerConfigured: false });
    expect(status.jobs.map((j) => j.name).sort()).toEqual([
      "newsroom-cron-history-cleanup", "newsroom-gkg-ingest", "newsroom-newsdata-ingest", "newsroom-reap-stale-clustering-runs", "newsroom-reap-stale-ranking-runs", "newsroom-reap-stale-runs", "newsroom-wikipedia-ingest",
    ]);
    expect(JSON.stringify(status)).not.toMatch(/https?:|Bearer|secret/i);
  });
});

describe("Supabase Cron ↔ Vault wiring", () => {
  it("newsroom_invoke_worker is a no-op until Vault is configured", async () => {
    const { data, error } = await withVaultSecrets({}, async () => await client.rpc("newsroom_invoke_worker", { p_provider: GKG }));
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("once Vault secrets exist it enqueues a pg_net request; cron job definitions still contain no secrets", async () => {
    await withVaultSecrets({ url: "http://127.0.0.1:9/never-listening", secret: "vault-test-secret-value-0123456789abcdef" }, async () => {
      const { data, error } = await client.rpc("newsroom_invoke_worker", { p_provider: GKG });
      expect(error).toBeNull();
      expect(typeof data).toBe("number");
      expect((await getSchedulerStatus(client)).workerConfigured).toBe(true);
      const commands = (await pool.query("select command from cron.job where jobname like 'newsroom-%'")).rows.map((r) => r.command as string).join("\n");
      expect(commands).not.toMatch(/vault-test-secret|Bearer|http/i);
    });
  });

  it("denies anon/authenticated the new tables, views and functions", async () => {
    const conn = await pool.connect();
    try {
      for (const role of ["anon", "authenticated"]) {
        for (const sql of [
          "select * from public.newsroom_locks",
          "select * from public.news_candidate_feed",
          "select public.newsroom_try_acquire_lock('k', gen_random_uuid(), interval '1 minute')",
          "select public.news_reap_stale_runs()",
          "select public.newsroom_invoke_worker('gdelt-gkg')",
          "select public.newsroom_scheduler_status()",
        ]) {
          await conn.query("begin");
          await conn.query(`set local role ${role}`);
          await expect(conn.query(sql)).rejects.toThrow(/permission denied/);
          await conn.query("rollback");
        }
      }
    } finally {
      conn.release();
    }
  });
});

describe("internal fresh-candidate feed", () => {
  const HOUR = 3_600_000;
  const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();

  async function seed() {
    const gkg = fakeUnitProvider({});
    const wiki = fakeFeedProvider("wikipedia-events", { status: "ok" });
    const runGkg = await openRun(client, gkg);
    const runWiki = await openRun(client, wiki);
    await ingestBatch(client, {
      runId: runGkg,
      candidates: [
        makeCandidate({ url: "https://www.espn.com/nba/a", headline: "NBA insider reports a blockbuster trade", queryProfileSport: "basketball", publishedAt: iso(1) }),
        makeCandidate({ url: "https://small-blog.example/b", headline: "Team wins big game on the road", queryProfileSport: "basketball", publishedAt: iso(3) }),
        makeCandidate({ url: "https://www.cbssports.com/nfl/c", headline: "NFL Week 2 injury report: starters questionable", queryProfileSport: "football", publishedAt: iso(2) }),
        makeCandidate({ url: "https://old.example/d", headline: "Rays clinch the division with a walk-off homer", queryProfileSport: "baseball", publishedAt: iso(30) }),
        makeCandidate({ url: "https://undated.example/e", headline: "MLB playoff picture after a busy Saturday", queryProfileSport: "baseball", publishedAt: undefined }),
      ],
      rejected: [],
    });
    // same headline on a second domain → a duplicate (non-root) candidate
    await ingestBatch(client, {
      runId: runGkg,
      candidates: [makeCandidate({ url: "https://mirror.example/a2", headline: "NBA insider reports a blockbuster trade", queryProfileSport: "basketball", publishedAt: iso(1) })],
      rejected: [],
    });
    await ingestBatch(client, {
      runId: runWiki,
      candidates: [
        makeCandidate({ provider: "wikipedia-events", url: "https://wire.example/w", headline: "In basketball, a fictional player sets a fictional record.", queryProfileSport: undefined, queryProfileLabel: "current-events", publishedAt: iso(0.5) }),
      ],
      rejected: [],
    });
  }

  it("returns publisher-titled roots freshest first, by published time (falling back to discovered time)", async () => {
    await seed();
    const items = await listFreshCandidates(client);
    expect(items.map((i) => i.publisherHeadline)).toEqual([
      "MLB playoff picture after a busy Saturday", // no published_at → discovered just now → freshest
      "NBA insider reports a blockbuster trade",
      "NFL Week 2 injury report: starters questionable",
      "Team wins big game on the road",
      "Rays clinch the division with a walk-off homer",
    ]);
    const times = items.map((i) => i.freshAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("excludes group duplicates by default and includes them on request", async () => {
    await seed();
    expect((await listFreshCandidates(client)).every((i) => i.status === "new")).toBe(true);
    const all = await listFreshCandidates(client, { statuses: ["new", "duplicate"] });
    expect(all.filter((i) => i.status === "duplicate")).toHaveLength(1);
    expect(all.find((i) => i.status === "duplicate")?.headlineGroupRootId).not.toBeNull();
  });

  it("keeps discovery text out by default and makes it unmistakable when requested — it can never be a publishable headline", async () => {
    await seed();
    const defaultItems = await listFreshCandidates(client);
    expect(defaultItems.some((i) => i.headlineKind === "discovery-text")).toBe(false);

    const withDiscovery = await listFreshCandidates(client, { includeDiscoveryText: true });
    const wiki = withDiscovery.find((i) => i.provider === "wikipedia-events")!;
    expect(wiki).toMatchObject({ headlineKind: "discovery-text", publisherHeadline: null });
    expect(wiki.discoveryText).toMatch(/fictional record/);
    expect(getPublishableHeadline(wiki)).toBeNull();
    for (const item of withDiscovery.filter((i) => i.headlineKind === "publisher-title")) {
      expect(getPublishableHeadline(item)).toBe(item.publisherHeadline);
      expect(item.discoveryText).toBeNull();
    }
  });

  it("filters by sport, provider, source quality, confidence and time windows", async () => {
    await seed();
    expect((await listFreshCandidates(client, { sport: "football" })).map((i) => i.sport)).toEqual(["football"]);
    expect(await listFreshCandidates(client, { providers: ["wikipedia-events"] })).toEqual([]); // discovery text excluded by default
    expect((await listFreshCandidates(client, { providers: ["wikipedia-events"], includeDiscoveryText: true })).length).toBe(1);
    expect((await listFreshCandidates(client, { sourceQuality: ["known"] })).map((i) => i.source.domain).sort()).toEqual(["cbssports.com", "espn.com"]);

    const high = await listFreshCandidates(client, { minConfidence: "high" });
    expect(high.every((i) => i.confidence === "high")).toBe(true);
    const medium = await listFreshCandidates(client, { minConfidence: "medium" });
    expect(medium.every((i) => ["high", "medium"].includes(i.confidence))).toBe(true);
    expect(medium.length).toBeLessThan((await listFreshCandidates(client)).length + 1);

    expect((await listFreshCandidates(client, { publishedSince: new Date(Date.now() - 2.5 * HOUR) })).map((i) => i.source.domain).sort()).toEqual(["cbssports.com", "espn.com"]);
    expect((await listFreshCandidates(client, { publishedUntil: new Date(Date.now() - 24 * HOUR) })).map((i) => i.source.domain)).toEqual(["old.example"]);
    expect((await listFreshCandidates(client, { discoveredSince: new Date(Date.now() + HOUR) }))).toEqual([]);
  });

  it("honors limit (capped) and hides candidates from sources disabled in the database", async () => {
    await seed();
    expect(await listFreshCandidates(client, { limit: 2 })).toHaveLength(2);
    await setSourceEnabled(client, "espn.com", false);
    expect((await listFreshCandidates(client)).some((i) => i.source.domain === "espn.com")).toBe(false);
    expect((await listFreshCandidates(client, { includeDisabledSources: true })).some((i) => i.source.domain === "espn.com")).toBe(true);
  });

  it("carries the classification signals for debugging", async () => {
    await seed();
    const [first] = await listFreshCandidates(client, { sport: "basketball", minConfidence: "high" });
    expect(first.signals.length).toBeGreaterThan(0);
    expect(first.url).toMatch(/^https:\/\//);
  });
});

describe("headline-group readiness query (clustering input)", () => {
  it("surfaces group counts, seen window, sports, and the root candidate", async () => {
    const run = await openRun(client, fakeUnitProvider({}));
    const headline = "Shared wire headline about a regional derby result";
    await ingestBatch(client, {
      runId: run,
      candidates: [
        makeCandidate({ url: "https://a.example/1", headline, queryProfileSport: "football" }),
        makeCandidate({ url: "https://b.example/1", headline, queryProfileSport: "football" }),
        makeCandidate({ url: "https://c.example/1", headline, queryProfileSport: "soccer" }),
        makeCandidate({ url: "https://d.example/1", headline: "A headline carried by a single outlet only", queryProfileSport: "baseball" }),
      ],
      rejected: [],
    });

    const groups = await listHeadlineGroupInputs(client, { minSources: 2 });
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group).toMatchObject({ headlineKind: "publisher-title", sourceCount: 3, candidateCount: 3, providerCount: 1, sport: "football" });
    expect(group.sports.sort()).toEqual(["football", "soccer"]);
    expect(group.lastSeenAt.getTime()).toBeGreaterThanOrEqual(group.firstSeenAt.getTime());
    const rootStatus = await scalar<string>("select status from news_candidates where id = $1", [group.rootCandidateId]);
    expect(rootStatus).toBe("new");
    expect(await scalar<number>("select count(*)::int from news_candidates where headline_primary_id = $1", [group.rootCandidateId])).toBe(2);

    expect((await listHeadlineGroupInputs(client, { sport: "baseball" }))).toHaveLength(1);
    expect((await listHeadlineGroupInputs(client, { seenSince: new Date(Date.now() + 3_600_000) }))).toEqual([]);
  });

  it("keeps provider discovery text out of the default group input", async () => {
    const run = await openRun(client, fakeFeedProvider("wikipedia-events", { status: "ok" }));
    await ingestBatch(client, {
      runId: run,
      candidates: [makeCandidate({ provider: "wikipedia-events", url: "https://w.example/1", headline: "An event sentence written by editors.", queryProfileSport: undefined, queryProfileLabel: "current-events" })],
      rejected: [],
    });
    expect(await listHeadlineGroupInputs(client)).toEqual([]);
    expect((await listHeadlineGroupInputs(client, { headlineKind: "discovery-text" }))).toHaveLength(1);
  });
});

describe("engine config coverage", () => {
  it("has a provider row created on demand for every scheduled provider that runs", async () => {
    expect(ENGINE_PROVIDERS.filter((c) => c.scheduleClass !== "manual-only").map((c) => c.providerId)).toEqual(["gdelt-gkg", "wikipedia-events", "newsdata"]);
  });
});
