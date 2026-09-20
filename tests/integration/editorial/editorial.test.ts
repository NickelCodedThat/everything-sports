import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runEditorialRanking } from "@/lib/news/editorial-ranking/run";
import {
  getItem,
  listItems,
  getSlate,
  getStoryPreview,
  getSupportingSources,
  setStatus,
  setOverride,
  removeOverride,
  getAudit,
} from "@/lib/news/editorial-ranking/queries";
import { collectEditorialHealth } from "@/lib/news/editorial-ranking/health";
import { mergeClusters } from "@/lib/news/clustering/queries";
import { createTickDeps, runScheduledTick } from "@/lib/news/engine/tick";
import {
  fakeUnitProvider,
  makeCandidate,
  pool,
  resetWarehouse,
  scalar,
} from "../warehouse/helpers";
import { client, cluster, ingest, NOW } from "../clustering/helpers";

beforeEach(resetWarehouse);
afterAll(() => pool.end());
const rank = () => runEditorialRanking(client, { now: NOW, trigger: "test" });
async function seed() {
  await ingest(
    ["alpha.example", "beta.example", "gamma.example"].map((domain) => ({
      headline: "Cubs rule out star pitcher with elbow injury",
      domain,
      at: "2026-09-20T11:30:00Z",
    })),
  );
  await cluster();
  const r = await rank();
  expect(r.status).toBe("succeeded");
  return (await listItems(client))[0];
}

describe("ranking persistence", () => {
  it("creates one item per cluster and idempotently updates its score", async () => {
    const item = await seed();
    const r = await rank();
    expect(r).toMatchObject({
      itemsCreated: 0,
      itemsUpdated: 1,
      status: "succeeded",
    });
    expect(await scalar("select count(*)::int from editorial_items")).toBe(1);
    expect((await getItem(client, item.id))?.score).toBe(item.score);
    await expect(
      pool.query(
        "insert into editorial_items(cluster_id,sport) values($1,'baseball')",
        [item.clusterId],
      ),
    ).rejects.toThrow(/duplicate/);
  });
  it("audits every successful run", async () => {
    await seed();
    await rank();
    const { rows } = await pool.query(
      "select status,clusters_considered,items_created,items_updated,finished_at from editorial_ranking_runs order by started_at",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      status: "succeeded",
      clusters_considered: 1,
      items_created: 1,
    });
    expect(rows[1].items_updated).toBe(1);
    expect(rows[1].finished_at).not.toBeNull();
  });
  it("dry run writes no runs, items, or locks", async () => {
    await ingest([
      {
        headline: "Cubs rule out pitcher with elbow injury",
        domain: "alpha.example",
      },
    ]);
    await cluster();
    const r = await runEditorialRanking(client, { now: NOW, dryRun: true });
    expect(r.status).toBe("dry-run");
    expect(r.considered).toBe(1);
    for (const table of [
      "editorial_items",
      "editorial_ranking_runs",
      "newsroom_locks",
    ])
      expect(await scalar(`select count(*)::int from ${table}`)).toBe(0);
  });
  it("overlapping ranking is skipped without an audit run", async () => {
    await pool.query(
      "insert into newsroom_locks(lock_key,holder,expires_at) values('rank:run',gen_random_uuid(),now()+interval '5 minutes')",
    );
    expect((await rank()).status).toBe("skipped-locked");
    expect(
      await scalar("select count(*)::int from editorial_ranking_runs"),
    ).toBe(0);
  });
  it("closes merged items and keeps their audit history", async () => {
    const first = await seed();
    await ingest([
      {
        headline: "Braves sign veteran catcher to new contract",
        domain: "other.example",
        at: "2026-09-20T11:30:00Z",
      },
    ]);
    await cluster();
    await rank();
    const other = (await listItems(client)).find((i) => i.id !== first.id)!;
    await setOverride(client, other.id, { kind: "pin" });
    await mergeClusters(client, first.clusterId, other.clusterId);
    await rank();
    expect(await getItem(client, other.id)).toMatchObject({
      eligibility: "ineligible",
      rankPosition: null,
    });
    expect(await getAudit(client, other.id)).toHaveLength(1);
  });
  it("unranks items that leave the activity window", async () => {
    const item = await seed();
    await runEditorialRanking(client, {
      now: new Date("2026-09-24T12:00:00Z"),
      trigger: "test",
    });
    expect((await getItem(client, item.id))?.rankPosition).toBeNull();
    expect((await getSlate(client)).slate.sections.lead).toEqual([]);
  });
  it("records failures and releases its lease", async () => {
    await seed();
    await pool.query(
      "create function public.test_reject_rank() returns trigger language plpgsql as $$ begin raise exception 'synthetic ranking failure'; end $$; create trigger test_reject_rank before update on editorial_items for each row execute function public.test_reject_rank()",
    );
    try {
      const r = await rank();
      expect(r.status).toBe("failed");
      expect(r.errors[0]).toContain("synthetic ranking failure");
      expect(
        await scalar(
          "select count(*)::int from editorial_ranking_runs where status='failed'",
        ),
      ).toBe(1);
      expect(
        await scalar(
          "select count(*)::int from newsroom_locks where lock_key='rank:run'",
        ),
      ).toBe(0);
    } finally {
      await pool.query(
        "drop trigger test_reject_rank on editorial_items; drop function public.test_reject_rank()",
      );
    }
  });
});

describe("editor controls and lifecycle", () => {
  it.each(["pin", "boost", "suppress"] as const)(
    "applies and restores %s with an audit",
    async (kind) => {
      const item = await seed();
      const amount = kind === "boost" ? 75 : undefined;
      await setOverride(client, item.id, {
        kind,
        amount,
        reason: "synthetic review",
      });
      await rank();
      const changed = (await getItem(client, item.id))!;
      expect(changed.score - item.score).toBeCloseTo(
        kind === "pin" ? 1000 : kind === "boost" ? 75 : -80,
      );
      expect(await removeOverride(client, item.id, kind, "restore")).toBe(1);
      await rank();
      expect((await getItem(client, item.id))?.score).toBe(item.score);
      expect((await getAudit(client, item.id)).map((e) => e.action)).toEqual([
        "override-set",
        "override-removed",
      ]);
      expect(
        await scalar(
          "select count(*)::int from editorial_overrides where removed_at is not null",
        ),
      ).toBe(1);
    },
  );
  it("replacing an override preserves history and only one active value", async () => {
    const item = await seed();
    await setOverride(client, item.id, { kind: "boost", amount: 20 });
    await setOverride(client, item.id, { kind: "boost", amount: 40 });
    await rank();
    expect((await getItem(client, item.id))?.score).toBeCloseTo(
      item.score + 40,
    );
    expect(
      await scalar(
        "select count(*)::int from editorial_overrides where removed_at is null",
      ),
    ).toBe(1);
    expect(await scalar("select count(*)::int from editorial_overrides")).toBe(
      2,
    );
  });
  it.each(["held", "rejected"] as const)(
    "%s immediately removes slate/preview and blocks approval, release restores",
    async (status) => {
      const item = await seed();
      await setStatus(client, item.id, status, "editor decision");
      expect((await getSlate(client)).slate.sections.lead).toEqual([]);
      expect(
        await getStoryPreview(client, (await getItem(client, item.id))!),
      ).toBeNull();
      await expect(setStatus(client, item.id, "approved")).rejects.toThrow(
        /ineligible/,
      );
      await rank();
      expect((await getItem(client, item.id))?.eligibility).toBe("ineligible");
      await setStatus(client, item.id, "candidate", "release");
      await rank();
      expect((await getItem(client, item.id))?.eligibility).toBe("eligible");
      expect(
        (await getAudit(client, item.id)).filter((e) => e.action === "status"),
      ).toHaveLength(2);
    },
  );
  it("approval persists over identical reranks and redundant status is not audited", async () => {
    const item = await seed();
    expect(await setStatus(client, item.id, "approved")).toEqual({
      changed: true,
    });
    expect(await setStatus(client, item.id, "approved")).toEqual({
      changed: false,
    });
    await rank();
    expect((await getItem(client, item.id))?.status).toBe("approved");
    expect(await getAudit(client, item.id)).toHaveLength(1);
  });
  it("changed approved headline requires review again", async () => {
    const item = await seed();
    await setStatus(client, item.id, "approved");
    await pool.query(
      "update news_candidates set headline='Cubs rule out veteran pitcher with elbow injury'",
    );
    await pool.query(
      "update story_clusters set canonical_headline='Cubs rule out veteran pitcher with elbow injury'",
    );
    await rank();
    const updated = (await getItem(client, item.id))!;
    expect(updated.status).toBe("review");
    expect((await getStoryPreview(client, updated))?.readyForPublication).toBe(
      false,
    );
    expect((await getAudit(client, item.id)).map((e) => e.action)).toContain(
      "approved-headline-changed",
    );
  });
  it("cannot approve a missing headline or bypass restrictions with a pin", async () => {
    const item = await seed();
    await pool.query("update story_clusters set canonical_headline=null");
    await setOverride(client, item.id, { kind: "pin" });
    await rank();
    expect((await getItem(client, item.id))?.headline).toBeNull();
    await expect(setStatus(client, item.id, "approved")).rejects.toThrow(
      /headline/,
    );
  });
  it("rejects public publication in this phase", async () => {
    const item = await seed();
    const result = await client.rpc("editorial_set_status", {
      p_item: item.id,
      p_status: "published",
    });
    expect(result.error?.message).toContain("reserved");
  });
});

describe("internal reads", () => {
  it("returns representative first and distinct domains, not candidate rows", async () => {
    const item = await seed();
    await ingest([
      {
        headline: "Cubs rule out star pitcher with elbow injury",
        domain: "alpha.example",
        path: "second",
        at: "2026-09-20T11:35:00Z",
      },
    ]);
    await cluster();
    await rank();
    const sources = await getSupportingSources(client, item);
    expect(sources).toHaveLength(3);
    expect(sources[0].isRepresentative).toBe(true);
    expect((await getItem(client, item.clusterId))?.sourceCount).toBe(3);
  });
  it("reads the ranked slate and maps without fake fields", async () => {
    const item = await seed();
    const { slate } = await getSlate(client);
    expect(slate.sections.lead[0].item.clusterId).toBe(item.clusterId);
    const preview = await getStoryPreview(client, item);
    expect(preview?.attribution).not.toBeNull();
    expect(preview).toMatchObject({
      imageStatus: "missing",
      readyForPublication: false,
    });
    for (const key of ["deck", "byline", "image", "articleBody", "slug"])
      expect(preview).not.toHaveProperty(key);
  });
  it("excludes disabled sources from the source panel", async () => {
    const item = await seed();
    await pool.query(
      "update news_sources set is_enabled=false where domain='beta.example'",
    );
    expect(await getSupportingSources(client, item)).toHaveLength(2);
  });
  it("reports success, failure and stale health without changing ingestion", async () => {
    await seed();
    await pool.query(
      "update editorial_ranking_runs set trigger='manual',started_at=now()-interval '2 hours',finished_at=now()-interval '90 minutes'",
    );
    await pool.query(
      "insert into editorial_ranking_runs(trigger,algorithm_version,status,error_message) values('manual','editorial-v1','failed','synthetic')",
    );
    const h = await collectEditorialHealth(client);
    expect(h.eligibleItems).toBe(1);
    expect(h.failuresLast24h).toBe(1);
    expect(h.alerts.map((a) => a.code)).toEqual(
      expect.arrayContaining(["ranking-failed", "ranking-stale"]),
    );
  });
});

describe("RLS and service-role boundary", () => {
  it.each([
    "editorial_items",
    "editorial_overrides",
    "editorial_events",
    "editorial_ranking_runs",
  ])("protects %s", async (table) => {
    expect(
      await scalar(
        `select relrowsecurity from pg_class where oid=$1::regclass`,
        [`public.${table}`],
      ),
    ).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      expect(
        await scalar("select has_table_privilege($1,$2,'SELECT')", [
          role,
          `public.${table}`,
        ]),
      ).toBe(false);
      expect(
        await scalar("select has_table_privilege($1,$2,'INSERT')", [
          role,
          `public.${table}`,
        ]),
      ).toBe(false);
    }
  });
  it("restricts every editorial RPC to service_role", async () => {
    const { rows } = await pool.query(
      "select oid from pg_proc where pronamespace='public'::regnamespace and (proname like 'editorial_%' or proname='news_reap_stale_ranking_runs')",
    );
    expect(rows).toHaveLength(6);
    for (const r of rows)
      for (const role of ["anon", "authenticated", "service_role"])
        expect(
          await scalar("select has_function_privilege($1,$2::oid,'EXECUTE')", [
            role,
            r.oid,
          ]),
        ).toBe(role === "service_role");
  });
});

describe("scheduled stage isolation", () => {
  const provider = () =>
    fakeUnitProvider({
      "gdelt-gkg:20260920113000": [
        makeCandidate({
          headline: "Cubs rule out pitcher with elbow injury",
          publishedAt: "2026-09-20T11:30:00Z",
        }),
      ],
    });
  it("runs ranking after real ingestion and clustering", async () => {
    const p = provider();
    const result = await runScheduledTick({
      deps: createTickDeps(client, { resolveProvider: () => p }),
      providerId: "gdelt-gkg",
      force: true,
      trigger: "test",
    });
    expect(result.ok).toBe(true);
    expect(result.clustering?.outcome).toBe("ran");
    expect(result.ranking).toMatchObject({ outcome: "ran", itemsCreated: 1 });
  });
  it("ranking failure leaves ingestion and clustering successful", async () => {
    const p = provider();
    const result = await runScheduledTick({
      deps: createTickDeps(client, {
        resolveProvider: () => p,
        runRanking: async () => {
          throw new Error("synthetic rank failure");
        },
      }),
      providerId: "gdelt-gkg",
      force: true,
      trigger: "test",
    });
    expect(result.ok).toBe(true);
    expect(result.clustering?.outcome).toBe("ran");
    expect(result.ranking?.outcome).toBe("error");
    expect(await scalar("select count(*)::int from story_clusters")).toBe(1);
    expect(
      await scalar(
        "select count(*)::int from ingestion_runs where status='failed'",
      ),
    ).toBe(0);
  });
  it("does not rank when clustering fails", async () => {
    let ranked = false;
    const p = provider();
    const result = await runScheduledTick({
      deps: createTickDeps(client, {
        resolveProvider: () => p,
        runClustering: async () => {
          throw new Error("synthetic cluster failure");
        },
        runRanking: async () => {
          ranked = true;
          return rank();
        },
      }),
      providerId: "gdelt-gkg",
      force: true,
      trigger: "test",
    });
    expect(result.ok).toBe(true);
    expect(result.ranking).toBeNull();
    expect(ranked).toBe(false);
  });
});

describe("additional operator and recovery contracts", () => {
  it("forced section placement changes location without duplicating the item", async () => {
    const item = await seed();
    await setOverride(client, item.id, {
      kind: "force_section",
      text: "diamond",
    });
    await rank();
    const { slate } = await getSlate(client);
    expect(slate.sections.lead).toHaveLength(0);
    expect(slate.sections.diamond).toHaveLength(1);
  });
  it("force priority replaces score and removal restores it", async () => {
    const item = await seed();
    await setOverride(client, item.id, { kind: "force_priority", amount: 199 });
    await rank();
    expect((await getItem(client, item.id))?.score).toBe(199);
    await removeOverride(client, item.id);
    await rank();
    expect((await getItem(client, item.id))?.score).toBe(item.score);
  });
  it("editor review state is retained across reranks", async () => {
    const item = await seed();
    await setStatus(client, item.id, "review", "needs attention");
    await rank();
    expect((await getItem(client, item.id))?.status).toBe("review");
  });
  it("discovery-only clusters cannot be pinned into a safe headline", async () => {
    await ingest([
      {
        headline: "In baseball, the Herons signed Ruiz to a contract.",
        domain: "cited.example",
        provider: "wikipedia-events",
      },
    ]);
    await cluster();
    await rank();
    const item = (await listItems(client))[0];
    expect(item.headline).toBeNull();
    await setOverride(client, item.id, { kind: "pin" });
    await rank();
    await expect(setStatus(client, item.id, "approved")).rejects.toThrow(
      /headline/,
    );
    expect(
      await getStoryPreview(client, (await getItem(client, item.id))!),
    ).toBeNull();
    expect((await getSupportingSources(client, item))[0].headline).toBeNull();
  });
  it("reaps abandoned runs, preserving their failure audit", async () => {
    await pool.query(
      "insert into editorial_ranking_runs(algorithm_version,started_at) values('editorial-v1',now()-interval '40 minutes')",
    );
    const { data, error } = await client.rpc(
      "news_reap_stale_ranking_runs",
      {},
    );
    expect(error).toBeNull();
    expect(data).toMatchObject({ reaped: 1 });
    expect(await scalar("select status from editorial_ranking_runs")).toBe(
      "failed",
    );
  });
  it("refuses approval when content becomes ineligible", async () => {
    const item = await seed();
    await pool.query("update news_sources set quality_bucket='low-quality'");
    await rank();
    await expect(setStatus(client, item.id, "approved")).rejects.toThrow(
      /ineligible/,
    );
  });
});
