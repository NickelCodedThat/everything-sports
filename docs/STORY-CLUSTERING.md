# Story Clustering

**Status:** Phase 6 — Story Event Clustering ("One story. Every source.") — internal only; the public site still reads fixtures.
**Scope:** groups warehouse candidates that report the **same real-world event** into one `story_cluster`, deterministically
and conservatively, with the reason for every membership recorded. Read [`NEWS-WAREHOUSE.md`](NEWS-WAREHOUSE.md) (candidates,
headline groups, provenance) and [`NEWSROOM-ENGINE.md`](NEWSROOM-ENGINE.md) (the scheduled tick) first.
**Not in this phase:** ranking, editorial headlines, summaries, embeddings/LLMs, public routes, any browser exposure.

```
provider → candidate → warehouse → [ event clustering ] → StoryCluster → (future) ranking/editorial → public Story
                                          ▲ this phase
```

If 13 publishers report one NFL injury, the reader should eventually see **one event + all relevant sources**, not 13 cards.
This phase builds that event intelligence internally.

## 1. Design in one page

- **Deterministic evidence, no models.** Exact normalized headline → bounded time window → same sport → `pg_trgm` headline
  similarity → team / named-person / score / amount evidence → event type → contradiction guards. Everything is inspectable and
  reproducible; every membership stores *why* it happened.
- **Precision over recall.** A false split (two clusters for one event) is annoying; a false merge (unrelated events joined) is much
  worse. Only **HIGH** confidence auto-merges. Anything less seeds its own cluster and, if it was a near miss, lands in the
  needs-review queue.
- **Split of responsibilities.** Postgres owns what must be atomic or fast: fuzzy neighbour search, one-cluster-per-candidate,
  race guards, aggregates, representative selection, merges. TypeScript (`src/lib/news/clustering/`, pure and unit-tested) owns
  the judgement: features, guards, scoring, confidence. The two meet in `news_cluster_assign(candidate, decision jsonb)`.
- **Failure isolation.** Clustering is derived data. It runs as a separate stage after ingestion with its own audit table; a
  clustering failure never fails or rolls back an ingestion run.

## 2. Data model (`supabase/migrations/20260920140000_story_clustering.sql`)

| Object | Purpose |
| --- | --- |
| `story_clusters` | One real-world event: `sport`, `league`, `event_type` (nullable), `status` (`open`/`stable`/`closed`/`needs_review`), `representative_candidate_id`, `canonical_headline`, first/last seen + published, `candidate_count`, `source_count`, `provider_count`, `confidence`, `merged_into_id`. |
| `story_cluster_members` | **`candidate_id` is the primary key** → a candidate is in at most one cluster, enforced by the database. Keeps `cluster_id`, `joined_at`, `match_method` (`seed`/`exact-headline`/`fuzzy-headline`/`entity-overlap`/`manual`), `match_score`, `confidence`, `event_type`, `entities[]`, `evidence jsonb` (the full "why"), `merged_from_cluster_id`, `clustering_run_id`. |
| `story_cluster_ambiguities` | Near misses: candidate X nearly joined cluster Y but was below auto-merge confidence. `(candidate_id, cluster_id)` unique. |
| `story_cluster_merges` | Audit row per manual merge. |
| `clustering_runs` | Operational history (kept apart from `ingestion_runs`): status, counts, error, algorithm version. |
| `news_unclustered_candidates` (view) | The work queue and a health signal. |
| `story_cluster_feed` (view) | Live clusters + representative + entity union — the internal read model. |
| `story_cluster_review_queue` (view) | Unresolved near misses (candidate is in a *different* cluster than the one it nearly joined). |

Security is identical to Phases 4/5: RLS on every table with **no policies**, all privileges revoked from `public`/`anon`/
`authenticated`, `service_role` only, views are `security_invoker`. A migration test asserts this.

Candidate `status` is **not** touched: `news_candidate_feed` still defaults to `new`/`accepted`, and membership is the source of
truth for "is this candidate clustered".

### Aggregates never drift

`story_cluster_recompute(cluster)` recomputes counts, time span, sport/league/event type, confidence and the representative
**from the members**, inside the transaction that changed them, under a row lock on the cluster. Nothing increments a counter.

### Source count vs. provider count vs. rows

- `candidate_count` — member rows (URLs).
- `source_count` — **distinct publisher domains** (`news_sources`). Twelve URLs from one domain are one source; 12 sightings
  of one URL are one row and one source.
- `provider_count` — **distinct discovery providers** that ever saw any member: the candidate's canonical provider *and* every
  later sighting in `candidate_ingestion_events`. GDELT discovering five independent publishers is **1 provider, 5 sources**.

## 3. Matching pipeline

For each unclustered candidate, oldest first (ties by id, so runs are deterministic):

1. **Neighbour search** — `news_cluster_neighbors(candidate, window=48h, floor, limit=80, team_regex)` returns a *bounded* set:
   - rows with the identical `(headline_kind, normalized_headline)`;
   - **same-sport publisher titles** whose `similarity()` clears the search floor (via the `%` operator and the GIN index);
   - **same-sport publisher titles that mention one of the candidate's teams** (regex built from the team lexicon) — needed
     because two outlets often describe one game in very different words; this retrieval does not depend on cluster
     membership, so a dry run sees the same neighbours as a real run;
   - all within ±48 h of the candidate's own time. Clustered rows are collapsed to one per `(cluster, normalized headline)`.
   Never a comparison against "all candidates".
2. **Exact-headline** — a clustered neighbour with the identical normalized headline, same `headline_kind`, compatible sport
   (equal, or one side `unknown`/`other`), within 48 h → join, `exact-headline`, HIGH, score 1. This captures syndicated wire
   copy immediately. Identical text labelled as two *real* different sports is **not** merged and is queued for review.
3. **Fuzzy / entity evidence** (publisher titles only) — each clustered neighbour is scored by the pair scorer (§5); the best
   pair per cluster represents that cluster. Best cluster HIGH → join; otherwise **seed a new cluster**.
4. **Near misses** — clusters that scored MEDIUM (and not blocked) are recorded as ambiguities. If the candidate joined a cluster
   and *another* cluster also scored HIGH, that second cluster is recorded as `competing-high-confidence-cluster` (a merge
   suggestion).

`news_cluster_assign` performs the write atomically (§8).

### Discovery text

Wikipedia Current Events sentences are `headline_kind = 'discovery-text'` (CC BY-SA prose, not a publisher headline). They
cluster **only by exact identical text** (a sentence cited by several publishers becomes one cluster whose `source_count` is the
number of citing domains), never fuzzily, never with publisher titles, and **can never be the representative or canonical
headline** — a discovery-only cluster has `canonical_headline = null`. Linking an event sentence to the publisher stories that
cover it is future work (see §13).

## 4. `pg_trgm`

`create extension pg_trgm with schema extensions` in the migration (verified on a fresh `db reset`). Functions used:
`similarity()` and `word_similarity()` (both directions, greatest taken). `strict_word_similarity()` was evaluated and not used:
headlines are short and the two above already separate the cases we care about.

- **We never rely on the global `%` threshold (0.3).** `news_cluster_neighbors` calls
  `set_config('pg_trgm.similarity_threshold', p_floor, true)` (transaction-local) so the index-assisted `%` operator uses *our*
  search floor (`THRESHOLDS.searchFloor = 0.3`), and every match decision uses explicit thresholds owned by
  `clustering/config.ts`.
- **Index:** `news_candidates_headline_trgm_idx` — `GIN (normalized_headline extensions.gin_trgm_ops) WHERE headline_kind =
  'publisher-title'`.
  - *GIN, not GiST:* clustering is read-heavy (a neighbour search per new candidate) against a table that grows by tens of rows
    per 15 minutes, so GIN's faster lookup beats its slower maintenance.
  - *Partial:* discovery text never takes part in fuzzy matching; indexing it would only cost size and write time.
  - *Only this column:* no query trigram-searches `headline` (display text) or anything else; exact lookups keep using the
    existing btree on `normalized_headline`.
- **Evidence it is used** (`tests/integration/clustering`, real plan on the local corpus, seq scan disabled because 300 rows are
  too few for the planner to choose an index on its own):

  ```
  Bitmap Heap Scan on news_candidates
    Recheck Cond: ((normalized_headline % 'cubs beat reds 5-2') AND (headline_kind = 'publisher-title'))
    ->  Bitmap Index Scan on news_candidates_headline_trgm_idx
          Index Cond: (normalized_headline % 'cubs beat reds 5-2')
  ```

## 5. Pair scoring, confidence and thresholds (`clustering/score.ts`, `config.ts`)

The pair scorer returns a numeric `score` **and** the evidence beside it (similarities, token overlap, shared teams/names/scores,
both event types and their agreement, hours apart, window, every contradiction, the score parts). The score *ranks* competing
clusters; the **confidence label decides merging**, derived from explicit rules so the reason for a merge never hides in a
weighted sum:

```
text    = 0.50·similarity + 0.20·wordSimilarity + 0.30·tokenJaccard
entity  = min(1, 0.4·min(sharedTeams,2) + 0.2·min(sharedNames,2) + 0.1·sharedLeagues)
event   = same 1 | compatible 0.7 | unknown 0.35 | conflict 0
score   = 0.50·text + 0.30·entity + 0.15·event + 0.05·(shared score/amount) − 0.10·(hoursApart / window)
```

| Confidence | Rule | Action |
| --- | --- | --- |
| blocked | any `block` contradiction (§7) | never merge; score capped at 0.2 |
| **HIGH** (fuzzy) | `similarity ≥ 0.72`, ≥1 shared team/named person, event same or compatible | auto-merge (`fuzzy-headline`) |
| **HIGH** (near-identical) | `similarity ≥ 0.85`, ≥1 shared team/named person, event not in conflict | auto-merge (`fuzzy-headline`) |
| **HIGH** (entity) | event same/compatible **and** (≥2 shared teams, or 1 team + 1 named person, or ≥2 shared named people) — but never two previews | auto-merge (`entity-overlap`) |
| MEDIUM | HIGH conditions met but a `downgrade` contradiction fired; or `similarity ≥ 0.45` with a shared team/person; or ≥2 shared teams/people with an unclear event type; or two previews of one game | **not merged**, near-miss queue |
| LOW | everything else | not merged, not queued |

Cluster confidence = the **weakest member** confidence (a cluster is only as sure as its least certain join). Singleton and
exact-headline members are HIGH.

### Threshold evidence (live GKG corpus, 2026-09-20)

Ground truth = every distinct-headline cluster reviewed by hand (§12). Measured with `similarity()` on normalized headlines:

| Set | Pairs | Result |
| --- | --- | --- |
| **Same-event** pairs (different wording, inside one reviewed cluster) | 70 | median **0.27**, p75 0.53, max 0.97; only 9 ≥ 0.72 and 22 ≥ 0.45 |
| **Different-event** pairs (same sport, different clusters) | 3,478 | max **0.62**; 0 ≥ 0.72, 6 ≥ 0.45, 47 ≥ 0.30 |
| Highest different-event pairs | | 0.62 / 0.61 — *templated* previews ("how to watch X vs Y: TV channel and live stream") for **different** games; 0.60 / 0.54 — same-fight UFC stories (actually the same event, a false split) |

Reading: text similarity alone recovers only ~13 % of real same-event pairs at a threshold that has zero false merges on this
data, because outlets word the same game very differently. That is why the entity route exists (two shared teams / two shared
fighters + compatible event type) and why the templated-preview trap needs the event-type and preview rules (§6, §7).
`0.72` sits above the highest observed negative (0.62) with margin; `0.85` is the "same sentence, lightly edited" tier;
`0.45` is the lowest similarity worth a human glance; `0.30` is only the search floor.

## 6. Event types, entities, tokens

**Event type** (`clustering/event-type.ts`) — deterministic keyword rules with weights (3 = essentially means this type, 2 =
suggestive, 1 = weak hint that adds up); a type needs weight ≥ 2 to count, otherwise the type is **null (unclear — never
forced)**. Types: `trade`, `signing`, `injury`, `game-result`, `preview`, `record`, `discipline`, `coaching`, `draft`,
`transaction`, `retirement`, `death`, `business`, `other`. `preview` (how-to-watch, predictions, lineups, keys to victory) is an
addition to the brief's list: on real data it is the largest false-merge trap next to `game-result`. Hypotheticals are handled
("may defeat", "will steamroll" → preview, not result). Two headlines' types compare as `same`, `compatible` (each supported by
the other; or trade~signing~transaction, game-result~record), `unknown` (one side null — neutral, never enough for HIGH on its
own) or `conflict`.

**Entities** (`clustering/entities.ts`) — built on the existing sport lexicon, no roster database:
- **teams:** lexicon team/weak terms matched as case-sensitive proper nouns ("Congress debates new bills" is not NFL),
  aliases collapsed (D-backs = Diamondbacks, Sixers = 76ers, Cavs = Cavaliers…), ALL-CAPS headlines re-cased first;
- **leagues:** NBA/WNBA/NFL/MLB/…;
- **people:** capitalized-token heuristic with sports/city stoplists. Only *surnames of full names* ("Brandon Lowe" → `lowe`)
  count as evidence; Title-Case headlines (everything capitalized) contribute no name evidence; only full names can
  *contradict* another headline.
- **numbers:** final scores (unordered: 3-6 = 6-3; dates, times and years are not scores) and dollar amounts.

Stored per member as prefixed keys (`team:pirates`, `league:mlb`, `name:lowe`) beside the event type.

## 7. Contradiction guards (`clustering/guards.ts`)

Each guard is an explicit finding stored in the evidence. `block` = cannot be the same event; `downgrade` = cap at MEDIUM.

| Code | Severity | Fires when |
| --- | --- | --- |
| `sport-mismatch` | block | sports differ (no cross-sport fuzzy clustering in this phase) |
| `league-mismatch` | block | both leagues known and different |
| `outside-time-window` | block | further apart than the pair window (§9) |
| `event-type-conflict` | block | both types known and unrelated (preview ≠ result, injury ≠ trade) |
| `team-mismatch` | block | both name teams and share none |
| `different-opponent` | block | share a team but each side also names a team the other lacks |
| `score-mismatch` | block | both give final scores and none is shared (another game in the series) |
| `cluster-event-conflict` | block | the target cluster's event type conflicts with the candidate's |
| `cluster-span-exceeded` | block | joining would stretch the cluster past 2× the pair window (stops slow A~B~C~D chaining) |
| `person-mismatch` | downgrade | person-sensitive event (injury, signing, trade, discipline…) and different full names |
| `amount-mismatch` | downgrade | different dollar amounts |

## 8. Concurrency, idempotency, races

- **One cluster per candidate:** primary key on `story_cluster_members.candidate_id`.
- **One cluster per exact headline:** `news_cluster_assign` takes `pg_advisory_xact_lock(hash('story-cluster:' || kind || ':'
  || normalized_headline))`. A worker that intends to *create* a cluster re-checks, under that lock, whether a same-headline
  sibling was clustered by a concurrent worker since it looked, and joins it instead (`race_guard` in the evidence). Tested with
  eight simultaneous assigns of one headline → exactly one cluster.
- **Idempotent:** a candidate that already has a membership is returned as `already-clustered`; a re-run considers nothing new.
- **Overlap:** a `cluster:run` lease lock (`newsroom_locks`, 10-minute TTL) stops two runs from overlapping; the DB guards above
  still hold if the lock is bypassed.
- **Stale clusters:** a cluster merged away while a worker still holds its id forwards to the survivor.
- **Known gap:** two workers creating clusters for *different* headlines of one event at the same instant can produce two
  clusters. The lock prevents overlapping runs; if it is bypassed the near-miss queue and manual merge repair it.
- Lock order is fixed (advisory headline lock → cluster row; merges lock both clusters in id order) so there are no deadlocks.

## 9. Time windows

Measured on `coalesce(published_at, discovered_at)`. (GKG's `published_at` is the 15-minute file stamp.)

| Case | Window |
| --- | --- |
| Neighbour search radius | ±48 h |
| Exact normalized headline | 48 h (wire copies trickle out over a day; identical text weeks apart is not the same event) |
| Fuzzy, `game-result` / `record` / **unknown type** | **12 h** (a game is covered within hours; the next game in a series is ~a day later) |
| Fuzzy, everything else | 24 h |
| Pair window | the tighter of the two headlines' windows |
| Cluster span cap | 2 × pair window |

Cluster `status`: `open` on creation/join → `stable` after 24 h without new members → `closed` after 72 h
(`story_cluster_age_out`, run at the end of every clustering run). `closed` also marks an archived (merged) cluster.

## 10. Representative and canonical headline

Chosen in SQL by `story_cluster_recompute`, deterministically, in this order: publisher-title only → usable headline (20–220
chars, no truncation ellipsis, no ` – Site Name` suffix) → source enabled → source quality bucket (`known` > `unknown` >
`low-quality`; an operational bucket, **not** credibility) → classification confidence → has a real publication time → source
independence (a source contributing fewer candidates to the cluster wins) → earliest `published_at` → id. It is recomputed
whenever membership changes, so "first one wins forever" does not apply. `canonical_headline` is a verbatim copy of the
representative's publisher headline: **no rewriting, no AI summary**. Representative selection lives only in SQL (one
implementation, atomic with the membership change) and is covered by the database integration tests rather than unit tests.

## 11. Operations

```bash
pnpm news:cluster                            # cluster recent (24h) unclustered candidates
pnpm news:cluster --dry-run                  # decide and report — writes nothing (no clusters, memberships, run row or lock)
pnpm news:cluster --window=72h --sport=basketball --limit=500 --json
pnpm news:clusters                           # freshest clusters (--sport --event-type --confidence --min-sources --since --sort=most-sources)
pnpm news:clusters --show=<cluster-id>       # one cluster with every member, score and method
pnpm news:clusters --review                  # the needs-review (near-miss) queue
pnpm news:clusters --merge=<into>,<from> --reason="…"     # fold B into A
pnpm news:clusters --move=<candidate-id>,<to-cluster-id>   # fix one false merge
pnpm news:health                             # now includes a clustering section
```

- **Dry run** runs the *same* decision code but keeps assignments in memory so later candidates see clusters the dry run
  proposes. On the real corpus a dry run and the real run produced identical partitions (131 = 131 clusters, same membership).
  Report: proposed clusters, memberships, similarity/score, evidence (matched headline, shared teams/names, contradictions) and
  near misses. This is how thresholds are tuned safely.
- **Backfill** is the same command with a wider window; the default (24 h) never sweeps the whole history. Candidates already
  clustered are never revisited.
- **Manual merge** (`story_cluster_merge`): transactional; moves memberships with their original method/score/evidence (recording
  `merged_from_cluster_id`); provenance (`candidate_ingestion_events`) hangs off the candidate and is untouched; the emptied
  cluster is **archived** (`closed`, `merged_into_id`, counts 0), never deleted; a survivor must itself be un-merged and
  `merged_into_id` is only ever written on the archived side, so cycles are impossible; near misses pointing at the archived
  cluster are retargeted or resolved; an audit row is written; both aggregates are recomputed.
- **Move member** is the small "repair one false merge" operation. **Full split tooling is a future editorial-control feature**;
  because memberships are explicit rows it can be built without schema changes.
- **Scheduled integration:** `runScheduledTick` runs clustering as a **separate stage after ingestion**, whenever at least one
  provider ran without failing. It has its own try/catch and its own audit table (`clustering_runs`); a failure appears in
  `TickResult.clustering` (`failed`/`error`) and **never** changes `TickResult.ok`, an ingestion run's status, or its data.
  No new cron job is needed — every ingestion tick (GKG every 15 min, Wikipedia hourly) clusters what it just stored. A pg_cron
  job (`newsroom-reap-stale-clustering-runs`) reaps runs stuck in `running`.
- **Health** (`pnpm news:health`): last successful cluster run, unclustered recent candidates, near misses awaiting review,
  live cluster count, failed runs in 24 h. Alerts (`clustering-failed`, `clustering-stale`) are **warnings only** — derived
  data never makes ingestion look unhealthy.
- **Internal read model:** `listClusters(client, { sport, eventType, minConfidence, since, minSources, sort: 'freshest' |
  'most-sources', includeMembers })`, `getCluster`, `getClusterMembers`, `listReviewQueue` in
  `src/lib/news/clustering/queries.ts`. Server-only; no page or API imports it.

## 12. Real validation (live GDELT GKG, local Supabase, 2026-09-20)

Corpus: 289 candidates from 24 h of live GKG files (≈6 h of stories — one MLB Saturday, NFL Week 2 previews, UFC 331) plus 19
more ingested live through `pnpm news:worker` (the tick clustered them in the same run). 308 candidates, 172 distinct
headlines, 163 publisher domains.

**Result (289-candidate backfill):** 131 clusters, 289 memberships (158 joined an existing cluster), 37 near misses.
After the live tick: 133 clusters; 21 with ≥ 2 sources, 112 singletons, largest cluster 22 sources. Match methods:
136 exact-headline, 31 entity-overlap, 8 fuzzy-headline, 133 seeds. Every cluster is HIGH confidence (nothing below HIGH
auto-merges).

**Good clusters** (headlines paraphrased):
1. *Pirates 6, Royals 5, decided by a Brandon Lowe 8th-inning homer* — 17 candidates / 17 sources, **5 distinct wordings**
   (including a short-form "Lowe's go-ahead homer" and a full-city-name variant), joined by exact, fuzzy (0.90) and entity
   routes.
2. *D-backs' Pavin Smith walk-off homer beats Yankees 5-3* — 19 sources, 6 wordings, including a "Yankees let lead slip away in
   walk-off loss" recap written from the other dugout.
3. *Acuña grand slam lifts Braves past Astros* — 17 sources; "Acuña" vs "Acuna Jr." diacritics/aliases reconcile.
4. *Cubs beat Reds 5-2* — 18 sources; a Reds-side "sluggish offense in 5-2 loss" recap joins through the shared final score
   and both teams.
5. *Padres' rookie Ethan Salas walk-off in the 10th vs Marlins* — 10 sources, four wordings including a "magic number" angle.
6. *Van outlasts Pantoja at UFC 331* (individual sport, no teams) — joined via two shared named fighters + same event type.
7. *Ravens rule out a star receiver with a hamstring injury* — 11 copies of one wire headline → 1 cluster, 11 sources.

**Correct non-merges:**
1. *"Yankees vs. Diamondbacks: lineups, how to watch"* (preview) stayed out of the D-backs–Yankees **result** cluster —
   same two teams, same day, blocked by `event-type-conflict`.
2. *"Ravens rule out Flowers (hamstring)"* (injury) vs. the Ravens–Saints **preview** stories — same teams, different events.
3. *"Kyle Lowe guides SE Louisiana past UL Monroe 38-35"* vs the Pirates' Brandon Lowe story — shared surname, different sport
   and teams.
4. *"Cubs vs. Reds, Saturday 9/19, 5:40 CT live!"* (game thread, unclear type) was **not** merged into the Cubs–Reds result
   cluster: it was queued as a near miss instead.
5. Templated previews for *different* games ("How to watch Bournemouth vs Liverpool…" / "…Fulham vs Manchester United…",
   similarity 0.62) stayed apart: no shared team/person, not enough evidence.

**False merge found and fixed during validation:** the first pass merged *"Steelers, Aaron Rodgers will be without top player vs
Patriots"* (an injury-angle story) into a *"How to Watch Patriots vs. Steelers"* preview. Root cause: my new hypothetical-tense
rule read "top" in "top player" as a result verb, typing the story as a preview. Fixed (verb list no longer contains
"top"/"edge"/"win"), regression tests added. A second review finding: three same-game **previews** merged on team overlap
alone; previews of one game are related commentary, not one news event, so entity overlap no longer merges two previews
(they become near misses; near-identical wording still merges). **No false merge remains in the reviewed clusters** — but note
the corpus covers ~6 hours, so the series-game / doubleheader risk (§13) is not exercised by real data.

**Obvious false splits (accepted, all low-harm):**
- Puns and metaphor: *"Royals … can't overcome the Rays of Pittsburgh"* has no team name for the Pirates.
- Cross-story same-game angles with only one team named: a Tigers pitcher's "career-high 9 strikeouts vs. White Sox" is not tied
  to the Tigers–White Sox result cluster.
- Sports with no lexicon (soccer, most MMA): identical or near-identical wording still merges; different wording of one
  soccer result ("Brighton stun Arsenal 3-0" vs "Brighton thrash Arsenal 3-0", similarity 0.52) stays split.
- Coverage in a different event type: a "Carter Jensen breaks Royals rookie home run record" story is not merged into the
  game cluster.

## 13. Known weaknesses and next phase

- **Recall on team-less sports and non-lexicon sports.** Soccer, tennis, golf, F1, most MMA rely on exact/near-identical text
  or two shared named people. A larger entity layer (leagues beyond the three priority sports; a roster/athlete table) is the
  lever, not a lower similarity threshold.
- **Series games and doubleheaders.** Two headlines about *different games* between the same two teams inside 12 h could merge
  if neither carries a final score. The 12 h window, final-score contradiction and the cluster-span cap mitigate; not eliminated.
- **Name heuristic** is capitalization-based; Title-Case headlines yield none and the stoplists are hand-grown.
- **Event-type keywords** miss slang and idiom (typed `null`, which is safe — it can only lower confidence to MEDIUM).
  The cluster's `event_type` is the mode of its members', so a cluster mixing record + result coverage can carry either.
- **Arrival-order dependence:** clusters form oldest-first; backfilling in a different order can partition borderline cases
  differently. Merge/move tooling repairs it.
- **Time:** GKG `published_at` is a 15-minute file stamp, so pair distances are coarse.
- **Discovery text** is not yet linked to the publisher clusters it describes.
- **Not built:** split tooling, editorial workflow states, ranking, rewritten headlines, summaries, embeddings.

**Next phase — ranking + editorial publication pipeline.** Clusters are the input: rank by `source_count`, freshness,
sport priority (basketball > football > baseball) and confidence; write original editorial headlines/summaries for the chosen
representative event; promote to a public `Story` (this is where discovery-text may finally be used as supporting evidence and
where split tooling and the review queue become an editor's workflow).
