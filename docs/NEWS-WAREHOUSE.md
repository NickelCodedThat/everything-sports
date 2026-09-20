# News Warehouse

**Status:** Phase 4 — Persistent News Warehouse (internal; not connected to the public site)
**Scope:** durable, deduplicated memory for the newsroom's discovered candidates. Companion to
`docs/NEWS-SOURCE-STRATEGY.md` (discovery, provider policy) — it changes neither the brand blueprint nor the
public homepage, which still reads only `src/data/stories.ts`.

## 1. Architecture

```
News providers (gdelt-gkg, wikipedia-events, newsdata, gdelt DOC)
        │  fetch + normalize                         src/lib/news/providers/*
        ▼
NewsCandidate  ──►  intake filter (accept / reject+reasons)   src/lib/news/filters/intake.ts
        │
        ▼
Warehouse intake  (server-only)                              src/lib/news/warehouse/*
        │   one RPC call = one DB transaction: news_ingest_batch(...)
        ▼
Supabase Postgres (RLS on, no client access)                 supabase/migrations/*
        │
        ▼
Deduplicated candidate history  ──►  (Phase 5+) clustering / ranking / publication
```

- **Postgres does the deduplication**, not JavaScript. All writes go through one SQL function,
  `news_ingest_batch`, which upserts on unique keys with `ON CONFLICT` inside a single transaction. There is no
  "SELECT then INSERT" path anywhere, so retries, overlapping windows and concurrent workers cannot create duplicates.
- **Domain ≠ storage.** `NewsCandidate` (camelCase, provider-neutral) is the domain type; `WarehouseCandidateRow`
  (snake_case) is a Supabase row type emitted from the schema (`warehouse/database.types.ts`). `warehouse/normalize.ts` is the
  only place they meet.
- **Provider policy stays in code.** `news_providers.policy_status` is a copy for operational visibility; the
  registry remains canonical, and `syncProvider` refuses any provider that is not `approved`.
- **Server-only.** `warehouse/client.ts` imports `server-only`, reads no `NEXT_PUBLIC_*` variable, and nothing under
  `src/app` imports the warehouse.

### Code layout (`src/lib/news/warehouse/`)

| File | Role |
| --- | --- |
| `client.ts` | `createWarehouseClient()` — secret-key Supabase client; refuses a publishable key; never echoes keys |
| `database.types.ts` | emitted by `pnpm db:types` from the migrations — do not edit |
| `types.ts` | storage-side types (row aliases, RPC payloads, `IngestMetrics`, `WarehouseStats`) |
| `normalize.ts` | `normalizeHeadline`, `NewsCandidate → payload`, rejection payloads, `headlineKindFor` |
| `candidates.ts` | `ingestBatch` (the RPC wrapper) + read helpers: by URL, recent, provenance, rejections, headline groups |
| `ingest.ts` | `runWarehouseIngestion` (one auditable run for one provider); `ingestCandidates` for callers that fetch themselves |
| `ingestion-runs.ts` | `startRun` / `finishRun` / `findProcessedUnitKeys` |
| `providers.ts`, `sources.ts` | provider sync (respects the DB `status` switch), source listing, `setSourceEnabled` |
| `stats.ts`, `report.ts` | `getWarehouseStats` and CLI formatting |

## 2. Schema (`supabase/migrations/20260920050809_news_warehouse.sql`)

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `news_providers` | Discovery systems. `provider_key`, `display_name`, operational `status` (`active`/`degraded`/`disabled`), `expected_freshness`, `requires_api_key`, `policy_status` (copy). | `provider_key` unique. Provider sync updates descriptive columns only, so an operator's `disabled` survives. |
| `news_sources` | Publishers by normalized domain: `display_name`, `quality_bucket` (`known`/`unknown`/`low-quality`), **`is_enabled`**. | `domain` unique, lowercase, no `www.`. `is_enabled=false` makes the ingester reject that source's candidates (`disabled-source`) with no code change. |
| `news_candidates` | **Canonical** candidate — one row per normalized URL: headline + `normalized_headline`, URLs, `published_at`/`discovered_at`, `sport`, `league`, `classification_confidence`, `classification_signals` (jsonb), `provider_categories`, `query_profile`, `source_quality`, `language`, `remote_image_ref` (diagnostic only), `fingerprint`, `status`, `headline_kind`, `headline_primary_id`. | `normalized_source_url` **unique**; `(provider_id, provider_item_id)` unique where the item id exists; **one headline-group root** per `(headline_kind, normalized_headline)`; `status` ∈ `new/accepted/rejected/duplicate/clustered/promoted`. No article body, HTML or image bytes exist as columns. |
| `candidate_ingestion_events` | **Provenance:** every sighting of a candidate by a provider in a run (and unit). | `(candidate_id, ingestion_run_id, unit_key)` unique. |
| `candidate_rejections` | What intake rejected and why: headline, URL, domain, sport, `reasons[]`, provider, first/last run, `times_seen`. Headline + link metadata only. | `(provider_id, fingerprint)` unique — a re-seen rejection bumps `times_seen` instead of adding a row. `reasons` constrained to the intake filter's reason list + `disabled-source` (parity is tested). |
| `ingestion_runs` | Audit record per ingestion attempt: provider, window, `status` (`running/succeeded/partial/failed`), `provider_state`, counts, `error_message`, `metadata`. | Non-negative counts; `finished_at ≥ started_at`. |
| `news_ingestion_units` | Cursor for immutable provider units (GKG 15-minute files). | `unit_key` **unique**, e.g. `gdelt-gkg:20260920121500`. |
| `news_headline_groups` (view) | "How many distinct sources carry this headline?" — grouping by normalized headline; **not clustering**. | `security_invoker = true`. |

Indexes follow the actual workload: `published_at desc`, `discovered_at desc`, `(sport, published_at desc)`,
`provider_id`, `source_id`, `status`, `normalized_headline`, `fingerprint`, a partial index on `headline_primary_id`,
run/provenance lookups, and a GIN index on rejection reasons. Not every column is indexed.

Two SQL functions, both `service_role`-only: **`news_ingest_batch`** (the write path) and
**`news_warehouse_stats`** (the internal summary).

## 3. Dedupe rules

### Exact URL
`normalized_source_url` is the Phase 3 normalized URL (host lowercased, tracking parameters such as `utm_*`,
`fbclid`, `ocid`, `cmpid` stripped, fragments dropped). The warehouse mapper recomputes it from the candidate
(never trusting the caller) and the database enforces a unique index. A second candidate with the same normalized URL:

- does **not** create another canonical row,
- **does** add a `candidate_ingestion_events` row (who saw it, in which run/file),
- is counted as `existingUrl` / `records_duplicate_url`.

The same `(provider_id, provider_item_id)` under a *different* URL is also treated as the same candidate
(`existingProviderItem`, also reported under duplicate-URL in run totals).

### Normalized headline
`normalizeHeadline` (Unicode NFKC → strip zero-width characters → smart quotes/dashes/ellipsis to ASCII →
lowercase → collapse whitespace → trim). It never removes words and never fuzzy-matches: "Cubs top Reds" and
"Cubs beat Reds" stay different. (Publisher/site suffixes are already stripped upstream by the GKG normalizer.)

**Same headline ≠ same URL.** When 13 local outlets carry one wire headline, the warehouse stores **13 candidates**
(13 URLs, 13 sources) — nothing is deleted. The first becomes the group *root* (`status = new`,
`headline_primary_id = null`); later ones are `status = duplicate` with `headline_primary_id` pointing at the root.
`news_headline_groups` (and `getWarehouseStats().top_headline_groups`) then answers "N sources are reporting this".
Grouping is per `headline_kind`: a provider's `discovery-text` never joins a `publisher-title` group.

Race safety: writers of the same headline serialize on a transaction-scoped advisory lock, and a **partial unique
index** (one root per group) is the backstop. Candidates in a batch are processed in a deterministic order so
concurrent batches take locks consistently (no deadlocks).

## 4. Observation / provenance model

```
news_candidates (canonical, one per URL)  1 ── * candidate_ingestion_events (sightings)
                                                   ├─ provider   (who saw it)
                                                   ├─ ingestion run
                                                   ├─ unit_key   (which GKG file, when applicable)
                                                   └─ created_candidate (true on the first sighting)
```

Two levels of "many sources": *same URL seen many times* (events on one candidate) and *same headline on many URLs*
(many candidates sharing a group root). Phase 5's event clustering can build on both without a schema change.

`news_candidates.provider_id` is the provider that **first** discovered the URL; later providers appear only in
events. `headline_kind` records whether the text is a publisher's title (`publisher-title`) or provider prose that
must not be displayed (`discovery-text`, derived from the provider's `headlineDisplayAllowed` policy — Wikipedia
Current Events sentences are CC BY-SA text and stay `discovery-text`; `status` stays `new`, never publication-ready).

## 5. GKG file-stamp idempotency

GDELT GKG files are immutable 15-minute snapshots. Each is a **unit** with the key `gdelt-gkg:<YYYYMMDDHHMMSS>`:

1. `runWarehouseIngestion` lists the unit keys covering the window and asks the DB which are already stored
   (`findProcessedUnitKeys`) — stored units are **not even downloaded**.
2. For each new unit it downloads/normalizes/filters, then calls `news_ingest_batch(..., p_unit_key)`.
3. Inside that one transaction the function **claims** the unit (`INSERT … ON CONFLICT (unit_key) DO NOTHING`). If
   the claim inserts nothing (a repeat, or a concurrent worker won), the function returns `unitSkipped` and writes
   nothing. If anything later in the batch fails, the transaction rolls back **including the claim**, so a failed
   file is retried cleanly.
4. A unit that isn't published yet (404) is left unclaimed for a later run.

So the pre-check is an optimization; the unit-key unique constraint is the guarantee (tested with 5 concurrent workers
racing on one unit: exactly one wins).

## 6. Ingestion-run lifecycle

`runWarehouseIngestion(client, { provider, window, limit })`:

1. `syncProvider` — upsert provider row from code; refuses non-approved providers and providers whose DB `status` is
   `disabled`.
2. `startRun` — `ingestion_runs` row, `status = running`.
3. Fetch → intake filter → `ingestBatch` per unit (or once, for providers without units).
4. `finishRun` — always, even on provider failure: counts, `provider_state`, `error_message`.

| Outcome | `provider_state` | `status` |
| --- | --- | --- |
| Everything landed | `ok` (or `empty` when nothing returned) | `succeeded` |
| Some units failed, others landed (or provider returned partial-failure notes) | `ok` | `partial` |
| Provider throttled/unavailable/errored before anything landed | `throttled` / `unavailable` / `error` | `failed` |

Provider throttling (`ProviderRateLimitedError`) stops the unit loop immediately. A crash between `startRun` and
`finishRun` leaves a `running` row — a reaper for stale runs belongs to the scheduler phase.

`records_returned` counts candidates the provider normalized (GKG pre-drops non-sport rows); `records_accepted` /
`records_rejected` are the intake-filter split; `records_duplicate_url` includes provider-item duplicates.

## 7. Security / RLS model

- **Every warehouse table has RLS enabled with no policies**, and all privileges are revoked from `public`, `anon`
  and `authenticated` (tables, sequences, functions, and the headline-groups view). Only `service_role` — i.e. the
  server-side **secret key** — can read or write. There are no anonymous read/write policies "for development".
- The browser never needs the warehouse in Phase 4, so **no public/publishable Supabase key is added**, and no
  `NEXT_PUBLIC_*` variable exists for it. `warehouse/client.ts` refuses a publishable key and reads only
  `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- **Legacy compatibility:** `SUPABASE_SERVICE_ROLE_KEY` (the old `service_role` JWT) is accepted *only* as a fallback for
  a project that hasn't moved to secret keys; new setups should use `SUPABASE_SECRET_KEY` (`sb_secret_…`).
- Tests assert the posture both statically (`tests/unit/news/warehouse-migration.test.ts`) and against a live database
  (`anon`/`authenticated` are denied every table, view and function).

## 8. Local setup

Requires Docker Desktop.

```bash
pnpm install
pnpm db:start                   # Supabase CLI local stack (Postgres + API gateway); applies supabase/migrations
pnpm db:status -o env           # prints API_URL and SECRET_KEY (local dev values)
```

Put these in `.env.local` (gitignored; names are in `.env.example`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=<SECRET_KEY from db:status>
```

`pnpm db:start` excludes services the warehouse doesn't use (Studio, realtime, storage, edge functions, analytics, …).
The auth container stays on because the local gateway needs it to accept the new `sb_secret_…` keys.

```bash
pnpm db:reset                   # drop + rebuild the schema from migrations (a fresh clone reproduces it from Git)
pnpm db:types                   # regenerate src/lib/news/warehouse/database.types.ts after a migration change
pnpm db:stop
```

Schema changes are made **only** by adding a new file under `supabase/migrations/` (`pnpm exec supabase migration new
<name>`), then `pnpm db:reset` and `pnpm db:types`. Nothing depends on dashboard edits.

## 9. CLI

```bash
pnpm news:ingest                                        # gdelt-gkg, last 2h (8 files) — safe to repeat
pnpm news:ingest --provider=gdelt-gkg --window=4h
pnpm news:ingest --provider=wikipedia-events --window=3d
pnpm news:ingest --json
pnpm news:warehouse:stats                               # internal summary (--json also supported)
```

`news:ingest` prints: run id, provider, status/provider state, units processed/skipped, returned, accepted, rejected,
inserted, duplicate URL, duplicate headline, observations, sources created, disabled-source rejections and duration.
No credentials are printed. Exit code 2 when the run `failed`. NewsData works automatically once
`NEWSDATA_API_KEY` is set (`--provider=newsdata`); without a key the run is recorded as `failed`/`unavailable`.

`news:warehouse:stats` reports total candidates, distinct headlines, duplicate-headline rate, new in the last 24 h,
observations, sources (and disabled), counts by sport / provider / source quality / status, rejections by reason,
runs by status, the most widely carried headlines, and the latest run.

## 10. Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Unit (incl. static migration checks, normalization, client config, CLI args) | `pnpm test` | nothing — no network, no database |
| Warehouse integration — 40 tests against a real Postgres | `pnpm test:db` | `pnpm db:start` + `.env.local` |
| E2E | `pnpm test:e2e` | unchanged |

Integration coverage: candidate + source insertion, source upsert, exact-URL dedupe (incl. tracking-param variants and
in-batch repeats), multi-provider provenance, provider-item idempotency, normalized-headline grouping (cosmetic
variants, cross-run, `discovery-text` isolation), GKG unit idempotency **including 5-way concurrent workers and races on
URLs/headline roots**, rejection persistence and re-seen counting, disabled-source rejection, transaction rollback
(unit claim not burned), run success / partial / failed / empty states, provider disabling, stats queries, RLS
(`anon`/`authenticated` denied), and constraint definitions. All synthetic data; no internet.

## 11. Real ingestion validation (2026-09-20, local Supabase, live GDELT GKG)

Fresh database (`db reset`), then real GKG files, sport-classified and intake-filtered:

| Step | Command | Result |
| --- | --- | --- |
| 1. First ingest | `news:ingest --window=2h` | 8 units processed; returned 82, accepted 81, rejected 1; **81 inserted**; 45 duplicate-headline; 47 sources created; 81 observations |
| 2. Same command again | `news:ingest --window=2h` | GKG had published a new file, so the 2 h window slid: 1 new unit processed (14 inserted), **7 stored units skipped without download** |
| 3. Overlapping wider window | `news:ingest --window=4h` | 7 new units processed (94 inserted), **9 stored units skipped** |
| 4. Identical to step 3 | `news:ingest --window=4h` | **0 units processed, 16 skipped; 0 returned, 0 inserted, 0 observations, 0 sources created** (235 ms) |
| 5. Raw-path replay, same unit key | one real stored unit re-sent via `news_ingest_batch` | `unitSkipped: true`, 0 rows written |
| 6. Raw-path replay, *new* unit key | the same 14 real candidates under a fresh key | **0 inserted, 14 existingUrl**, 14 provenance events (URL dedupe holds even without the unit guard) |
| 7. Wikipedia twice | `news:ingest --provider=wikipedia-events --window=3d` ×2 | first: 4 inserted; second: **0 inserted, 4 duplicate-URL**, 4 more provenance events |

(Steps 5–6's synthetic unit/run rows were removed afterwards so the numbers below are only genuine ingestion.)

Integrity, checked directly in SQL after the runs:

```
canonical candidates: 193   distinct normalized URLs: 193      → URLs with >1 canonical row: 0
GKG unit keys stored: 16    distinct: 16
headline groups with >1 root: 0
observations: 197           candidates seen more than once: 4  (the Wikipedia re-sightings)
```

Warehouse stats afterwards (`pnpm news:warehouse:stats`):

```
candidates 193 · distinct headlines 98 · duplicate-headline 95 (49.2%) · new in last 24h 193 · observations 197
sources 111 (0 disabled)
by sport      baseball 131, mma 25, football 22, soccer 6, basketball 4, unknown 3, hockey 1, motorsports 1
by provider   gdelt-gkg 189, wikipedia-events 4
by quality    unknown 177, known 16
by status     new 98, duplicate 95
rejections    2 — betting-or-fantasy 2
runs          succeeded 6
widest headline: 15 sources / 15 candidates
```

The exact-headline result matches the Phase 3 finding: 193 real candidates collapse to 98 distinct headlines while all 193
source observations are preserved. (The sport mix reflects what was in the news at 05:00 UTC on a September Sunday, not the
warehouse: MLB pennant race and NFL Sunday games, NBA offseason.)

## 12. Known limits

- A run whose process dies mid-flight stays `running` (no reaper yet).
- `news_sources.quality_bucket` is set when a domain is first seen and is not refreshed from code afterwards (the DB is
  authoritative once a source exists; changing the code's known-publisher list does not rewrite history).
- Wikipedia Current Events items are non-immutable pages, so they have no unit key — URL dedupe protects them, and each
  ingestion adds a provenance event per re-seen link.
- `records_returned` for GKG excludes rows the sport classifier dropped before they reached the intake filter.
- No retention, no clustering, no scheduler, no public read path.

### Retention (documented, not implemented)
Rows are metadata only (no bodies, no images), so growth is modest: ~100 candidates per 2 h at current sports volume.
When retention matters: keep `news_candidates`, prune or archive `candidate_ingestion_events` older than N days (keeping the
first per candidate), and cap `candidate_rejections` by `last_seen_at`. Deletions must stay explicit migrations/jobs — nothing in
Phase 4 deletes data.

## 13. What moves to Phase 5

- The scheduler (15-minute GKG cadence — the operation is already idempotent and unit-keyed) and its run reaper/alerting.
- Fuzzy same-event clustering built on `news_headline_groups` + provenance; `clustered`/`promoted` statuses.
- Ranking, editorial review, and the read path to the public site (and the RLS/policy design that requires).
- NewsData ingestion in production (needs a key), DOC-API opportunistic queries behind their cooldown.
- Retention jobs and source-quality refresh.

## 14. Remote Supabase deployment (handoff — not done in this phase)

No remote project is linked to this repository, so Phase 4 was built and validated against the local stack only. To deploy:

1. Create a Supabase project; `pnpm exec supabase login` then `pnpm exec supabase link --project-ref <ref>`.
2. `pnpm exec supabase db push` — applies `supabase/migrations` (schema comes from Git, never from the dashboard).
3. On the host that will run ingestion, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (project Settings → API Keys → *secret*
   key). Do **not** create a `NEXT_PUBLIC_*` variable for the warehouse.
4. Confirm `pnpm news:ingest` and `pnpm news:warehouse:stats` against the remote before enabling any schedule.
