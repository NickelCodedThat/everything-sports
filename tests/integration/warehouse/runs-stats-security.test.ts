import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runWarehouseIngestion } from "@/lib/news/warehouse/ingest";
import { getRun } from "@/lib/news/warehouse/ingestion-runs";
import { getWarehouseStats } from "@/lib/news/warehouse/stats";
import { ProviderNotAllowedError, setProviderStatus, syncProvider } from "@/lib/news/warehouse/providers";
import { localCandidateProvider } from "@/lib/news/providers";
import { ProviderRateLimitedError } from "@/lib/news/errors";
import { INTAKE_REJECT_REASONS } from "@/lib/news/filters/intake";
import { fakeFeedProvider, fakeUnitProvider, makeCandidate, makeClient, pool, resetWarehouse, scalar } from "./helpers";

const client = makeClient();
beforeEach(resetWarehouse);
afterAll(() => pool.end());

const run = (provider: Parameters<typeof runWarehouseIngestion>[1]["provider"]) =>
  runWarehouseIngestion(client, { provider, window: "2h", limit: 25, trigger: "test" });

describe("ingestion-run lifecycle", () => {
  it("records a successful unit run with counts, and a rerun skips every stored unit without touching the provider's fetch", async () => {
    const units = {
      "gdelt-gkg:20260920100000": [makeCandidate({ url: "https://r.example/1", headline: "Run lifecycle story one about a walk-off" }), makeCandidate({ url: "https://r.example/2", headline: "Run lifecycle story two about a shutout" })],
      "gdelt-gkg:20260920101500": [makeCandidate({ url: "https://r.example/3", headline: "Run lifecycle story three about a trade" })],
    };
    const first = await run(fakeUnitProvider(units));

    expect(first.run).toMatchObject({ status: "succeeded", provider_state: "ok", records_returned: 3, records_accepted: 3, records_inserted: 3, units_processed: 2, units_skipped: 0, trigger: "test", window_label: "2h" });
    expect(first.run.finished_at).not.toBeNull();

    let fetched = 0;
    const counting = fakeUnitProvider(units);
    const inner = counting.units!.fetch;
    counting.units!.fetch = async (key) => { fetched += 1; return inner(key); };
    const second = await run(counting);

    expect(fetched).toBe(0);
    expect(second.run).toMatchObject({ status: "succeeded", records_inserted: 0, units_processed: 0, units_skipped: 2 });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(3);
  });

  it("overlapping windows only process the new units and never duplicate canonical rows", async () => {
    const shared = makeCandidate({ url: "https://overlap.example/shared", headline: "Story that appears in two overlapping files" });
    await run(fakeUnitProvider({ "gdelt-gkg:20260920110000": [shared] }));
    const second = await run(fakeUnitProvider({
      "gdelt-gkg:20260920110000": [shared],
      "gdelt-gkg:20260920111500": [makeCandidate({ url: "https://overlap.example/shared", headline: "Story that appears in two overlapping files" }), makeCandidate({ url: "https://overlap.example/new", headline: "Genuinely new story in the newer file" })],
    }));
    expect(second.run).toMatchObject({ units_processed: 1, units_skipped: 1, records_inserted: 1, records_duplicate_url: 1 });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(2);
    expect(await scalar("select count(*)::int from candidate_ingestion_events")).toBe(3);
  });

  it("marks a run 'partial' when one unit fails but others land, keeping the good data", async () => {
    const report = await run(fakeUnitProvider({
      "gdelt-gkg:20260920120000": [makeCandidate({ url: "https://p.example/ok", headline: "The unit that lands before the failure" })],
      "gdelt-gkg:20260920121500": new Error("network reset by peer"),
    }));
    expect(report.run.status).toBe("partial");
    expect(report.run.provider_state).toBe("ok");
    expect(report.run.error_message).toMatch(/20260920121500.*network reset/);
    expect(await scalar("select count(*)::int from news_candidates")).toBe(1);
  });

  it("marks a run 'failed'/throttled when the provider is rate limited before any unit lands, and stores nothing", async () => {
    const report = await run(fakeUnitProvider({ "gdelt-gkg:20260920130000": new ProviderRateLimitedError("HTTP 429") }));
    expect(report.run).toMatchObject({ status: "failed", provider_state: "throttled", units_processed: 0 });
    expect(report.run.error_message).toMatch(/429/);
    expect(await scalar("select count(*)::int from news_candidates")).toBe(0);
  });

  it("leaves a not-yet-published unit unclaimed so a later run can take it", async () => {
    await run(fakeUnitProvider({ "gdelt-gkg:20260920140000": null }));
    expect(await scalar("select count(*)::int from news_ingestion_units")).toBe(0);
    const later = await run(fakeUnitProvider({ "gdelt-gkg:20260920140000": [makeCandidate({ url: "https://late.example/1", headline: "Published after the first attempt" })] }));
    expect(later.run.records_inserted).toBe(1);
  });

  it("closes feed-provider runs as failed for unavailable / error providers and as succeeded+empty for empty ones", async () => {
    const unavailable = await run(fakeFeedProvider("newsdata", { status: "unavailable", message: "missing NEWSDATA_API_KEY" }));
    expect(unavailable.run).toMatchObject({ status: "failed", provider_state: "unavailable" });
    expect(unavailable.run.error_message).toMatch(/NEWSDATA_API_KEY/);

    const errored = await run(fakeFeedProvider("wikipedia-events", { status: "error", message: "boom" }));
    expect(errored.run).toMatchObject({ status: "failed", provider_state: "error" });

    const empty = await run(fakeFeedProvider("wikipedia-events", { status: "ok", candidates: [] }));
    expect(empty.run).toMatchObject({ status: "succeeded", provider_state: "empty", records_inserted: 0 });
    expect(await scalar("select count(*)::int from ingestion_runs")).toBe(3);
  });

  it("persists Wikipedia Current Events as discovery text — never publication-ready — with provider identity intact", async () => {
    const wikiCandidate = makeCandidate({
      provider: "wikipedia-events",
      url: "https://publisher.example/sports/event-story",
      publisherName: "Example Wire",
      headline: "In basketball, a fictional player sets a fictional record in a fictional league.",
      queryProfileSport: undefined,
      queryProfileLabel: "current-events",
    });
    const report = await run(fakeFeedProvider("wikipedia-events", { status: "ok", candidates: [wikiCandidate] }));
    expect(report.run.records_inserted).toBe(1);
    const row = await pool.query(
      `select c.headline_kind, c.status, p.provider_key, s.display_name from news_candidates c
       join news_providers p on p.id = c.provider_id join news_sources s on s.id = c.source_id`,
    );
    expect(row.rows[0]).toEqual({ headline_kind: "discovery-text", status: "new", provider_key: "wikipedia-events", display_name: "Example Wire" });
  });

  it("refuses to run a provider that is not policy-approved", async () => {
    await expect(run(localCandidateProvider)).rejects.toBeInstanceOf(ProviderNotAllowedError);
    // GNews has a policy record but is rejected; it must not be able to feed the warehouse either.
    await expect(run({ ...fakeFeedProvider("newsdata", { status: "ok" }), id: "gnews" as never })).rejects.toBeInstanceOf(ProviderNotAllowedError);
    expect(await scalar("select count(*)::int from ingestion_runs")).toBe(0);
  });

  it("refuses to run a provider disabled in the database, and keeps that switch across provider syncs", async () => {
    const provider = fakeFeedProvider("newsdata", { status: "ok" });
    await syncProvider(client, provider);
    await setProviderStatus(client, "newsdata", "disabled");
    await expect(run(provider)).rejects.toBeInstanceOf(ProviderNotAllowedError);
    expect(await scalar("select status from news_providers where provider_key = 'newsdata'")).toBe("disabled");
  });

  it("syncs descriptive provider fields from code without duplicating the row", async () => {
    const provider = fakeFeedProvider("newsdata", { status: "ok" });
    await syncProvider(client, provider);
    await syncProvider(client, { ...provider, displayName: "Renamed" });
    expect(await scalar("select count(*)::int from news_providers")).toBe(1);
    expect(await scalar("select display_name from news_providers")).toBe("Renamed");
    expect(await scalar("select policy_status from news_providers")).toBe("approved");
  });

  it("can read a run back by id", async () => {
    const report = await run(fakeFeedProvider("wikipedia-events", { status: "ok" }));
    expect((await getRun(client, report.run.id))?.id).toBe(report.run.id);
  });
});

describe("warehouse stats", () => {
  it("answers totals, by-sport/provider/quality, rejections by reason, latest run, duplicate rate and 24h volume", async () => {
    const headline = "Shared wire headline carried by several outlets";
    const gkgCandidates = [
      makeCandidate({ url: "https://www.espn.com/a", headline: "Basketball style story one for stats", queryProfileSport: "basketball" }),
      makeCandidate({ url: "https://one.example/w", headline }),
      makeCandidate({ url: "https://two.example/w", headline }),
      makeCandidate({ url: "https://three.example/w", headline }),
      makeCandidate({ url: "https://four.example/old", headline: "Older story outside the recent window" }),
    ];
    await run(fakeUnitProvider({ "gdelt-gkg:20260920150000": [...gkgCandidates, makeCandidate({ url: "https://tips.example/parlay", headline: "Parlay and best bets for the weekend slate" })] }));
    await run(fakeFeedProvider("wikipedia-events", { status: "ok", candidates: [makeCandidate({ provider: "wikipedia-events", url: "https://wire.example/e", headline: "An event sentence about a tournament.", queryProfileSport: undefined, queryProfileLabel: "current-events" })] }));
    await pool.query("update news_candidates set discovered_at = now() - interval '3 days' where normalized_source_url = 'https://four.example/old'");

    const stats = await getWarehouseStats(client);

    expect(stats.total_candidates).toBe(6);
    expect(stats.distinct_headlines).toBe(4);
    expect(stats.duplicate_headline_candidates).toBe(2);
    expect(stats.duplicate_headline_rate).toBeCloseTo(2 / 6, 3);
    expect(stats.new_in_recent_window).toBe(5);
    expect(stats.by_provider).toEqual({ "gdelt-gkg": 5, "wikipedia-events": 1 });
    expect(stats.by_sport.basketball).toBe(1);
    expect(stats.by_source_quality.known).toBe(1);
    expect(stats.rejections_by_reason).toEqual({ "betting-or-fantasy": 1 });
    expect(stats.rejections_total).toBe(1);
    expect(stats.top_headline_groups[0]).toMatchObject({ source_count: 3, candidate_count: 3 });
    expect(stats.latest_run?.provider_key).toBe("wikipedia-events");
    expect(stats.runs_by_status).toEqual({ succeeded: 2 });
    expect(stats.total_observations).toBe(6);
  });

  it("returns clean zeros on an empty warehouse", async () => {
    const stats = await getWarehouseStats(client);
    expect(stats).toMatchObject({ total_candidates: 0, duplicate_headline_rate: 0, latest_run: null, by_sport: {} });
  });
});

describe("schema, constraints and security (live database)", () => {
  const TABLES = ["news_providers", "news_sources", "ingestion_runs", "news_ingestion_units", "news_candidates", "candidate_ingestion_events", "candidate_rejections"];

  it("has RLS enabled and no policies on every warehouse table", async () => {
    const { rows } = await pool.query("select relname, relrowsecurity from pg_class where relname = any($1) and relkind = 'r'", [TABLES]);
    expect(rows).toHaveLength(TABLES.length);
    expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    expect(await scalar("select count(*)::int from pg_policies where schemaname = 'public'")).toBe(0);
  });

  it.each(["anon", "authenticated"])("denies %s any read or write on the warehouse and execution of its functions", async (role) => {
    const conn = await pool.connect();
    try {
      for (const table of TABLES) {
        await conn.query("begin");
        await conn.query(`set local role ${role}`);
        await expect(conn.query(`select * from public.${table} limit 1`)).rejects.toThrow(/permission denied/);
        await conn.query("rollback");
      }
      await conn.query("begin");
      await conn.query(`set local role ${role}`);
      await expect(conn.query("select public.news_warehouse_stats()")).rejects.toThrow(/permission denied/);
      await conn.query("rollback");
      await conn.query("begin");
      await conn.query(`set local role ${role}`);
      await expect(conn.query("select * from public.news_headline_groups")).rejects.toThrow(/permission denied/);
      await conn.query("rollback");
    } finally {
      conn.release();
    }
  });

  it("enforces the dedupe keys with database constraints, not application checks", async () => {
    const idx = await pool.query("select indexname, indexdef from pg_indexes where schemaname = 'public'");
    const defs = idx.rows.map((r) => r.indexdef as string).join("\n");
    expect(defs).toMatch(/UNIQUE INDEX .*news_candidates.*normalized_source_url/);
    expect(defs).toMatch(/UNIQUE INDEX news_candidates_provider_item_uidx .*\(provider_id, provider_item_id\)/);
    expect(defs).toMatch(/UNIQUE INDEX news_candidates_headline_root_uidx .*\(headline_kind, normalized_headline\)/);
    expect(defs).toMatch(/UNIQUE INDEX news_ingestion_units_unit_key_key/);
    expect(defs).toMatch(/UNIQUE INDEX .*news_sources_domain_key/);
    expect(defs).toMatch(/UNIQUE INDEX candidate_ingestion_events_\w+ ON .*\(candidate_id, ingestion_run_id, unit_key\)/);
    expect(defs).toMatch(/UNIQUE INDEX candidate_rejections_provider_id_fingerprint_key/);
  });

  it("rejects malformed rows at the database boundary", async () => {
    await pool.query("insert into news_providers (provider_key, display_name, expected_freshness, policy_status) values ('t','t','unknown','approved')");
    await expect(pool.query("insert into news_sources (domain, display_name) values ('WWW.Bad.com','x')")).rejects.toThrow(/check constraint/);
    await expect(pool.query("insert into news_sources (domain, display_name, quality_bucket) values ('ok.com','x','stellar')")).rejects.toThrow(/check constraint/);
    await expect(pool.query("insert into news_providers (provider_key, display_name, expected_freshness, policy_status, status) values ('t2','t','unknown','approved','weird')")).rejects.toThrow(/check constraint/);
  });

  it("stays in sync with the intake filter's rejection reasons", async () => {
    const { rows } = await pool.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.candidate_rejections'::regclass and contype = 'c'`,
    );
    const defs = rows.map((r) => r.def as string).join("\n");
    for (const reason of INTAKE_REJECT_REASONS) expect(defs).toContain(`'${reason}'`);
    expect(defs).toContain("'disabled-source'");
  });
});
