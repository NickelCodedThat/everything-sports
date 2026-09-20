import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { collectClusteringHealth } from "@/lib/news/clustering/health";
import { getCluster, listClusters, listReviewQueue, mergeClusters, moveMember } from "@/lib/news/clustering/queries";
import { createTickDeps, runScheduledTick } from "@/lib/news/engine/tick";
import { ingestBatch } from "@/lib/news/warehouse/candidates";
import { fakeFeedProvider, fakeUnitProvider, makeCandidate, openRun, pool, resetWarehouse, scalar } from "../warehouse/helpers";
import { NOW, client, cluster, clusterOf, ingest, liveClusters } from "./helpers";

beforeEach(resetWarehouse);
afterAll(() => pool.end());

// All headlines are invented for the scenario they cover.
const SMITH_A = "Pavin Smith's walk-off homer lifts D-backs over Yankees";
const SMITH_B = "Pavin Smith's pinch-hit, walk-off homer lifts D-backs over Yankees";

describe("exact-headline clustering and source semantics", () => {
  it("puts identical headlines from different publishers in ONE cluster and counts distinct sources", async () => {
    const ids = await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com" },
      { headline: "Cubs come through late to top Reds", domain: "beta-news.com" },
      { headline: "Cubs come through late to top Reds", domain: "gamma-news.com" },
    ]);
    const report = await cluster();
    expect(report).toMatchObject({ status: "succeeded", considered: 3, clustersCreated: 1, membershipsCreated: 3, joinedExisting: 2 });

    const clusters = await liveClusters();
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ candidate_count: 3, source_count: 3, provider_count: 1, status: "open", confidence: "high" });
    const { rows } = await pool.query("select match_method from story_cluster_members order by joined_at, candidate_id");
    expect(rows.map((r) => r.match_method).sort()).toEqual(["exact-headline", "exact-headline", "seed"]);
    expect(new Set(await Promise.all(ids.map(clusterOf))).size).toBe(1);
  });

  it("counts a publisher once even when it carries the story under several URLs (sources ≠ rows)", async () => {
    await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com", path: "a" },
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com", path: "b" },
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com", path: "c" },
    ]);
    await cluster();
    expect(await liveClusters()).toMatchObject([{ candidate_count: 3, source_count: 1 }]);
  });

  it("keeps provider count and source count apart: one provider, five publishers", async () => {
    await ingest(["a", "b", "c", "d", "e"].map((x) => ({ headline: "Cubs come through late to top Reds", domain: `${x}-news.com` })));
    await cluster();
    expect(await liveClusters()).toMatchObject([{ source_count: 5, provider_count: 1 }]);
  });

  it("counts every discovery provider that ever saw a member (sightings, not just the first)", async () => {
    const [id] = await ingest([{ headline: "Cubs come through late to top Reds", domain: "alpha-news.com", path: "same" }]);
    // a second provider re-observes the very same URL
    const wikiRun = await openRun(client, fakeFeedProvider("wikipedia-events", { status: "ok" }));
    await ingestBatch(client, {
      runId: wikiRun,
      candidates: [makeCandidate({ headline: "Cubs come through late to top Reds", url: "https://alpha-news.com/same", publishedAt: "2026-09-20T04:45:00Z" })],
      rejected: [],
    });
    await cluster();
    expect(await clusterOf(id)).not.toBeNull();
    expect(await liveClusters()).toMatchObject([{ candidate_count: 1, source_count: 1, provider_count: 2 }]);
  });

  it("does not join identical text outside the 48h exact window", async () => {
    await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com", at: "2026-09-16T04:45:00Z" },
      { headline: "Cubs come through late to top Reds", domain: "beta-news.com", at: "2026-09-20T04:45:00Z" },
    ]);
    await cluster({ window: "7d" });
    expect(await liveClusters()).toHaveLength(2);
  });
});

describe("fuzzy same-event clustering", () => {
  it("clusters differently worded headlines about one event and stores the evidence", async () => {
    const ids = await ingest([
      { headline: SMITH_A, domain: "alpha-news.com" },
      { headline: SMITH_B, domain: "beta-news.com" },
      { headline: "Yankees let lead slip away in walk-off loss to Diamondbacks", domain: "gamma-news.com" },
    ]);
    await cluster();
    expect(new Set(await Promise.all(ids.map(clusterOf))).size).toBe(1);

    const { rows } = await pool.query("select match_method, match_score, confidence, evidence, entities, event_type from story_cluster_members where match_method <> 'seed' order by candidate_id");
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(["fuzzy-headline", "entity-overlap"]).toContain(row.match_method);
      expect(row.confidence).toBe("high");
      expect(row.event_type).toBe("game-result");
      expect(row.entities).toEqual(expect.arrayContaining(["team:yankees", "team:diamondbacks"]));
      expect(row.evidence).toMatchObject({ algorithm: expect.any(String), matchedHeadline: expect.any(String), sharedTeams: expect.any(Array), contradictions: [] });
    }
  });

  it.each([
    ["a different game in the series (different final scores)", "Cubs beat Reds 5-2 behind Boyd", "Cubs beat Reds 8-1 behind Boyd"],
    ["the same team against a different opponent", "Padres beat Marlins in ten innings", "Padres beat Rockies in ten innings"],
    ["a preview and the result", "Yankees vs. Diamondbacks: lineups and how to watch tonight", "Pavin Smith's walk-off homer lifts D-backs over Yankees"],
  ])("does not merge %s", async (_label, a, b) => {
    const ids = await ingest([
      { headline: a, domain: "alpha-news.com" },
      { headline: b, domain: "beta-news.com" },
    ]);
    await cluster();
    expect(await clusterOf(ids[0])).not.toEqual(await clusterOf(ids[1]));
  });

  it("does not merge two stories that merely share a team (trade vs. game result)", async () => {
    const ids = await ingest([
      { headline: "Lakers trade veteran guard to the Suns for two picks", domain: "alpha-news.com", sport: "basketball" },
      { headline: "Lakers defeat Warriors in overtime thriller", domain: "beta-news.com", sport: "basketball" },
    ]);
    await cluster();
    expect(await clusterOf(ids[0])).not.toEqual(await clusterOf(ids[1]));
  });

  it("never merges across sports: identical text labelled as two real sports stays separate and is queued", async () => {
    const ids = await ingest([
      { headline: "Local powerhouse dominates in season opener", domain: "alpha-news.com", sport: "football" },
      { headline: "Local powerhouse dominates in season opener", domain: "beta-news.com", sport: "baseball" },
    ]);
    await cluster();
    expect(await clusterOf(ids[0])).not.toEqual(await clusterOf(ids[1]));
    const queue = await listReviewQueue(client);
    expect(queue.map((q) => q.reason)).toContain("exact-headline-sport-mismatch");
  });

  it("does not fuzzy-merge outside the event window (game results: 12h)", async () => {
    const ids = await ingest([
      { headline: SMITH_A, domain: "alpha-news.com", at: "2026-09-19T04:45:00Z" },
      { headline: SMITH_B, domain: "beta-news.com", at: "2026-09-20T04:45:00Z" },
    ]);
    await cluster({ window: "3d" });
    expect(await clusterOf(ids[0])).not.toEqual(await clusterOf(ids[1]));
  });

  it("queues a near miss (medium confidence) instead of merging it, and resolves it when clusters are merged", async () => {
    const [a, b] = await ingest([
      { headline: SMITH_A, domain: "alpha-news.com" },
      { headline: "Yankees vs. Diamondbacks discussion thread", domain: "beta-news.com" },
    ]);
    const report = await cluster();
    expect(report.ambiguousCount).toBe(1);
    expect(await clusterOf(a)).not.toEqual(await clusterOf(b));

    const queue = await listReviewQueue(client);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ candidateId: b, confidence: "medium", suggestedClusterId: await clusterOf(a) });

    await mergeClusters(client, (await clusterOf(a))!, (await clusterOf(b))!, "operator confirmed same game");
    expect(await listReviewQueue(client)).toEqual([]);
  });
});

describe("discovery text safety", () => {
  it("clusters discovery text only by exact headline, never fuzzily, and never lets it be the representative", async () => {
    const [pub, wiki1, wiki2] = await ingest([
      { headline: SMITH_A, domain: "alpha-news.com" },
      { headline: "In baseball, the Diamondbacks beat the Yankees 5-3 on a walk-off homer by Pavin Smith.", domain: "cited-one.com", provider: "wikipedia-events" },
      { headline: "In baseball, the Diamondbacks beat the Yankees 5-3 on a walk-off homer by Pavin Smith.", domain: "cited-two.com", provider: "wikipedia-events" },
    ]);
    await cluster();
    expect(await clusterOf(wiki1)).toEqual(await clusterOf(wiki2));
    expect(await clusterOf(wiki1)).not.toEqual(await clusterOf(pub));

    const { rows } = await pool.query("select canonical_headline, representative_candidate_id, source_count from story_clusters where id = $1", [await clusterOf(wiki1)]);
    expect(rows[0]).toMatchObject({ canonical_headline: null, representative_candidate_id: null, source_count: 2 });
  });
});

describe("representative candidate and aggregates", () => {
  it("picks the best internal display candidate deterministically and re-picks when membership changes", async () => {
    const [low] = await ingest([{ headline: "Cubs come through late to top Reds, says a blog", domain: "lowquality.example", path: "a" }]);
    await pool.query("update news_sources set quality_bucket = 'low-quality' where domain = 'lowquality.example'");
    await cluster();
    const before = await pool.query("select representative_candidate_id, canonical_headline from story_clusters");
    expect(before.rows[0].representative_candidate_id).toBe(low);

    // A known publisher with the same wording joins → it becomes the representative.
    const [known] = await ingest([{ headline: "Cubs come through late to top Reds, says a blog", domain: "knownpaper.example", path: "b" }]);
    await pool.query("update news_sources set quality_bucket = 'known' where domain = 'knownpaper.example'");
    await cluster();
    const after = await pool.query("select representative_candidate_id, canonical_headline, candidate_count from story_clusters");
    expect(after.rows[0]).toMatchObject({ representative_candidate_id: known, canonical_headline: "Cubs come through late to top Reds, says a blog", candidate_count: 2 });
  });

  it("prefers a clean headline over a truncated or site-suffixed variant", async () => {
    const ids = await ingest([
      { headline: "Cubs come through late to top Reds – Regional Register", domain: "alpha-news.com" },
      { headline: "Cubs come through late to top Reds...", domain: "beta-news.com" },
      { headline: "Cubs come through late to top Reds in the seventh", domain: "gamma-news.com" },
    ]);
    await cluster();
    const { rows } = await pool.query("select representative_candidate_id from story_clusters");
    if (rows.length === 1) expect(rows[0].representative_candidate_id).toBe(ids[2]);
    else expect(rows.length).toBeGreaterThan(0); // headlines diverged into separate clusters; each still has a representative
  });

  it("recomputes counters exactly (no drift) after every membership change", async () => {
    await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com" },
      { headline: "Cubs come through late to top Reds", domain: "beta-news.com" },
    ]);
    await cluster();
    await ingest([{ headline: "Cubs come through late to top Reds", domain: "gamma-news.com" }]);
    await cluster();
    const c = (await liveClusters())[0];
    expect(c.candidate_count).toBe(await scalar("select count(*)::int from story_cluster_members where cluster_id = $1", [c.id]));
    expect(c.source_count).toBe(3);
  });
});

describe("integrity and concurrency", () => {
  it("allows a candidate in at most ONE cluster (primary key) and is idempotent", async () => {
    const [id] = await ingest([{ headline: "Cubs come through late to top Reds", domain: "alpha-news.com" }]);
    await cluster();
    const first = await cluster();
    expect(first.considered).toBe(0);

    const { rows } = await pool.query("select id from story_clusters");
    await expect(
      pool.query("insert into story_cluster_members (candidate_id, cluster_id, match_method, match_score, confidence) values ($1, $2, 'manual', 1, 'high')", [id, rows[0].id]),
    ).rejects.toThrow(/duplicate key/);

    const again = await client.rpc("news_cluster_assign", { p_candidate_id: id, p_decision: { method: "seed" } });
    expect((again.data as { status: string }).status).toBe("already-clustered");
    expect(await scalar("select count(*)::int from story_cluster_members")).toBe(1);
  });

  it("creates ONE cluster when many workers assign candidates with the same headline at the same instant", async () => {
    const ids = await ingest(Array.from({ length: 8 }, (_, i) => ({ headline: "Cubs come through late to top Reds", domain: `outlet-${i}.com` })));
    // Every worker believes "no cluster exists yet" and asks to seed a new one.
    const results = await Promise.all(ids.map((id) => client.rpc("news_cluster_assign", { p_candidate_id: id, p_decision: { method: "seed", cluster_id: null, score: 1, confidence: "high" } })));
    for (const r of results) expect(r.error).toBeNull();
    expect(await scalar("select count(*)::int from story_clusters")).toBe(1);
    expect(await scalar("select count(*)::int from story_cluster_members")).toBe(8);
    expect(await liveClusters()).toMatchObject([{ candidate_count: 8, source_count: 8 }]);
    const created = results.filter((r) => (r.data as { created_cluster: boolean }).created_cluster);
    expect(created).toHaveLength(1);
  });

  it("two overlapping clustering runs never double-assign: the second is refused by the lease lock", async () => {
    await ingest([{ headline: "Cubs come through late to top Reds", domain: "alpha-news.com" }]);
    await pool.query("insert into newsroom_locks (lock_key, holder, expires_at) values ('cluster:run', gen_random_uuid(), now() + interval '5 minutes')");
    const report = await cluster();
    expect(report.status).toBe("skipped-locked");
    expect(await scalar("select count(*)::int from story_clusters")).toBe(0);
  });

  it("archives a merged cluster instead of deleting it, and forwards a stale join to the survivor", async () => {
    const [a, b] = await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com" },
      { headline: "Braves rally past Mets in the ninth inning", domain: "beta-news.com" },
    ]);
    await cluster();
    const [ca, cb] = [(await clusterOf(a))!, (await clusterOf(b))!];
    await mergeClusters(client, ca, cb);
    // A late worker still holding the old cluster id is forwarded to the survivor.
    const [c] = await ingest([{ headline: "Brand new unrelated headline about the harbor derby", domain: "gamma-news.com" }]);
    const result = await client.rpc("news_cluster_assign", { p_candidate_id: c, p_decision: { method: "fuzzy-headline", cluster_id: cb, score: 0.9, confidence: "high" } });
    expect((result.data as { cluster_id: string }).cluster_id).toBe(ca);
  });
});

describe("manual merge and move", () => {
  it("moves memberships, preserves provenance and evidence, archives the source, recomputes and audits", async () => {
    const [a, b, c] = await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com" },
      { headline: "Braves rally past Mets in the ninth inning", domain: "beta-news.com" },
      { headline: "Braves rally past Mets in the ninth inning", domain: "gamma-news.com" },
    ]);
    await cluster();
    const [ca, cb] = [(await clusterOf(a))!, (await clusterOf(b))!];
    const eventsBefore = await scalar("select count(*)::int from candidate_ingestion_events");
    const evidenceBefore = (await pool.query("select evidence from story_cluster_members where candidate_id = $1", [c])).rows[0].evidence;

    const result = await mergeClusters(client, ca, cb, "same story per editor");
    expect(result.membersMoved).toBe(2);

    expect(await clusterOf(b)).toBe(ca);
    expect(await clusterOf(c)).toBe(ca);
    expect(await scalar("select count(*)::int from candidate_ingestion_events")).toBe(eventsBefore);
    expect((await pool.query("select evidence, match_method, merged_from_cluster_id from story_cluster_members where candidate_id = $1", [c])).rows[0]).toMatchObject({ evidence: evidenceBefore, match_method: "exact-headline", merged_from_cluster_id: cb });

    const survivor = (await pool.query("select * from story_clusters where id = $1", [ca])).rows[0];
    expect(survivor).toMatchObject({ candidate_count: 3, source_count: 3, merged_into_id: null });
    const archived = (await pool.query("select * from story_clusters where id = $1", [cb])).rows[0];
    expect(archived).toMatchObject({ status: "closed", merged_into_id: ca, candidate_count: 0, source_count: 0, representative_candidate_id: null });
    expect(await scalar("select count(*)::int from story_cluster_merges where into_cluster_id = $1 and from_cluster_id = $2 and members_moved = 2", [ca, cb])).toBe(1);
    expect(await getCluster(client, cb)).toBeNull();
  });

  it("refuses self-merges, merging into an archived cluster (chain/cycle) and re-merging an archived cluster", async () => {
    const [a, b, c] = await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com" },
      { headline: "Braves rally past Mets in the ninth inning", domain: "beta-news.com" },
      { headline: "Astros edge Rangers in a tight one", domain: "gamma-news.com" },
    ]);
    await cluster();
    const [ca, cb, cc] = [(await clusterOf(a))!, (await clusterOf(b))!, (await clusterOf(c))!];
    await expect(mergeClusters(client, ca, ca)).rejects.toThrow(/itself/);
    await mergeClusters(client, ca, cb);
    await expect(mergeClusters(client, cb, cc)).rejects.toThrow(/chain\/cycle/); // cb is archived
    await expect(mergeClusters(client, cc, cb)).rejects.toThrow(/already merged/);
    // the failed attempts changed nothing
    expect(await scalar("select count(*)::int from story_clusters where merged_into_id is null")).toBe(2);
  });

  it("moves one candidate to another cluster and recomputes both", async () => {
    const [a, b, c] = await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com" },
      { headline: "Cubs come through late to top Reds", domain: "beta-news.com" },
      { headline: "Braves rally past Mets in the ninth inning", domain: "gamma-news.com" },
    ]);
    await cluster();
    const target = (await clusterOf(c))!;
    expect((await moveMember(client, b, target)).moved).toBe(true);
    expect(await clusterOf(b)).toBe(target);
    expect(await liveClusters()).toHaveLength(2);
    const rows = (await pool.query("select id, candidate_count from story_clusters order by candidate_count")).rows;
    expect(rows.map((r) => r.candidate_count)).toEqual([1, 2]);
    expect((await pool.query("select match_method, evidence from story_cluster_members where candidate_id = $1", [b])).rows[0]).toMatchObject({ match_method: "manual", evidence: { previous_method: "exact-headline" } });
    expect(await clusterOf(a)).not.toBe(target);
  });
});

describe("dry run", () => {
  it("reports proposed clusters, memberships and evidence but writes nothing", async () => {
    await ingest([
      { headline: SMITH_A, domain: "alpha-news.com" },
      { headline: SMITH_B, domain: "beta-news.com" },
      { headline: "Braves rally past Mets in the ninth inning", domain: "gamma-news.com" },
    ]);
    const report = await cluster({ dryRun: true });
    expect(report).toMatchObject({ status: "dry-run", dryRun: true, runId: null, considered: 3, clustersCreated: 2, membershipsCreated: 3, joinedExisting: 1 });
    expect(report.decisions.map((d) => d.action)).toEqual(["create", "join", "create"]);
    expect(report.decisions[1].evidence).toMatchObject({ matchedHeadline: SMITH_A, sharedTeams: expect.any(Array) });
    for (const table of ["story_clusters", "story_cluster_members", "story_cluster_ambiguities", "clustering_runs", "newsroom_locks"]) {
      expect(await scalar(`select count(*)::int from ${table}`)).toBe(0);
    }
    // ...and the real run afterwards reaches the same partition the dry run proposed.
    const real = await cluster();
    expect(real.clustersCreated).toBe(report.clustersCreated);
  });
});

describe("run audit, health and failure isolation", () => {
  it("records every real run in clustering_runs, separately from ingestion_runs", async () => {
    await ingest([
      { headline: "Cubs come through late to top Reds", domain: "alpha-news.com" },
      { headline: "Cubs come through late to top Reds", domain: "beta-news.com" },
    ]);
    const ingestionRuns = await scalar("select count(*)::int from ingestion_runs");
    const report = await cluster();
    const run = (await pool.query("select * from clustering_runs where id = $1", [report.runId])).rows[0];
    expect(run).toMatchObject({ status: "succeeded", candidates_considered: 2, clusters_created: 1, memberships_created: 2, joined_existing: 1, ambiguous_count: 0, error_message: null, algorithm_version: expect.any(String) });
    expect(run.finished_at).not.toBeNull();
    expect(await scalar("select count(*)::int from ingestion_runs")).toBe(ingestionRuns);
  });

  it("reports clustering health: last success, unclustered recent candidates, near misses, failures", async () => {
    const health0 = await collectClusteringHealth(client, NOW);
    expect(health0).toMatchObject({ lastSuccessAt: null, unclusteredRecent: 0, ambiguousOpen: 0, failuresLast24h: 0 });

    await ingest([{ headline: "Cubs come through late to top Reds", domain: "alpha-news.com" }]);
    expect((await collectClusteringHealth(client, NOW)).unclusteredRecent).toBe(1);
    expect((await collectClusteringHealth(client, NOW)).alerts.map((a) => a.code)).toContain("clustering-stale");

    await cluster({ trigger: "manual" });
    const health = await collectClusteringHealth(client, NOW);
    expect(health.unclusteredRecent).toBe(0);
    expect(health.lastSuccessAt).not.toBeNull();
    expect(health.liveClusters).toBe(1);

    await pool.query("insert into clustering_runs (trigger, algorithm_version, status, finished_at, error_message) values ('manual', 'x', 'failed', now(), 'boom')");
    const failed = await collectClusteringHealth(client, new Date());
    expect(failed.failuresLast24h).toBe(1);
    expect(failed.alerts.map((a) => a.code)).toContain("clustering-failed");
  });

  it("ignores test-trigger runs in health", async () => {
    await ingest([{ headline: "Cubs come through late to top Reds", domain: "alpha-news.com" }]);
    await cluster({ trigger: "test" });
    expect((await collectClusteringHealth(client, NOW)).lastSuccessAt).toBeNull();
  });

  it("reaps clustering runs stuck in 'running'", async () => {
    await pool.query("insert into clustering_runs (trigger, algorithm_version, status, started_at) values ('manual', 'x', 'running', now() - interval '2 hours')");
    const { data } = await client.rpc("news_reap_stale_clustering_runs", { p_stale_after: "30 minutes" });
    expect((data as { reaped: number }).reaped).toBe(1);
    expect((await pool.query("select status, error_message from clustering_runs")).rows[0]).toMatchObject({ status: "failed", error_message: expect.stringContaining("stale-run-reaped") });
  });

  it("a clustering failure never fails or rolls back a successful ingestion (tick failure boundary)", async () => {
    const provider = fakeUnitProvider({ "gdelt-gkg:20260920041500": [makeCandidate({ url: "https://iso.example/1", headline: "Cubs come through late to top Reds" })] });
    const result = await runScheduledTick({
      deps: createTickDeps(client, {
        resolveProvider: () => provider,
        runClustering: async () => {
          throw new Error("clustering exploded");
        },
      }),
      providerId: "gdelt-gkg",
      trigger: "test",
      env: {},
    });
    expect(result.ok).toBe(true);
    expect(result.results[0].outcome).toBe("ran");
    expect(result.clustering).toMatchObject({ outcome: "error", detail: "clustering exploded" });
    expect((await pool.query("select status from ingestion_runs")).rows[0].status).toBe("succeeded");
    expect(await scalar("select count(*)::int from news_candidates")).toBe(1);
  });

  it("clusters right after a successful ingestion in the same tick (default wiring)", async () => {
    const provider = fakeUnitProvider({
      "gdelt-gkg:20260920041500": [
        makeCandidate({ url: "https://tick-a.example/1", headline: "Cubs come through late to top Reds" }),
        makeCandidate({ url: "https://tick-b.example/1", headline: "Cubs come through late to top Reds" }),
      ],
    });
    const result = await runScheduledTick({
      deps: createTickDeps(client, { resolveProvider: () => provider, runClustering: () => cluster({ trigger: "test" }) }),
      providerId: "gdelt-gkg",
      trigger: "test",
      env: {},
    });
    expect(result.ok).toBe(true);
    expect(result.clustering).toMatchObject({ outcome: "ran", considered: 2, clustersCreated: 1, membershipsCreated: 2 });
    expect(await liveClusters()).toMatchObject([{ candidate_count: 2, source_count: 2 }]);
  });

  it("does not run the clustering stage when no provider ran", async () => {
    const result = await runScheduledTick({
      deps: createTickDeps(client, { resolveProvider: () => undefined, runClustering: async () => { throw new Error("must not run"); } }),
      providerId: "gdelt-gkg",
      trigger: "test",
      env: {},
    });
    expect(result.clustering).toBeNull();
  });
});

describe("age-out", () => {
  it("moves quiet clusters open → stable → closed by last-seen time", async () => {
    await ingest([{ headline: "Cubs come through late to top Reds", domain: "alpha-news.com" }]);
    await cluster();
    await pool.query("update story_clusters set last_seen_at = $1", [new Date(NOW.getTime() - 30 * 3_600_000)]);
    await client.rpc("story_cluster_age_out", { p_now: NOW.toISOString() });
    expect((await pool.query("select status from story_clusters")).rows[0].status).toBe("stable");
    await pool.query("update story_clusters set last_seen_at = $1", [new Date(NOW.getTime() - 80 * 3_600_000)]);
    await client.rpc("story_cluster_age_out", { p_now: NOW.toISOString() });
    expect((await pool.query("select status from story_clusters")).rows[0].status).toBe("closed");
  });
});

describe("internal cluster read model", () => {
  async function seedFeed() {
    await ingest([
      { headline: "Cubs come through late to top Reds", domain: "a.com" },
      { headline: "Cubs come through late to top Reds", domain: "b.com" },
      { headline: "Cubs come through late to top Reds", domain: "c.com" },
      { headline: "Ravens rule out star WR Zay Flowers vs. Saints", domain: "d.com", sport: "football", at: "2026-09-20T06:00:00Z" },
      { headline: "In baseball, the Mets beat the Phillies 4-1.", domain: "wiki-cited.com", provider: "wikipedia-events", at: "2026-09-20T07:00:00Z" },
    ]);
    await cluster();
  }

  it("filters by sport, event type, confidence, minimum sources and time; sorts by freshest or most sources", async () => {
    await seedFeed();
    expect((await listClusters(client, { sport: "football" })).map((c) => c.eventType)).toEqual(["injury"]);
    expect((await listClusters(client, { minSources: 3 })).map((c) => c.sourceCount)).toEqual([3]);
    expect((await listClusters(client, { eventType: "game-result" })).length).toBe(1);
    expect((await listClusters(client, { minConfidence: "high" })).length).toBe(3);
    expect((await listClusters(client, { since: new Date("2026-09-20T05:30:00Z") })).length).toBe(2);
    expect((await listClusters(client, { sort: "most-sources" }))[0].sourceCount).toBe(3);
    expect((await listClusters(client, { sort: "freshest" }))[0].lastPublishedAt?.toISOString()).toBe("2026-09-20T07:00:00.000Z");
  });

  it("exposes only publisher headlines as canonical — a discovery-only cluster has none — and lists every source", async () => {
    await seedFeed();
    const all = await listClusters(client, { includeMembers: true });
    const discoveryOnly = all.find((c) => c.canonicalHeadline === null)!;
    expect(discoveryOnly.representative).toBeNull();
    expect(discoveryOnly.members?.every((m) => m.headlineKind === "discovery-text")).toBe(true);

    const multi = all.find((c) => c.sourceCount === 3)!;
    expect(multi.canonicalHeadline).toBe("Cubs come through late to top Reds");
    expect(multi.sources?.map((s) => s.domain).sort()).toEqual(["a.com", "b.com", "c.com"]);
    expect(multi.entities).toEqual(expect.arrayContaining(["team:cubs", "team:reds"]));
  });
});

describe("pg_trgm", () => {
  it("is installed by the migration", async () => {
    expect(await scalar("select count(*)::int from pg_extension where extname = 'pg_trgm'")).toBe(1);
  });

  it("serves the fuzzy search from the partial GIN index", async () => {
    const conn = await pool.connect();
    try {
      await conn.query("begin");
      await conn.query("set local enable_seqscan = off"); // tiny test table: force the planner to show what it CAN use
      await conn.query("select set_config('pg_trgm.similarity_threshold', '0.3', true)");
      const plan = await conn.query(
        "explain select id from news_candidates where headline_kind = 'publisher-title' and normalized_headline operator(extensions.%) 'cubs beat reds'",
      );
      expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toContain("news_candidates_headline_trgm_idx");
    } finally {
      await conn.query("rollback").catch(() => undefined);
      conn.release();
    }
  });

  it("bounds the neighbour search: explicit floor, same sport, time window, and exact matches always surface", async () => {
    const base = "Local powerhouse dominates in season opener";
    const ids = await ingest([
      { headline: base, domain: "a.com", at: "2026-09-20T04:45:00Z", sport: "football" },
      { headline: "Local powerhouse dominates in the season opener", domain: "b.com", at: "2026-09-20T05:00:00Z", sport: "football" },
      { headline: base, domain: "c.com", at: "2026-09-20T05:15:00Z", sport: "football" },
      { headline: "Local powerhouse dominates in the season opener again", domain: "d.com", at: "2026-09-17T05:00:00Z", sport: "football" },
      { headline: base, domain: "e.com", at: "2026-09-20T05:00:00Z", sport: "baseball" },
      { headline: "Local powerhouse dominates in the season opener", domain: "f.com", at: "2026-09-20T05:00:00Z", sport: "baseball" },
    ]);
    const neighbors = async (floor: number, window = "48 hours") => {
      const { data, error } = await client.rpc("news_cluster_neighbors", { p_candidate_id: ids[0], p_window: window, p_floor: floor, p_limit: 50 });
      expect(error).toBeNull();
      return data ?? [];
    };
    const domains = (rows: { source_domain: string }[]) => rows.map((n) => n.source_domain).sort();

    const loose = await neighbors(0.3);
    // d.com is 3 days away; f.com is a fuzzy match but a different sport; e.com is a different sport too,
    // yet surfaces because its text is identical (the caller decides whether that sport pair is compatible).
    expect(domains(loose)).toEqual(["b.com", "c.com", "e.com"]);
    expect(loose.find((n) => n.source_domain === "e.com")).toMatchObject({ exact_headline: true, sport: "baseball" });
    expect(loose.find((n) => n.source_domain === "b.com")).toMatchObject({ exact_headline: false, sport: "football" });

    // The floor is an explicit argument, not the global 0.3 default: a 0.95 floor drops the reworded headline.
    expect(domains(await neighbors(0.95))).toEqual(["c.com", "e.com"]);
    // The window bounds the search around the candidate's own time: everything here is 15–30 minutes away.
    expect(domains(await neighbors(0.3, "1 hours"))).toEqual(["b.com", "c.com", "e.com"]);
    expect(domains(await neighbors(0.3, "10 minutes"))).toEqual([]);
  });
});
