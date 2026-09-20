# Newsroom Engine

**Status:** Phase 5 — Automated Newsroom Engine (internal; the public site still reads only fixtures)
**Scope:** turns the Phase 4 warehouse from "a human runs a CLI" into a 24/7 internal newsroom: scheduled ingestion,
overlap protection, stuck-run recovery, provider health and alert conditions. Read
[`NEWS-SOURCE-STRATEGY.md`](NEWS-SOURCE-STRATEGY.md) (discovery, provider policy) and [`NEWS-WAREHOUSE.md`](NEWS-WAREHOUSE.md)
(storage, dedupe) first. Nothing here promotes a candidate to a Story or touches the homepage. (Phase 6 adds a story-clustering stage after ingestion — see §9a and [`STORY-CLUSTERING.md`](STORY-CLUSTERING.md).)

## 1. Architecture

```
Supabase Cron (pg_cron)                       ← schedule lives in a migration
   │  select newsroom_invoke_worker('gdelt-gkg')        (pure SQL, returns immediately)
   ▼
pg_net  ── POST + Bearer secret (from Supabase Vault) ──►  /api/internal/newsroom/tick     ← Next.js Node route
                                                              │
                                                              ▼
                                        runScheduledTick()   src/lib/news/engine/tick.ts   ← THE orchestration path
                                          1. reap stale runs
                                          2. per provider: policy → config → DB switch → due? → overlap lock
                                          3. runWarehouseIngestion()   (Phase 4 service, unchanged)
                                          4. runClustering()           (Phase 6 — separate stage, see §9a)
                                              ▼
                                        Supabase Postgres (warehouse)
```

The database only **triggers** work. It never downloads, unzips or parses GDELT files — that stays in server code.

`pnpm news:worker` calls the very same `runScheduledTick`, so there is one orchestration path for production and for
local simulation. `pnpm news:ingest` (Phase 4) still calls `runWarehouseIngestion` directly — ungated, single provider,
`manual` trigger — and is untouched.

### Why a Next.js route instead of a Supabase Edge Function

The choice was made on actual runtime compatibility with the existing modules:

| Concern | Reality in this repo |
| --- | --- |
| GKG files are ZIPs | `providers/gdelt-gkg/zip.ts` uses `node:zlib` (`inflateRawSync`) and `Buffer` |
| Warehouse client | `@supabase/supabase-js` + `server-only`, `process.env` |
| Shared code | Policy registry, classifier, intake filter, and 60+ modules with `@/` path aliases, all tested under Node |
| Edge Functions | Deno runtime; would need a port of the zip reader, an import-map for the `@/` aliases and `server-only`, and a second copy of every module (or a bundling pipeline) |

Reusing the Node code as-is is the requirement ("do not duplicate the ingestion implementation"), so the worker is a
**secured, server-only Next.js Route Handler on the Node.js runtime** (`export const runtime = "nodejs"`). Supabase Cron
triggers it. If the modules ever become runtime-neutral, the trigger URL is the only thing that would change.

Consequence: the worker needs a hosted Next.js deployment reachable from Supabase (any Node-capable host; `maxDuration = 60`).
This is the one remote prerequisite — see §12.

## 2. Provider cadence

Configuration is in one file, `src/lib/news/engine/config.ts`; the cron expressions are installed by
`supabase/migrations/20260920120100_newsroom_schedule.sql` (a test asserts they match).

| Provider | Schedule | Cron (UTC) | Lookback | Min interval | Stale after | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `gdelt-gkg` | every 15 min | `2-59/15 * * * *` (:02 :17 :32 :47) | 3 h (12 files) | 10 min | 45 min | baseline automated source |
| `wikipedia-events` | hourly | `7 * * * *` | 1 d (2 daily pages) | 50 min | 3 h | day-curated, low volume; Wikimedia etiquette (User-Agent, sequential requests) |
| `newsdata` | every 6 h | `23 */6 * * *` | 1 d | 300 min | 15 h | free tier is ~12 h delayed; **no-op until `NEWSDATA_API_KEY` is set** |
| `gdelt` (DOC API) | **never scheduled** | — | — | — | — | throttled (HTTP 429); manual/opportunistic only, behind its cooldown |

- **GKG 15-minute strategy.** Cron fires 2 minutes past each quarter hour, but the worker does not assume the newest file
  exists. It lists the 12 most recent unit keys (from `lastupdate.txt`), asks the database which are already stored, downloads
  only the missing ones, filters/classifies, and persists each file atomically (Phase 4). A missed or late tick therefore
  self-heals on the next one, up to the 3-hour lookback; anything older is a manual `pnpm news:ingest --window=6h` backfill.
- **Wikipedia** is hourly, not 15-minute: it is editor-curated per day and Wikimedia asks for considerate access.
- **NewsData** runs at a low cadence because its free data is delayed; with no key it is reported as `disabled (not
  configured)`, not as a failing provider.
- The **DOC API** stays available through `pnpm news:probe` / `pnpm news:ingest --provider=gdelt` behind its 429 cooldown.

### Three gates before any network call

Config can only *further restrict*; it never overrides the others:

1. **Policy registry** (`policy/registry.ts`) — is the provider legally/product approved? (unapproved ⇒ `skipped-not-approved`)
2. **Engine config** — `enabled`, required env var, not `manual-only` (⇒ `skipped-not-scheduled`)
3. **Database switch** — `news_providers.status = 'disabled'` (⇒ `skipped-disabled`; the provider implementation is not even
   instantiated, so no fetch is possible)

then: **due?** (min interval, scheduled trigger only) → **overlap lock** → ingest. `news_sources.is_enabled` keeps working
exactly as in Phase 4: discovery is unchanged, but candidates from a disabled source become `disabled-source` rejections
instead of canonical rows.

## 3. Overlap protection

A **lease lock** in Postgres (`newsroom_locks`, key `ingest:<provider>`), taken with one atomic
`INSERT … ON CONFLICT DO UPDATE … WHERE expires_at <= now()`:

- A second tick while the first is running gets `skipped-locked` ("already-running"): no run row, no fetch, not an error.
- The lease has a TTL (20 min GKG, 10 min others). If a worker crashes, the lease simply expires and the next tick takes over —
  no manual unlock, no permanently stuck scheduler.
- A session-level `pg_advisory_lock` cannot be used: the server talks to Postgres over pooled REST/RPC calls, so a session
  lock would be gone before the next statement. A row with an expiry survives across requests.
- Unit-level idempotency (Phase 4) still protects the data even if two workers somehow overlapped; the lock avoids wasted work
  and confusing run history. Tested: 12 concurrent acquirers → 1 winner; two simultaneous ticks → 1 `ran`, 1 `skipped-locked`.

## 4. Stuck-run reaper

`news_reap_stale_runs(interval)` marks any `ingestion_runs` row still `running` after **30 minutes** as `failed` /
`provider_state = error`, sets `finished_at`, `error_message = 'stale-run-reaped: …'` and
`metadata.failure_reason = 'stale-run-reaped'`. It never deletes. 30 minutes is far above a normal run (seconds) and beyond the longest lock lease (20 min), so a live run is never
reaped. It runs in **two places**: as a pure-SQL cron job every 10 minutes (so recovery works even if the worker host is down)
and as the first step of every tick. `news:health` surfaces any run stuck past the threshold as a `stuck-run` alert.

## 5. Provider health

Health is derived only from `ingestion_runs` (plus the newest stored unit key) — there is no parallel metrics table to drift.
`test`-trigger runs are excluded. The evaluator is a set of pure functions (`engine/health.ts`); the data query is
`engine/health-data.ts`.

Per provider: last success, last attempt, minutes since last success, **consecutive failures / throttles / empties**, returned /
accepted / rejected / inserted over the last hour, latest error, latest processed unit, and (GKG) file lag.

### States — evaluated in this order, first match wins

| State | Rule |
| --- | --- |
| `disabled` | `news_providers.status = disabled`, **or** not schedulable (config off, manual-only, unapproved, missing API key) |
| `unknown` | schedulable but no run has ever been recorded |
| `down` | ≥ N consecutive **failed** runs (N = 3) |
| `stale` | no successful run within the provider's stale threshold (GKG 45 m, Wikipedia 3 h, NewsData 15 h) — or GKG processed lag ≥ 4 files |
| `degraded` | still working but unclean: DB status `degraded`, latest run `partial`, any current failure/throttle streak, ≥ 24 consecutive empties (Wikipedia only), or GKG lag ≥ 2 files |
| `healthy` | none of the above |

A *success* is a run that finished `succeeded`/`partial` with provider state `ok`/`empty`. A GKG tick where every file was
already stored is a success. `overall` is the worst state among providers that are expected to run (`disabled`/`unknown` never
worsen it).

### Alert conditions (queryable, not routed yet)

`provider-down` · `provider-stale` · `consecutive-failures` (warning at 2, critical at the down threshold) ·
`consecutive-throttles` (warning at 2) · `gkg-file-lag` (warning at 2 files, critical at 4, naming whether GDELT or ingestion
is behind) · `stuck-run` · plus info-level `provider-disabled` / `provider-never-run`. Each has a severity and provider id.
`pnpm news:health --strict` exits 3 when any critical alert exists, so a future notifier can poll it. No SMS/email/Slack yet.

## 6. GKG file lag and the publication grace period

GKG files are immutable snapshots named for a quarter-hour boundary in UTC (`YYYYMMDDHHMMSS`). A file is **not** published at
exactly its boundary, so a missing "current" file is not an outage.

- `latestExpectedStamp(now, grace = 10 min)` = the newest boundary that is at least `grace` old. At 04:47 UTC the 04:45 file
  is not yet expected (04:30 is); at 04:55 it is. At 00:05 UTC the expected file is the previous day's `…234500`.
- `computeGkgLag` compares **expected**, **latest available** (recorded by the last run from `lastupdate.txt` into
  `ingestion_runs.metadata.latest_available_unit`) and **latest processed** (`news_ingestion_units`), and reports files behind
  plus a cause: `ingest-behind` (files exist, we haven't ingested them) or `upstream-late` (GDELT itself is late).
- Thresholds: ≤ 1 file behind is normal between publication and the next tick; **degraded at 2, stale at 4**.
- Boundary tests cover hour changes, midnight UTC, month/year rollover, leap day, exact `boundary + grace`, and custom grace.

## 7. Security model

- **Endpoint:** `POST /api/internal/newsroom/tick` — server-only, Node runtime, never cached (`Cache-Control: no-store`),
  `X-Robots-Tag: noindex`, not linked anywhere, and the whole site is already `Disallow: /` in `robots.ts`.
- **Auth:** `Authorization: Bearer <NEWSROOM_CRON_SECRET>`, compared as SHA-256 digests with `timingSafeEqual` (constant time,
  length-independent). Wrong/missing ⇒ **401**. Secret unset or shorter than 32 chars ⇒ **503** — the endpoint never fails
  open. Non-POST ⇒ 405. Bad body / unknown provider ⇒ 400. Unexpected error ⇒ generic 500 (details only in server logs).
- Responses never contain secrets, env values or stack traces; the body is the concise `TickResult` JSON.
- The client-supplied `trigger` is ignored: the endpoint always means `scheduled`. Manual runs use the CLI.
- `NEWSROOM_CRON_SECRET` is a **dedicated** secret — never the Supabase secret key, never `NEXT_PUBLIC_*`.
- All Phase 5 tables/views/functions follow the Phase 4 posture: RLS on, no policies, everything revoked from
  `public/anon/authenticated`, `service_role` only (tested against the live DB).

## 8. Secrets: Vault and environment

| Where | What | Notes |
| --- | --- | --- |
| Worker host env | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEWSROOM_CRON_SECRET` | server-only; names are in `.env.example` |
| Supabase Vault | `newsroom_worker_url`, `newsroom_cron_secret` | read at call time by `newsroom_invoke_worker()`; **never** in a migration, in `cron.job`, or in source |

The schedule migration is portable and contains no secret and no environment-specific URL. Until both Vault secrets exist,
`newsroom_invoke_worker()` logs a warning and returns null — applying the migration anywhere is safe. Setup, URL change, pause
and **rotation** SQL is in `supabase/templates/newsroom-vault-secrets.template.sql` (rotation: set the new value on the host, then
`vault.update_secret(...)` immediately; a tick landing in between gets a 401 and the next slot retries it).

## 9. Local testing

```bash
pnpm db:start                                 # Supabase locally (Docker): applies all migrations, incl. cron jobs
pnpm news:worker                              # the production tick, locally (due-check applies)
pnpm news:worker --provider=gdelt-gkg --force # ignore the min-interval check
pnpm news:health [--json] [--strict] [--scheduler]
pnpm test        # unit — no network, no database (scheduler orchestration, health, lag, auth, static migration checks)
pnpm test:db     # 78 integration tests on a real local Postgres (locks, reaper, ticks, health, feed, cron wiring)
```

To exercise the full HTTP path locally: `pnpm build && pnpm start` (with `NEWSROOM_CRON_SECRET` set), point the Vault secrets at
`http://host.docker.internal:3000/api/internal/newsroom/tick`, and call `select public.newsroom_invoke_worker('gdelt-gkg');`
or wait for the next cron slot — see the validation in §13.

## 9a. Clustering stage (Phase 6)

After the per-provider loop, `runScheduledTick` runs `runClustering` (`src/lib/news/clustering/run.ts`) whenever at least one
provider ran without failing. It is a **separate failure boundary**: its own `try/catch`, its own overlap lease (`cluster:run`),
its own audit table (`clustering_runs`, not `ingestion_runs`). The outcome is reported in `TickResult.clustering`
(`ran` / `skipped-locked` / `failed` / `error`, plus considered / created / near-miss counts) and **never** changes
`TickResult.ok`, an ingestion run's status, or ingested data — a clustering failure cannot roll back or mark failed a successful
ingestion. No extra cron job: each ingestion tick clusters what it just stored (a pg_cron job only reaps stuck clustering runs).
`pnpm news:health` gains a minimal clustering section (warnings only). Details: [`STORY-CLUSTERING.md`](STORY-CLUSTERING.md) §11.

## 10. Internal read models (Phase 6 preparation — not public)

`src/lib/news/warehouse/feed.ts`:

- **`listFreshCandidates(query)`** over `news_candidate_feed`: freshest first (`published_at`, falling back to `discovered_at`),
  filters for sport, provider, source quality, minimum confidence, published/discovered windows, status (default roots only:
  `new`/`accepted`), disabled sources (hidden by default), limit (capped at 500). **Discovery text cannot masquerade as a
  headline:** the view has no plain `headline` column — publisher titles surface as `publisher_headline`, provider prose (Wikipedia
  Current Events sentences) only as `discovery_text`; discovery-text rows are excluded unless `includeDiscoveryText: true`, and
  `getPublishableHeadline(item)` returns `null` for them.
- **`listHeadlineGroupInputs(query)`** over the evolved `news_headline_groups`: normalized headline, source/candidate/provider
  counts, first/last seen and published, most common sport + all sports, and the **root candidate id** — the clean input for
  Phase 6 clustering. Publisher-title groups only by default.

## 11. Failure recovery and operational runbook

| Symptom (from `pnpm news:health`) | Meaning | Action |
| --- | --- | --- |
| `gdelt-gkg` **degraded**, 1 failed/throttled run | transient | none — next tick retries; unit idempotency makes it safe |
| `gdelt-gkg` **down** (3 failures) | repeated failures | read `latest error`; check GDELT `data.gdeltproject.org/gdeltv2/lastupdate.txt`, worker host logs, DB reachability |
| **stale**, `gkg-file-lag … GDELT publishing late` | GDELT files not appearing | wait; nothing to fix on our side. Catch-up is automatic (3 h lookback) |
| **stale**, `… ingestion behind` | files exist, worker isn't ingesting | check the worker host is up and `pnpm news:health --scheduler` shows the Vault secrets configured; run `pnpm news:worker --force` |
| `stuck-run` alert | a process died mid-run | none needed — the reaper closes it within ~10 min (`stale-run-reaped`); or `select news_reap_stale_runs('30 minutes')` |
| Worker host was down for hours | cron requests failed (pg_net timeout) | after recovery the next tick backfills up to 3 h automatically; for longer gaps: `pnpm news:ingest --provider=gdelt-gkg --window=6h` (max 24 files) |
| `worker: NOT configured` | Vault secrets unset | run the template SQL (§8) |
| Repeated 401 in host logs | secret mismatch | rotate per §8 so host env and Vault agree |
| Need to stop a provider now | operational kill switch | `update news_providers set status = 'disabled' where provider_key = 'gdelt-gkg';` — the next tick reports `skipped-disabled`, no network calls. Re-enable with `'active'` |
| Need to stop a bad publisher | source switch | `update news_sources set is_enabled = false where domain = '…';` (or `setSourceEnabled`) |
| Pause all scheduling | — | `select cron.alter_job((select jobid from cron.job where jobname='newsroom-gkg-ingest'), active := false);` |

`cron.job_run_details` is pruned to 7 days by a small daily job (`newsroom-cron-history-cleanup`); nothing else is deleted.

## 12. Remote deployment

**Status:** no Supabase project or hosting target is linked to this repository, so Phase 5 was built and validated against the
local stack only (the same Postgres extensions, migrations and cron jobs that hosted Supabase uses). The minimal steps:

1. **Supabase:** `pnpm exec supabase link --project-ref <ref>` then `pnpm exec supabase db push` (applies the three migrations,
   installs the cron jobs; enable the `pg_cron` and `pg_net` extensions in the dashboard if `db push` reports them unavailable).
2. **Host the app** on any Node-capable Next.js host with env `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and a fresh
   `NEWSROOM_CRON_SECRET` (`openssl rand -hex 32`).
3. **Vault:** run `supabase/templates/newsroom-vault-secrets.template.sql` once with the deployed URL
   (`https://<host>/api/internal/newsroom/tick`) and the same secret.
4. **Verify:** `pnpm news:health --scheduler` (against the remote env) shows the 5 jobs and `worker configured`; within 15 minutes
   `gdelt-gkg` reports a scheduled run.

## 13. Validation (2026-09-20, local Supabase, live GDELT GKG)

Fresh database (`db reset` applied all three migrations, installing the five cron jobs), production build served with
`next start`, worker secret generated locally and stored in Vault. Everything below went through the **production path**
(pg_cron → `newsroom_invoke_worker` → pg_net → Vault secret → Next route → `runScheduledTick` → warehouse), not the CLI.

| UTC | Trigger | Result |
| --- | --- | --- |
| 06:28:49 | `select newsroom_invoke_worker('gdelt-gkg')` via pg_net | HTTP **200**, run `scheduled`: 12 files, returned 139, accepted 138, rejected 1, **inserted 138**, duplicate-headline 62 |
| 06:32:00 | **natural cron slot** (`2-59/15`) | job `succeeded`; worker answered `skipped-not-due` (last attempt 3 m ago, min interval 10 m) — no run, no fetch |
| 06:32:36 | `pnpm news:worker --provider=wikipedia-events` | `scheduled` run: 4 inserted (discovery text, `publishable = null`) |
| 06:47:00 | **natural cron slot** | HTTP 200, `ran`: **1 new file processed, 11 stored files skipped without download**, returned 15, inserted 15, duplicate-headline 7, 1.1 s |
| 06:47:0x | immediate `pnpm news:worker` (no force) | `skipped-not-due` |
| 06:47:34 | `pnpm news:worker --force` | ran, **0 processed / 12 skipped**, returned 0, inserted 0, observations 0, sources created 0 (240 ms) |
| 06:47:5x | HTTP POST with the real secret | `skipped-not-due` |

HTTP contract checked against the running build: no auth → **401**, wrong secret → **401**, `GET` → **405**, unknown provider →
**400**, headers `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.

Integrity after the runs (SQL): `157` canonical candidates for `157` distinct normalized URLs (0 URLs with more than one row);
`13` GKG unit keys, `13` distinct; `0` headline groups with more than one root; `0` locks left held.

Health afterwards (`pnpm news:health`): overall **healthy**; `gdelt-gkg` healthy, latest unit `20260920064500`, expected
`20260920063000`, processed `20260920064500` — 0 files behind; 3 runs in the last hour (returned 154, accepted 153, rejected 1,
inserted 153); `wikipedia-events` healthy; `newsdata` disabled (no key); stuck runs 0; alerts 0. Scheduler check
(`--scheduler`): pg_cron and pg_net installed, worker configured (Vault), 5 active jobs.

Warehouse afterwards: 157 candidates → 88 distinct headlines (44.0% duplicate-headline), 157 observations, 95 sources; by provider
`gdelt-gkg` 153 / `wikipedia-events` 4; 4 runs, all `succeeded`. Internal feed sample: freshest-first publisher-titled roots;
Wikipedia rows only with `includeDiscoveryText`, each `publishable = null`.

## 14. What moves to Phase 6

~~Fuzzy same-event clustering~~ — built in Phase 6 ([`STORY-CLUSTERING.md`](STORY-CLUSTERING.md)); the `promoted` status; ranking and
editorial processing; routing alerts to a notifier; retention jobs; NewsData in production once a key exists.
