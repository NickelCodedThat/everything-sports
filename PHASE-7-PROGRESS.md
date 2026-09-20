# Phase 7 — Editorial Ranking + Internal Publication Pipeline: PROGRESS SNAPSHOT

**State:** IN PROGRESS, stopped mid-phase at the user's request. **Nothing is committed or pushed.**
Base head is still `c752480109cd6098a57acc04a2782631ec4ed557` (Phase 6). All Phase 7 work is uncommitted in the working tree.
**No quality gates have been run on the Phase 7 code** (typecheck passed at last check; lint, test, test:db, test:e2e, build and a fresh `db reset` have NOT been run since).

---

## DONE (written, compiles, exercised on real data)

### Database — `supabase/migrations/20260920160000_editorial_ranking.sql` (applied to local DB via `migration up`)
- Tables: `editorial_ranking_runs`, `editorial_items` (`cluster_id` UNIQUE, status `candidate|review|approved|held|rejected|published`(reserved), `dek` always null, `image_status='missing'`, score_parts / eligibility_reasons / section_eligibility jsonb), `editorial_overrides` (kinds pin/boost/suppress/force_section/force_priority; soft-remove; one active per item+kind), `editorial_events` (audit).
- Functions (all service_role only): `editorial_upsert_items` (idempotent upsert; status is editor-owned; logs `approved-headline-changed`), `editorial_finish_rank` (un-ranks stale items, closes items of merged clusters), `editorial_set_status` (refuses `published`; approval requires headline + not ineligible), `editorial_set_override`, `editorial_remove_override`, `news_reap_stale_ranking_runs` + cron job `newsroom-reap-stale-ranking-runs`.
- RLS on, no policies, everything revoked from public/anon/authenticated.
- `src/lib/news/warehouse/database.types.ts` regenerated (+337 lines, additive).

### Pure ranking engine — `src/lib/news/editorial-ranking/`
`config.ts` (all weights/caps), `types.ts`, `signals.ts`, `urgency.ts`, `eligibility.ts`, `sections.ts`, `score.ts`, `slate.ts`, `story-mapping.ts`, `data.ts`, `run.ts`, `queries.ts`, `health.ts`, `report.ts`, `cli.ts`, `index.ts`.

**Score** = plain sum of named parts (`scoreParts[]`, sums to `finalScore`):
sport prior (basketball 100 / football 95 / baseball 90 / boxing-mma-soccer 70 / hockey 65 / olympics 65 / tennis 60 / golf-motorsports 55 / other 45) · tier (pro +20, intl +16, unspecified-major +10, college +6, developmental 0; non-college sports default pro) · recency (0–60, half-life blend: newest report 6h ×0.5 + event age 10h ×0.5) · event importance (death 55, trade/coaching/retirement 45, injury/discipline 40, signing/record 35, business/draft 30, transaction 20, game-result 15, preview −15; scaled ×0.5 / ×0.8 / ×1.0 for 1 / 2 / 3+ sources) · stakes-language bonus (+20, text evidence only) · breadth (distinct domains, log scale saturating at 20, max 34; + independence 8, known-confirmation ≤6, providers ≤2; discounted ×0.55 game-result, ×0.4 preview) · velocity (new domains last 15m ×5 ≤4, rest of hour ×2 ≤5; needs ≥2 domains; ×0.4 for game results) · uncorroborated single-source −15 · urgency (developing +12, breaking-candidate +30) · confidence (high +5, medium −25) · overrides (pin +1000, boost +n ≤300, suppress −80 default, force_priority replaces total).

**Eligibility** (before overrides; reasons never dropped silently): ineligible = closed cluster, needs_review, discovery-text-only / no publisher headline, low confidence, all sources disabled, all low-quality, too old (>48h), betting/fantasy content, editor rejected/held. Review = medium confidence, unresolved high-confidence clustering ambiguity.
**Urgency:** normal / developing / breaking-candidate. Breaking-candidate needs a real news type (trade, signing, injury, coaching, discipline, retirement, death), high confidence, newest ≤2h, ≥2 independent domains, ≥2 domains in last hour, no rumor/preview/betting language. Single source never automatic. No exceptions defined.
**Sections:** native desk mapping (run/huddle/diamond/fight-desk/world-game/across-the-board); Lead / Wire / Now / desk eligibility rules (Lead any sport; game results need stakes or ≥12 sources; Wire = developing/breaking or fast-moving news/stakes, never routine recaps; desks/Now need substance: ≥2 sources or a strong news type without speculation; Now score floor 160).
**Slate:** unique cluster per slate; fill order Lead → Wire → desks → Now; per-section diversity (≤2/team, ≤3/team slate-wide, sport share ≤40% in Wire/Now, event-type share ≤50% in Wire/Now, exemptions for breaking-candidates/pins/developing stories with ≥6 sources); same-event guard (≥2 shared entities, or shared entity + wording overlap, or ≥0.4 headline-token overlap, within 24h); every skip reported; quiet sections return fewer items.
**Story mapping:** `StoryPreview` (not a `Story`), `STORY_FIELD_MAP`; never fabricates deck/byline/image/slug/credibility tier; `breaking-candidate` maps to `developing`; `readyForPublication` only when approved; returns null when no publication-safe headline.
**Supporting sources:** representative first, one entry per publisher domain, metadata only.
**Run:** `runEditorialRanking` (lease lock `rank:run`, run-row audit, upsert per cluster, dry-run writes nothing, stale-run reaper).
**Health:** `collectEditorialHealth` (last success + age, eligible/held/approved counts, failures 24h; warnings only).

### Integration
- `src/lib/news/engine/tick.ts`: ranking stage after SUCCESSFUL clustering, own try/catch, `TickResult.ranking` (never affects `ok`, ingestion, or clustering); `report.ts`, `health.ts`, `health-data.ts` extended (editorial section in `pnpm news:health`).
- CLIs (+ `package.json` scripts): `pnpm news:rank` (--window --sport --top --explain --dry-run --json), `pnpm news:slate` (--refresh --explain --json), `pnpm news:editorial` (--list/--show/--preview/--approve/--hold/--reject/--review/--release/--boost/--suppress/--pin/--unpin/--force-section/--force-priority/--clear, --reason, --no-rank, --json). Mutations audit to `editorial_events` and re-rank.
- Phase 6 clustering rule fixes found during ranking validation: injury phrasing ("out vs.", more body parts), coaching (`fires` only with coach/manager object, `interim` only with coach/manager), retirement (no longer matches "retires her number").
- Test infrastructure edits: `tests/integration/warehouse/helpers.ts` truncates `editorial_ranking_runs`; two unit fixtures gained `ranking: null`.
- Scratch (NOT to commit): `scripts/_backfill-gkg.ts` (24h backfill helper — delete before committing).

### Unit tests written so far (passing)
`tests/unit/news/editorial-helpers.ts`, `tests/unit/news/editorial-signals.test.ts` — 20 tests (sport hierarchy, recency decay, breadth/domain counting/caps, velocity, event importance/corroboration/stakes, tier inference).

### Real-data validation performed
Corpus rebuilt from live GKG: 995 candidates over ~32h (baseball 478, football 265, mma 87, soccer 68, basketball 37 — mid-September, NBA offseason), 462 clusters, 459 ranked in a 24h window (455 eligible / 2 review / 2 held). Iterated on it as an editor:

Bad rankings found → changes made:
1. Routine baseball recaps flooded the top 20 (wire-syndicated breadth/velocity) → routine-event discounts on breadth and velocity.
2. Single-source "important-sounding" items ranked top 15 on the sport prior alone (e.g. speculative manager-firing, crime item) → corroboration factor on event importance + −15 uncorroborated penalty + "likely" as speculation language.
3. UFC got tier +10 instead of pro +20 → non-college sports default to professional; stakes bonus 12→20 so title fights register.
4. Re-syndicated overnight recaps looked "fresh" → recency reweighted to event age (0.5/0.5).
5. Basketball desk filled with single-source filler; Now was 8 baseball items; Wire held routine recaps → substance rule, Wire tightened, sport/event-type caps, Now floor.
6. "Bet365 Bonus Code" promo ranked #3 on Fight Desk → betting/fantasy ineligible.
7. Event-type cap wrongly applied to single-sport desks → cross-sport sections only.
8. Same UFC fight / WNBA record / Asian Games / NHL story each appeared 2–4× (clustering false splits) → slate same-event guard.
9. Mis-typed events ("Interim WBC Title" as coaching, "hat-trick fires Barcelona" as coaching, "retires her number") → clustering rule fixes above.
10. Editor-rejected item lost its headline → headline nulls only when no publication-safe publisher headline.

Current slate (24h window): Lead = Ravens WR Flowers ruled out (23 sources, developing); Wire = Mets/Phillies rookie record, NHL star Putin-party backlash, UFC 331 Van–Pantoja title fight; The Run = 3 items (quiet, offseason); Huddle 7; Diamond 6 (recaps); Fight Desk 3; World Game 4; Across the Board 3; Now 4.

Override validation done on real data (all audited): boost moved Angels–Twins rank 11→1; pin moved a single-source WNBA record rank 67→1 but did NOT make it Lead (overrides can't bypass eligibility); hold removed it from the slate; reject → ineligible (`editor-rejected`); approve of an ineligible item refused; release + clear restored algorithmic rank (~12); audit trail shows every change.

---

## NOT DONE (remaining work)

1. **Unit tests still to write:** eligibility, urgency, score parts/sum invariant, sport-tie behavior, overrides (incl. no-bypass), section assignment, slate uniqueness + diversity + same-event guard + quiet sections, Story mapping safety, CLI arg parsing, migration static test additions (new tables RLS, functions restricted, unique cluster_id).
2. **DB integration tests** (`tests/integration/editorial/`): one item per cluster, ranking idempotency, override + status audit, approve/hold/reject rules, rank-run audit, dry-run writes nothing, failure isolation in the tick, ranking runs only after successful clustering, supporting sources, merged-cluster closure, health.
3. **Update existing tests** that pin cron job lists (`newsroom-reap-stale-ranking-runs` was added) and any tick tests that now also run ranking.
4. **Docs:** create `docs/EDITORIAL-RANKING.md`; update `docs/STORY-CLUSTERING.md`, `docs/NEWSROOM-ENGINE.md`, `README.md` (do NOT touch `docs/BRAND-UI-BLUEPRINT.md`).
5. **Quality gates:** typecheck, lint, test (437 baseline), test:db (116 baseline), test:e2e (38), build; fresh `db reset` + migration apply + `db:types` byte-comparison; confirm homepage unchanged (no edits under `src/app`, `src/components`, `src/data`, `public`).
6. Delete `scripts/_backfill-gkg.ts`; re-check `git status` and `git diff` for stray files.
7. Commit (`feat: rank clustered stories for editorial review`, zero AI attribution), push `origin/main`, verify remote and clean tree.
8. Final Phase 7 report and READY/NOT READY recommendation for Phase 8.

## Known weaknesses to document
Basketball is thin only because the corpus is mid-September; sponsor/press-release content (e.g. a beer-brand NFL item) still passes; clustering false splits (Kane record, some UFC pieces) are only partly masked by the slate same-event guard; tier inference is heuristic; weights are tuned on ~32h of one weekend's data; the retrospective single-source item ("in 2020") still passes the substance rule; representative/desk logic depends on Phase 6 event typing.

## Files changed so far
Modified: `package.json`, `src/lib/news/clustering/event-type.ts`, `src/lib/news/engine/{health,health-data,report,tick}.ts`, `src/lib/news/warehouse/database.types.ts`, `tests/integration/warehouse/helpers.ts`, `tests/unit/news/{engine-http,parse-ingest-args}.test.ts`.
New: `supabase/migrations/20260920160000_editorial_ranking.sql`, `src/lib/news/editorial-ranking/*` (16 files), `scripts/news-{rank,slate,editorial}.ts`, `tests/unit/news/editorial-{helpers.ts,signals.test.ts}`, and the scratch `scripts/_backfill-gkg.ts`.
