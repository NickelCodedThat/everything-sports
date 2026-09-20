# Editorial ranking and internal publication pipeline

Phase 7 adds internal editorial prioritization after story clustering. It does not publish articles.
The public homepage, story routes, search, sections and SEO continue to use fixtures. Approval is an
editorial decision for a future publication phase, not permission for a public read today.

## Philosophy and architecture

Rank the **story cluster**, never each provider result. Basketball has the strongest baseline,
football a close second, baseball a strong third; an important event in any sport can lead.
Scores express editorial importance, not truth, publisher credibility or expected engagement.
Every score has named components, every hold has reasons, and quiet desks stay quiet.

The path is providers → candidates → warehouse → clusters → ranking → internal editorial items →
internal slate. The pure modules in `src/lib/news/editorial-ranking` accept data and a clock.
Server-only loaders, orchestration and queries surround that engine. No public component imports it.

Four private tables are added:

- `editorial_items`: one row per cluster (`cluster_id` unique); current score, component evidence,
  eligibility, urgency, native desk, section qualification, representative, source counts and editor status.
- `editorial_ranking_runs`: trigger, algorithm version, window/sport filter, timestamps, counters,
  outcome and failure message for each persisted run.
- `editorial_overrides`: one active value per item/kind, with soft removal and supersession history.
- `editorial_events`: status decisions, override changes and changed approved headlines, with actor,
  timestamp, reason and before/after detail.

RLS is enabled without client policies. Tables, sequences and RPCs are inaccessible to anonymous and
authenticated roles; only service-role server tooling can access them. There is no public editorial view.
The existing `story_cluster_feed` and review queue supply inputs. Internal TypeScript read models are
`listItems`, `getItem`, `getSlate`, `getSupportingSources`, `getStoryPreview` and `getAudit`.

SQL functions are `editorial_upsert_items`, `editorial_finish_rank`, `editorial_set_status`,
`editorial_set_override`, `editorial_remove_override` and `news_reap_stale_ranking_runs`.
An additive approval-safety migration preserves existing installations of the initial Phase 7 schema.

## Eligibility and content safety

Eligibility is evaluated before overrides. Ineligible reasons include closed/merged or needs-review
clusters; missing representative publisher headline; discovery-text-only clusters; low confidence;
all sources disabled; all enabled sources low-quality; newest report older than 48 hours; betting
promotions/fantasy content; and editor-held or rejected status. A publisher representative must be an
enabled member, have nonblank publisher-title text, and match the canonical headline verbatim.
No override can invent that headline or bypass these content restrictions.

Medium confidence and unresolved competing-cluster or cross-sport headline ambiguity require review.
Review items may rank and appear on desks but cannot lead. Unknown source quality is allowed;
operational quality buckets do not become public credibility ratings. Multiple reasons are retained.
There is no automatic legal clearance: publisher-title metadata alone does not establish republication
rights, and approval must not be interpreted as licensed photography or article-body permission.

## Exact scoring model

`editorial-v1` sums `scoreParts` and rounds the final score to two decimals. There are no hidden sort
bonuses. Priority bands are 1 at 210+, 2 at 170+, 3 at 130+, otherwise 4.

1. Sport: basketball 100; football 95; baseball 90; boxing/MMA/soccer 70; hockey/Olympics 65;
   tennis 60; golf/motorsports 55; other/unknown 45.
2. Competition tier: professional +20, international +16, unspecified major sport +10,
   college +6, developmental 0. The reserved unspecified tier is +20. Explicit league wins;
   otherwise known league/team entities and college vocabulary supply evidence. Basketball,
   football and baseball without evidence use unspecified-major; other sports default professional,
   except Olympics international. This is heuristic, not a league database.
3. Recency: `60 × (0.5 × 2^(-newestAgeHours/6) + 0.5 × 2^(-eventAgeHours/10))`.
   Ages cannot go below zero. Newest/first publication times fall back to last/first seen times.
   A fresh re-syndication therefore cannot fully refresh an old event.
4. Event importance: death 55; trade/coaching/retirement 45; injury/discipline 40;
   signing/record 35; business/draft 30; transaction 20; game-result 15;
   other/unknown 10; preview −15. Positive importance is multiplied by 0.5 for one or fewer
   domains, 0.8 for two, and 1 for three or more. Preview penalties are never discounted.
5. Explicit stakes language adds 20, except previews. Championship, Finals, title/belt, World
   Series, Super Bowl and late-series language are text evidence, not invented competition metadata.
   Anniversary, reunion, replay, tribute and retrospective championship mentions do not qualify.
6. Breadth: `34 × min(1, log(domains)/log(20))`, zero at one or fewer domains. Distinct normalized
   headline variants add up to 8, logarithmically saturating at six variants. These two terms
   multiply by 0.55 for game results and 0.4 for previews. Two known domains add 3, three or more
   add 6. Extra discovery providers add 1 each, capped at 2. Maximum breadth is 50.
7. Velocity: enabled domains first reporting in the last 15 minutes add 5 each, capped at four;
   domains first reporting in the rest of the hour add 2 each, capped at five. At least two
   domains are required. Maximum 30; game-result multiplier 0.4, preview multiplier 0.3.
   Repeated rows from one publisher never count as new velocity.
8. Single-domain corroboration penalty −15. Urgency adds 0 / 12 / 30 for normal / developing /
   breaking-candidate. Confidence adds +5 high / −25 medium / 0 low (low is also ineligible).
9. Overrides add pin +1000, boost up to +300, suppress a chosen amount (default −80). Force-priority
   replaces the total using an explained delta component. It does not change eligibility.

Ties resolve by sport prior, newest report, then cluster ID. Equal inputs produce equal ordering and
scores at the same clock. Reranking updates the unique item rather than creating another one.
Source counts mean distinct enabled publisher domains, not candidate rows or independent investigations.
Different domains may still carry the same wire report; variant and routine-event discounts only
approximate reporting independence.

## Urgency and placement

Breaking-candidate is internal triage only. It requires trade, signing, injury, coaching, discipline,
retirement or death; high cluster confidence; newest report at most two hours old; at least two
domains overall and at least two domains first reporting within an hour. Single sources never qualify.
Rumor, hypothetical, commentary, preview, betting or fantasy language caps urgency at normal.
No source-specific exceptions exist. Developing needs a news event, two domains, confidence at least
medium and newest report at most six hours old; records, transactions, drafts and business may develop.
Routine game results and previews are normal. Public-compatible previews map breaking-candidate to
**developing**, never automatically to breaking.

Lead requires eligible, high-confidence, safe headline, age at most 12 hours, no preview, usable
sources and three domains, or two for an event with base importance at least 40. Routine game results
also need stakes language or at least 12 domains. Any sport may lead.

Wire requires at least two domains, age at most six hours, no preview/speculation and developing or
breaking-candidate urgency; alternatively four domains with two new in the last hour and either a
news event or stakes language. Ordinary syndicated recaps do not qualify solely through volume.

Desk/Now substance requires two domains or a strong, nonspeculative single-source news type
(trade, signing, injury, coaching, discipline, retirement, death, record). Previews do not fill desks.
Now additionally requires age at most 12 hours and score at least 160 (pins exempt from the score floor).

Native desks: basketball → The Run; football → The Huddle; baseball → The Diamond; boxing/MMA → Fight
Desk; soccer → World Game; remaining sports → Across the Board.

## Slate construction

Fill order: Lead → Wire → the six desks → Now. Depths: Lead 1, Wire 6, Run 8, Huddle 7, Diamond 6,
Fight Desk 4, World Game 4, Across the Board 4, Now 10. A cluster appears at most once across the whole
slate. Held, rejected, ineligible, published and headline-less items are excluded. Pins sort first
within qualifying sections; force-section works only when the item already qualifies.

Team caps: two per section, three across the slate. Wire/Now sport cap is `ceil(depth × 0.4)` and event
type cap `ceil(depth × 0.5)`, each at least one. These are caps against configured capacity, not a
promise about the percentage of a partially filled section. Single-sport desks have no sport/type caps.
Breaking candidates, pins and developing events with six or more domains are exempt, allowing a
major news moment to dominate. Scarce eligible stories produce shorter sections, never filler.

A conservative same-event guard skips apparent cluster splits within one sport and 24 hours:
two shared team/person entities, or one shared entity with token Jaccard overlap at least 0.3,
or wording overlap at least 0.4. Pins bypass this guard. Skips record reasons. This is presentation
suppression, not a merge, and may suppress distinct same-team events; clustering evidence is preserved.

## Editor lifecycle and audit

Initial status is candidate or review. Editors can approve, hold, reject, request review or release
to candidate. Published is reserved and refused by the status RPC. A hold/rejection immediately
excludes a read-model slate/preview even before reranking. Release followed by reranking restores
algorithmic eligibility; approval is refused while held/rejected or ineligible or without a headline.
Approval survives unchanged reranks. A changed approved headline returns to review and emits
`approved-headline-changed`, so an earlier approval never silently covers replacement text.

Overrides are separate from lifecycle. Suppress reduces score; hold excludes. Setting the same kind
supersedes the old row and audits both identities. Removal soft-closes active rows, retains history,
and restores the algorithmic score on rerank. Each mutation accepts actor and reason; redundant
status changes are no-ops. Merged-away items remain for history but lose rank and eligibility.
Items leaving the ranking window lose rank; their previous metadata remains inspectable.

```bash
pnpm news:rank --window=24h --explain
pnpm news:rank --dry-run --json
pnpm news:slate --refresh --explain
pnpm news:editorial --show=<item-or-cluster-id>
pnpm news:editorial --preview=<item-or-cluster-id>
pnpm news:editorial --pin=<item-id> --reason="Editor selection"
pnpm news:editorial --boost=<item-id>:75 --reason="Significant event"
pnpm news:editorial --hold=<item-id> --reason="Needs review"
pnpm news:editorial --release=<item-id> --reason="Review complete"
pnpm news:editorial --clear=<item-id> --reason="Restore ranking"
```

Editor mutations rerank by default; `--no-rank` deliberately leaves score/override snapshots stale.
Refresh failures return failure rather than silently showing a successful refresh. `--sport` creates
a scoped ranking run; finishing any run clears ranks from the prior run, so the current slate then
reflects that filtered run. Run without a sport filter to restore the whole internal front page.

## Supporting sources and honest Story mapping

The source panel contains one entry per enabled publisher domain. The representative wins its domain;
otherwise the earliest report wins. Ordering is representative, known/unknown/low-quality bucket,
earliest timestamp, then domain. Discovery prose has a null display headline. Metadata includes
publisher, domain, source URL and available publication time (falling back to discovery time).
No article bodies or source imagery are copied into the preview.

`StoryPreview` is deliberately not the public `Story`: it includes real headline, attribution,
source count, sport, available league/type/timestamps, status and eligibility. Deck/dek, author/byline,
article body, image, slug and credibility tier are absent, with an explicit `missing` list.
Stored dek remains null and image status missing through ranking. Missing attribution/timestamps stay
null. No public image usage occurs. `STORY_FIELD_MAP` documents each future mapping decision.

## Scheduled integration and failure isolation

`runScheduledTick` ranks only after ingestion ran and clustering succeeded. Ranking has a separate
try/catch, lease (`rank:run`, ten minutes), run audit and report section. Ranking failure never changes
ingestion success, clustering success or `TickResult.ok`. Ranking performs no provider network calls.
Dry runs take no lock and write no audit/items. Runs abandoned for 30 minutes are marked failed by
`news_reap_stale_ranking_runs`; its cron job runs every ten minutes. Health includes last success,
its age, current eligible/held/approved counts and failures in the last day. Failures/staleness after
60 minutes produce warnings, independent of provider health. Test-triggered runs do not skew health.

Writes occur in chunks, not one transaction for the entire ranking run. A failed later chunk can
leave partial derived updates; the failed run is audited and a successful rerun repairs them. This
internal read model must not become a public publication transaction without additional design.

## Real-data tuning evidence

The inherited engineering validation covered **995 live GKG candidates over approximately 32 hours**:
baseball 478, football 265, MMA 87, soccer 68, basketball 37; 462 clusters, 459 ranked in a 24-hour
window (455 eligible, two review, two held). These are the earlier validation figures, not a new
reproduction: the local database was empty when the completion audit began.

Earlier bad rankings and generalized fixes:

1. Syndicated baseball recaps flooded the top: routine-event breadth/velocity discounts.
2. Important-sounding single-source speculation ranked too highly: corroboration-scaled event
   importance, −15 penalty and speculation recognition including “likely.”
3. Professional fights received an unspecified tier: default pro for sports without the college
   structure; stakes bonus raised to 20.
4. Overnight recaps looked new when re-syndicated: equal weighting of event age and newest report.
5. Thin basketball filler, recap-heavy Wire and baseball-only Now: substance gates, tighter Wire,
   cross-sport concentration caps and Now score floor.
6. A sportsbook promotion reached Fight Desk: betting/fantasy eligibility exclusion.
7. Event-type caps constrained single-sport desks: limit them to cross-sport sections.
8. Split fight, record, hockey and multisport events repeated: same-event slate guard.
9. “Interim title,” “fires a club to victory,” and jersey-number ceremonies misclassified: generalized
   coaching/retirement phrase changes; expanded injury wording. Regression tests use synthetic text.
10. Rejected items lost their inspectable headline: safe headline retention independent of eligibility.
11. Completion-sample recap entered Wire because another member mentioned a championship anniversary:
    exclude commemorative championship references from stakes detection, while preserving current finals.

That slate led with the Baltimore receiver injury (23 sources, developing). Wire contained a New York
baseball rookie record, hockey controversy and a UFC title fight. The Run had three items, Huddle
seven, Diamond six, Fight Desk three, World Game four, Across the Board three and Now four. Quiet
basketball reflected the September offseason. Earlier audited manual checks showed boost moving
an item from rank 11 to 1, pin from 67 to 1 without bypassing Lead requirements, hold/reject exclusion,
unsafe approval refusal and release/clear restoring algorithmic order.

Completion regressions additionally cover representative integrity, held/rejected previews before
reranking, approved-headline replacement, repeated slate inputs and invalid operator arguments.

## Completion validation (2026-09-20)

A bounded fresh six-hour GKG sample (24 files) returned 263 candidates: 260 stored, three betting/fantasy
rows rejected. It contains 150 publisher domains and 127 distinct normalized headlines; clustering
produced 94 clusters and 22 ambiguity records. Ranking succeeded for all 94 (94 eligible; no review
or held items), and reranking created zero additional items and updated all 94.

Sport counts: baseball 166, MMA 47, football 25, soccer 13, motorsports four, Olympics two,
basketball one, hockey one and golf one. The earlier 995-candidate corpus is separate evidence and
is not added to these totals.

The corrected final Lead is the Baltimore receiver injury, six publishers, developing. Wire contains
the New York rookie hit record (six) and UFC flyweight title result (11). The Run is empty: the sole
basketball candidate does not meet placement requirements. Huddle has two single-source discipline/
legal reports after its strongest injury item moves to Lead. Diamond has six well-supported results
(5–30 publishers), with ordinary recaps correctly on the desk rather than Wire. Fight Desk has one
broader event roundup; World Game has two (manager resignation and scoring milestone); Across the
Board has one hockey controversy. Now has four baseball results: its capacity-based cap permits four,
not a guaranteed mixed-sport percentage when other desks consume the available stories.

Editorial assessment: a plausible quiet overnight sports front page, with a meaningful injury Lead,
a selective Wire and deep baseball results. Basketball is honestly quiet. Single-source legal stories,
roundup overlap and a baseball-only residual Now remain judgment/coverage weaknesses, not fabricated
content to fill. No fresh external fetch is required by any automated integration test.

Final automated acceptance: 585 unit tests, 151 real-Postgres integration tests and 38 Playwright E2E
tests; typecheck, lint and production build pass. A fresh local reset applied all six migrations;
generated database types matched the committed file byte-for-byte. Completion adds 128 unit tests
and 35 integration tests beyond the partial Phase 7 commit (457/116), including 11 Phase 6 typing
regressions. The original Phase 6 baseline was 437/116/38.

## Known limits and future public integration

Weights were tuned on one weekend, not a season. Basketball coverage is season-dependent. Sponsor
press releases and retrospective single-source news may still qualify. Tier inference, event typing,
entity extraction and headline-derived stakes remain heuristics. Domain counts are an approximation
of independent reporting. False cluster splits and false same-event suppression remain possible.

Current reads are bounded (cluster load requests 2,000; slate reads 1,000). Cluster inputs, member,
source-panel, editor-state and review reads page in stable batches of 500 to avoid PostgREST row-cap
truncation. Atomic run snapshots and revisiting these explicit capacity limits are required before
expanding production scope. Operator source changes require reranking to refresh
stored eligibility. No automated rights clearance, original summary, author attribution or licensed
image workflow exists. These are future publication responsibilities, not missing fields to fabricate.

Phase 8 may introduce a controlled server-side approved-item read only after this phase is audited.
It must decide publication snapshots, freshness, rights, actual Story fields, routes/SEO/search and
safe fallback behavior. Real-content visual/motion work begins there; none is part of Phase 7.
