import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ingestBatch, findCandidateByUrl, getCandidateProvenance, listHeadlineGroups, listRejections } from "@/lib/news/warehouse/candidates";
import { setSourceEnabled } from "@/lib/news/warehouse/sources";
import { fakeFeedProvider, fakeUnitProvider, makeCandidate, makeClient, openRun, pool, resetWarehouse, scalar } from "./helpers";
import { applyIntakeFilter } from "@/lib/news/filters/intake";

const client = makeClient();
const gkg = fakeUnitProvider({});
const wiki = fakeFeedProvider("wikipedia-events", { status: "ok" });

beforeEach(resetWarehouse);
afterAll(() => pool.end());

describe("candidate insertion and sources", () => {
  it("stores a candidate with its normalized keys and creates the publisher source", async () => {
    const runId = await openRun(client, gkg);
    const candidate = makeCandidate({ url: "https://WWW.Example-Wire.com/mlb/one?utm_source=x", headline: "Herons  rally’s  win" });

    const metrics = await ingestBatch(client, { runId, candidates: [candidate], rejected: [] });

    expect(metrics).toMatchObject({ inserted: 1, existingUrl: 0, duplicateHeadline: 0, observationsCreated: 1, sourcesCreated: 1 });
    const row = await findCandidateByUrl(client, "https://www.example-wire.com/mlb/one");
    expect(row).toMatchObject({
      normalized_source_url: "https://www.example-wire.com/mlb/one",
      normalized_headline: "herons rally's win",
      headline: "Herons  rally’s  win",
      status: "new",
      headline_kind: "publisher-title",
      sport: "baseball",
      language: "English",
    });
    expect(Array.isArray(row?.classification_signals)).toBe(true);

    const source = await pool.query("select * from news_sources");
    expect(source.rows).toHaveLength(1);
    expect(source.rows[0]).toMatchObject({ domain: "example-wire.com", is_enabled: true, quality_bucket: "unknown" });
  });

  it("upserts sources: a second candidate from the same domain creates no new source", async () => {
    const runId = await openRun(client, gkg);
    const a = makeCandidate({ url: "https://same-outlet.com/a", headline: "Story alpha about the harbor derby" });
    const b = makeCandidate({ url: "https://same-outlet.com/b", headline: "Story beta about the lake derby" });
    const first = await ingestBatch(client, { runId, candidates: [a], rejected: [] });
    const second = await ingestBatch(client, { runId, candidates: [b], rejected: [] });
    expect(first.sourcesCreated).toBe(1);
    expect(second.sourcesCreated).toBe(0);
    expect(await scalar("select count(*)::int from news_sources")).toBe(1);
  });

  it("records the known-publisher bucket from the candidate", async () => {
    const runId = await openRun(client, gkg);
    await ingestBatch(client, { runId, candidates: [makeCandidate({ url: "https://www.espn.com/mlb/story/1" })], rejected: [] });
    expect(await scalar("select quality_bucket from news_sources where domain = 'espn.com'")).toBe("known");
  });
});

describe("exact URL dedupe", () => {
  it("never creates a second canonical candidate for the same normalized URL, but records the extra sighting", async () => {
    const run1 = await openRun(client, gkg);
    const run2 = await openRun(client, gkg);
    const first = makeCandidate({ url: "https://outlet.example/story/1", headline: "Duplicate URL scenario headline one" });
    const again = makeCandidate({ url: "https://outlet.example/story/1?utm_campaign=newsletter&fbclid=abc", headline: "Duplicate URL scenario headline one" });

    const m1 = await ingestBatch(client, { runId: run1, candidates: [first], rejected: [] });
    const m2 = await ingestBatch(client, { runId: run2, candidates: [again], rejected: [] });

    expect(m1.inserted).toBe(1);
    expect(m2).toMatchObject({ inserted: 0, existingUrl: 1, observationsCreated: 1 });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(1);

    const candidate = await findCandidateByUrl(client, "https://outlet.example/story/1");
    const events = await getCandidateProvenance(client, candidate!.id);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.created_candidate)).toEqual([true, false]);
  });

  it("collapses the same URL repeated inside one batch", async () => {
    const runId = await openRun(client, gkg);
    const a = makeCandidate({ url: "https://outlet.example/story/2", headline: "Repeated inside a single batch" });
    const metrics = await ingestBatch(client, { runId, candidates: [a, { ...a }], rejected: [] });
    expect(metrics.inserted).toBe(1);
    expect(metrics.existingUrl).toBe(1);
    expect(metrics.observationsCreated).toBe(1);
    expect(await scalar("select count(*)::int from news_candidates")).toBe(1);
  });

  it("keeps provenance when two providers see the same URL", async () => {
    const gkgRun = await openRun(client, gkg);
    const wikiRun = await openRun(client, wiki);
    const url = "https://outlet.example/shared/story";

    await ingestBatch(client, { runId: gkgRun, unitKey: "gdelt-gkg:20260920000000", candidates: [makeCandidate({ url, headline: "Shared story seen by two providers" })], rejected: [] });
    const m = await ingestBatch(client, {
      runId: wikiRun,
      candidates: [makeCandidate({ url, provider: "wikipedia-events", headline: "Event sentence describing the same story.", queryProfileSport: undefined, queryProfileLabel: "current-events" })],
      rejected: [],
    });

    expect(m).toMatchObject({ inserted: 0, existingUrl: 1 });
    const candidate = await findCandidateByUrl(client, url);
    const providers = await pool.query(
      `select p.provider_key from candidate_ingestion_events e join news_providers p on p.id = e.provider_id
       where e.candidate_id = $1 order by e.id`,
      [candidate!.id],
    );
    expect(providers.rows.map((r) => r.provider_key)).toEqual(["gdelt-gkg", "wikipedia-events"]);
    // The canonical row still belongs to (and keeps the headline of) its first discoverer.
    expect(candidate!.headline).toBe("Shared story seen by two providers");
  });
});

describe("provider-item idempotency", () => {
  it("does not create a second candidate for the same (provider, provider_item_id) even under a different URL", async () => {
    const runId = await openRun(client, gkg);
    const first = makeCandidate({ providerItemId: "item-42", url: "https://outlet.example/a/42", headline: "Provider item scenario original" });
    const moved = makeCandidate({ providerItemId: "item-42", url: "https://outlet.example/b/42-new-path", headline: "Provider item scenario original" });

    await ingestBatch(client, { runId, candidates: [first], rejected: [] });
    const m = await ingestBatch(client, { runId: await openRun(client, gkg), candidates: [moved], rejected: [] });

    expect(m).toMatchObject({ inserted: 0, existingProviderItem: 1, existingUrl: 0 });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(1);
  });

  it("allows the same item id from different providers", async () => {
    const a = makeCandidate({ providerItemId: "same-id", url: "https://outlet.example/x1", headline: "Cross provider item id one" });
    const b = makeCandidate({ providerItemId: "same-id", url: "https://outlet.example/x2", provider: "newsdata", headline: "Cross provider item id two" });
    await ingestBatch(client, { runId: await openRun(client, gkg), candidates: [a], rejected: [] });
    const m = await ingestBatch(client, { runId: await openRun(client, fakeFeedProvider("newsdata", { status: "ok" })), candidates: [b], rejected: [] });
    expect(m.inserted).toBe(1);
  });
});

describe("normalized-headline grouping (same headline ≠ same URL)", () => {
  it("keeps every source's candidate, marks the first as the group root and the rest as duplicates", async () => {
    const runId = await openRun(client, gkg);
    const headline = "Harbor Herons edge Lakeview Owls in a wire story";
    const candidates = ["alpha-radio.example", "beta-times.example", "gamma-herald.example"].map((domain) =>
      makeCandidate({ url: `https://${domain}/wire/herons-owls`, headline }),
    );

    const metrics = await ingestBatch(client, { runId, candidates, rejected: [] });

    expect(metrics).toMatchObject({ inserted: 3, duplicateHeadline: 2, existingUrl: 0 });
    const rows = await pool.query("select status, headline_primary_id, id from news_candidates order by status");
    expect(rows.rows.filter((r) => r.status === "new")).toHaveLength(1);
    const root = rows.rows.find((r) => r.status === "new");
    const dupes = rows.rows.filter((r) => r.status === "duplicate");
    expect(dupes).toHaveLength(2);
    expect(dupes.every((r) => r.headline_primary_id === root.id)).toBe(true);

    const groups = await listHeadlineGroups(client);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ candidate_count: 3, source_count: 3 });
  });

  it("matches across cosmetic differences (case, smart quotes, dashes, whitespace) but not different wording", async () => {
    const runId = await openRun(client, gkg);
    const a = makeCandidate({ url: "https://one.example/a", headline: "Herons’ late rally — Owls fall" });
    const b = makeCandidate({ url: "https://two.example/b", headline: "  HERONS' LATE RALLY - OWLS   FALL " });
    const c = makeCandidate({ url: "https://three.example/c", headline: "Herons late rally sinks Owls" });
    const m = await ingestBatch(client, { runId, candidates: [a, b, c], rejected: [] });
    expect(m.duplicateHeadline).toBe(1);
    expect((await listHeadlineGroups(client))[0].candidate_count).toBe(2);
  });

  it("links a later run's duplicate headline to the earlier root", async () => {
    const headline = "A wire story that arrives in two separate runs";
    await ingestBatch(client, { runId: await openRun(client, gkg), candidates: [makeCandidate({ url: "https://early.example/1", headline })], rejected: [] });
    const m = await ingestBatch(client, { runId: await openRun(client, gkg), candidates: [makeCandidate({ url: "https://late.example/1", headline })], rejected: [] });
    expect(m.duplicateHeadline).toBe(1);
    expect(await scalar("select count(*)::int from news_candidates where headline_primary_id is null")).toBe(1);
  });

  it("does not let a provider's discovery text join a publisher-title group", async () => {
    const headline = "Identical text in two different kinds of field";
    await ingestBatch(client, { runId: await openRun(client, gkg), candidates: [makeCandidate({ url: "https://p.example/1", headline })], rejected: [] });
    const m = await ingestBatch(client, {
      runId: await openRun(client, wiki),
      candidates: [makeCandidate({ url: "https://q.example/1", headline, provider: "wikipedia-events", queryProfileSport: undefined, queryProfileLabel: "current-events" })],
      rejected: [],
    });
    expect(m.duplicateHeadline).toBe(0);
    expect(await scalar("select headline_kind from news_candidates where normalized_source_url = 'https://q.example/1'")).toBe("discovery-text");
  });
});

describe("GKG file-stamp idempotency", () => {
  const KEY = "gdelt-gkg:20260920121500";

  it("processes a unit once; a repeat writes nothing", async () => {
    const candidates = [makeCandidate({ url: "https://u.example/1", headline: "Unit story number one for idempotency" }), makeCandidate({ url: "https://u.example/2", headline: "Unit story number two for idempotency" })];
    const first = await ingestBatch(client, { runId: await openRun(client, gkg), unitKey: KEY, candidates, rejected: [] });
    const second = await ingestBatch(client, { runId: await openRun(client, gkg), unitKey: KEY, candidates, rejected: [] });

    expect(first).toMatchObject({ unitSkipped: false, inserted: 2 });
    expect(second).toMatchObject({ unitSkipped: true, inserted: 0, observationsCreated: 0, sourcesCreated: 0 });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(2);
    expect(await scalar("select count(*)::int from candidate_ingestion_events")).toBe(2);
    expect(await scalar("select count(*)::int from news_ingestion_units where unit_key = $1", [KEY])).toBe(1);
  });

  it("only one of several concurrent workers wins a unit; the candidate set is written exactly once", async () => {
    const candidates = Array.from({ length: 6 }, (_, i) => makeCandidate({ url: `https://race.example/${i}`, headline: `Concurrent unit story ${i} for the race` }));
    const runs = await Promise.all(Array.from({ length: 5 }, () => openRun(client, gkg)));

    const results = await Promise.all(runs.map((runId) => ingestBatch(client, { runId, unitKey: KEY, candidates, rejected: [] })));

    expect(results.filter((r) => !r.unitSkipped)).toHaveLength(1);
    expect(results.filter((r) => r.unitSkipped)).toHaveLength(4);
    expect(await scalar("select count(*)::int from news_candidates")).toBe(6);
    expect(await scalar("select count(*)::int from candidate_ingestion_events")).toBe(6);
  });

  it("concurrent batches carrying the same URL and headline still yield one candidate and one headline root", async () => {
    const url = "https://race.example/shared";
    const runs = await Promise.all(Array.from({ length: 6 }, () => openRun(client, gkg)));
    const results = await Promise.all(
      runs.map((runId, i) => ingestBatch(client, { runId, unitKey: `gdelt-gkg:2026092012${String(i).padStart(2, "0")}00`, candidates: [makeCandidate({ url, headline: "Racing writers, one shared headline" })], rejected: [] })),
    );
    expect(results.reduce((sum, r) => sum + r.inserted, 0)).toBe(1);
    expect(await scalar("select count(*)::int from news_candidates")).toBe(1);
    expect(await scalar("select count(*)::int from candidate_ingestion_events")).toBe(6);
  });

  it("concurrent batches with the same headline but different URLs elect exactly one group root", async () => {
    const runs = await Promise.all(Array.from({ length: 6 }, () => openRun(client, gkg)));
    await Promise.all(
      runs.map((runId, i) => ingestBatch(client, { runId, candidates: [makeCandidate({ url: `https://root-race.example/${i}`, headline: "One headline reported by many writers at once" })], rejected: [] })),
    );
    expect(await scalar("select count(*)::int from news_candidates")).toBe(6);
    expect(await scalar("select count(*)::int from news_candidates where headline_primary_id is null")).toBe(1);
  });
});

describe("rejections", () => {
  it("persists rejected candidates with reasons, provider and headline — and bumps times_seen on repeats", async () => {
    const runId = await openRun(client, gkg);
    const junk = makeCandidate({ url: "https://tips.example/props", headline: "Week 2 player props and best bets for every game" });
    const { rejected } = applyIntakeFilter([junk]);
    expect(rejected).toHaveLength(1);

    const first = await ingestBatch(client, { runId, candidates: [], rejected });
    const second = await ingestBatch(client, { runId: await openRun(client, gkg), candidates: [], rejected });

    expect(first).toMatchObject({ rejectionsRecorded: 1, rejectionsSeenAgain: 0 });
    expect(second).toMatchObject({ rejectionsRecorded: 0, rejectionsSeenAgain: 1 });

    const rows = await listRejections(client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ headline: junk.headline, times_seen: 2, reasons: ["betting-or-fantasy"] });
    expect(await scalar("select p.provider_key from candidate_rejections r join news_providers p on p.id = r.provider_id")).toBe("gdelt-gkg");
    expect(await scalar("select count(*)::int from news_candidates")).toBe(0);
  });

  it("rejects an unknown reason at the database level", async () => {
    const runId = await openRun(client, gkg);
    const { rejected } = applyIntakeFilter([makeCandidate({ headline: "Best bets and parlay picks for the week ahead", url: "https://tips.example/x" })]);
    rejected[0].reasons = ["made-up-reason" as never];
    await expect(ingestBatch(client, { runId, candidates: [], rejected })).rejects.toThrow(/check constraint|news_ingest_batch failed/i);
  });

  it("refuses candidates from a source disabled in the database, and records why", async () => {
    const runId = await openRun(client, gkg);
    await ingestBatch(client, { runId, candidates: [makeCandidate({ url: "https://bad-outlet.example/1", headline: "Story before the source was disabled" })], rejected: [] });
    await setSourceEnabled(client, "bad-outlet.example", false);

    const m = await ingestBatch(client, { runId, candidates: [makeCandidate({ url: "https://bad-outlet.example/2", headline: "Story after the source was disabled" })], rejected: [] });

    expect(m).toMatchObject({ inserted: 0, disabledSourceRejected: 1 });
    expect(await scalar("select count(*)::int from news_candidates")).toBe(1);
    expect((await listRejections(client))[0].reasons).toEqual(["disabled-source"]);

    await setSourceEnabled(client, "bad-outlet.example", true);
    const back = await ingestBatch(client, { runId, candidates: [makeCandidate({ url: "https://bad-outlet.example/3", headline: "Story after the source was re-enabled" })], rejected: [] });
    expect(back.inserted).toBe(1);
  });
});

describe("transaction rollback", () => {
  it("rolls the whole batch back — candidates, sources, provenance and the unit claim — when one row is invalid", async () => {
    const runId = await openRun(client, gkg);
    const good = makeCandidate({ url: "https://rollback.example/good", headline: "A perfectly valid story before the bad row" });
    const bad = makeCandidate({ url: "https://rollback.example/bad", headline: "A story whose sport violates the constraint" });
    bad.classification = { ...bad.classification, sport: "curling-on-mars" as never };
    const KEY = "gdelt-gkg:20260920130000";

    await expect(ingestBatch(client, { runId, unitKey: KEY, candidates: [good, bad], rejected: [] })).rejects.toThrow(/news_ingest_batch failed/);

    expect(await scalar("select count(*)::int from news_candidates")).toBe(0);
    expect(await scalar("select count(*)::int from candidate_ingestion_events")).toBe(0);
    expect(await scalar("select count(*)::int from news_sources")).toBe(0);
    expect(await scalar("select count(*)::int from news_ingestion_units")).toBe(0);

    // The unit was not burned: the corrected batch can still claim it.
    const retry = await ingestBatch(client, { runId, unitKey: KEY, candidates: [good], rejected: [] });
    expect(retry).toMatchObject({ unitSkipped: false, inserted: 1 });
  });

  it("rejects an unknown run id without writing anything", async () => {
    await expect(ingestBatch(client, { runId: "00000000-0000-0000-0000-000000000000", candidates: [makeCandidate()], rejected: [] })).rejects.toThrow();
    expect(await scalar("select count(*)::int from news_candidates")).toBe(0);
  });
});
