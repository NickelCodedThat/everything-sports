# News Source Strategy

**Status:** Phase 3 — Multi-Source Live Newsroom Foundation, live-validated and hardened 2026-09-20 (section 15)
**Scope:** how Everything Sports discovers real sports news without paying for a news API, and the
rules governing what we're allowed to do with what we discover.

This document is the companion to `docs/BRAND-UI-BLUEPRINT.md` for the newsroom/data side of the
product. It does not modify or supersede the blueprint.

## 1. Free-first newsroom strategy

Everything Sports is free-first: real sports news, zero news-data spend, maximum readership,
premium presentation. We will not pay for a commercial news API until audience scale or product
quality justifies it. Instead of depending on one paid vendor, the newsroom combines multiple
legally usable free sources, each doing the job it's actually good at, and each governed by an
explicit, reviewed policy record (section 6).

This means the newsroom is deliberately built to be **provider-plural from day one** — no part of
the domain model, the candidate pipeline, or the CLI assumes there is exactly one source of news.

## 2. GDELT's role: fast discovery

[GDELT DOC 2.0](https://api.gdeltproject.org/api/v2/doc/doc) is the primary provider. It's free,
requires no API key, indexes global news near-real-time, and its DOC 2.0 dataset supports
commercial use with attribution. Its job is **discovery speed** — surfacing that something
happened, fast.

GDELT is explicitly **not** the publisher of anything it returns. It's a discovery/index layer
over the actual web. Every GDELT candidate records the real publisher's domain, never GDELT's own
domain, as the source.

GDELT enforces a documented limit of roughly one request every 5 seconds per client; the provider
respects this automatically when a single probe spans multiple sport query profiles (see section
11).

## 3. NewsData's role: coverage/backfill

[NewsData.io](https://newsdata.io)'s free tier is the secondary provider — breadth and backfill,
not speed. Its free tier runs roughly 12 hours behind. The newsroom treats this as a hard rule, not
a suggestion: **a NewsData candidate must never be presented as more current than a genuinely
fresher GDELT-discovered candidate for the same event**, regardless of how much richer NewsData's
payload looks. This is enforced structurally — every candidate carries its provider's
`expectedFreshness`, and nothing in the pipeline reorders candidates by payload richness.

NewsData requires `NEWSDATA_API_KEY` (server-only — see section 12). Without a key, the provider
returns a clean `unavailable` result. It never crashes the newsroom and never falls back to a
client-exposed key.

## 4. Why multiple providers beat single-vendor dependency

One free-tier vendor is one point of failure: a rate limit, a policy change, a key rotation, or a
quiet quality regression can silently starve the whole newsroom. Two independent providers with
different strengths (GDELT's speed, NewsData's breadth) and independent failure modes mean a
problem with one doesn't take down the other — the aggregator (section 8) is built specifically so
that one provider failing never destroys another provider's results.

## 5. NewsCandidate vs. Story

External API results are **not** finished Everything Sports Stories. The pipeline is:

```
GDELT ─┐
       ├─→ NewsCandidate ─→ normalize ─→ classify ─→ deduplicate ─→ cluster ─→ rank ─→ editorial ─→ Story
NewsData ┘
```

A `NewsCandidate` (`src/lib/news/candidates/types.ts`) means "something our newsroom discovered
that may eventually become an Everything Sports Story." It is intentionally thin and
provider-neutral: headline, publisher, source URL, timestamps, language, classification, and
minimal provider metadata for debugging — never a full article body, never a large raw API
response.

**Phase 3 builds only the discovery and candidate-normalization layers** (GDELT, NewsData,
normalize, classify, fingerprint/duplicate-flag). Deduplication beyond exact-URL flagging,
clustering, ranking integration, and editorial processing into a `Story` are later phases. The
production homepage keeps reading from the Phase 1/2 fixture data unchanged — nothing in this
phase touches `src/data/stories.ts` or `buildHomepage`.

## 6. Provider-policy registry

`src/lib/news/policy/registry.ts` is the single, machine-readable source of truth for what we're
allowed to do with each provider — GDELT, NewsData, and the four providers we evaluated and did
**not** activate (GNews, NewsAPI, Currents, ESPN RSS; section 10). Every record has a `status`
(`approved` / `development-only` / `deferred` / `rejected`), freshness, API-key requirement, and
explicit display/storage allowances (headline, snippet, image, persistent metadata, full article).

Code consults this registry rather than assuming rights. When a policy is uncertain, every
allowance defaults to the more restrictive value — this is enforced by test
(`tests/unit/news/policy-registry.test.ts`) for every non-approved provider. `policyReviewDate` is
set to **2026-09-14** for every record; nothing here should be treated as evaluated beyond that
date without a fresh review.

## 7. Source attribution model

Every candidate records the actual publisher's domain (`publisherDomain`) and, when available, the
publisher's name (`publisherName`) — derived from the candidate's own URL, never from the
discovering provider. GDELT and NewsData are recorded as the `provider` field (how we found it),
which is a distinct concept from who published it. Attribution to the original publisher is
required and preserved end to end; attribution to GDELT itself is required by GDELT's terms where
we surface GDELT-sourced content, and is a separate, additional credit — not a substitute for
publisher attribution.

## 8. Image restrictions

If a provider returns an image URL, the newsroom stores it **only** as an optional diagnostic
reference (`NewsCandidate.imageRef`) for debugging — never rendered, never downloaded, never
proxied, never committed to the repository. Every policy record in section 6 sets
`imageDisplayAllowed: false`. The public homepage's existing Everything Sports artwork
(`public/images/fixtures`) is untouched and remains the only imagery the public product renders
until a licensed-imagery strategy exists.

## 9. No-full-text rule

The newsroom does not retrieve, scrape, store, or republish full third-party article text, HTML
article bodies, scraped page contents, or publisher/wire-service photographs. A `NewsCandidate`
carries a headline, a link, and classification metadata — nothing that could be mistaken for the
article itself. A `snippet` field exists in the type but is only ever populated when a provider's
policy record explicitly sets `snippetDisplayAllowed: true`; as of this review, no active provider
does (see section 6). We link to original reporting. We do not reproduce it.

## 10. Rejected/deferred providers

Evaluated and given policy records, but **not** wired into any `CandidateProvider`:

| Provider | Status | Why |
| --- | --- | --- |
| GNews (free) | `rejected` | Free tier is development/non-commercial in intent; unsuitable for a production free-first product. |
| NewsAPI.org (free) | `rejected` | Free tier is explicitly a development/testing tier; disallows production use. |
| Currents API | `deferred` | Current terms appear to conflict with parts of our planned long-term permanent warehouse/derivative-works workflow — revisit after a further rights review, not a permanent no. |
| ESPN RSS | `rejected` | Display/modification/advertising restrictions make it unsuitable as a foundational monetizable feed. |
| Publisher / team RSS (Fox Sports, CNN, NFL team sites, CBS Sports) | `rejected` | Fox Sports and team feeds are "free … for individuals and non-profit organizations for non-commercial use"; CNN bars advertising alongside RSS content; CBS Sports has no RSS-specific commercial grant (ambiguous → restrictive). Reviewed 2026-09-20. |
| Google News RSS / Bing News RSS | `rejected` | Unofficial feeds with no commercial-aggregation grant; ambiguous → restrictive. Used only as a small internal engineering sample (section 15), never as a source. |
| Wikinews | `deferred` | License is fine (CC BY) but live check found sports posts weeks apart and mostly amateur soccer — not useful. |

Reconsidering any of these requires updating its policy record after an actual terms review, not
just flipping a status flag.

## 11. Running `pnpm news:probe`

```bash
pnpm news:probe                                                    # all approved providers, every sport, 3h window
pnpm news:probe --provider=gdelt --sport=basketball --window=3h --limit=20
pnpm news:probe --provider=all --json                              # structured output for debugging
pnpm news:probe --provider=local --sport=basketball                # offline, no network — exercises the pipeline against fixture data
```

Flags: `--provider=gdelt|gdelt-gkg|newsdata|wikipedia-events|local|all` (default `all` — every **approved** real provider;
`local` is an offline diagnostic provider and is deliberately excluded from `all`), `--sport=<sport
name>|all` (default `all`), `--window=<e.g. 3h, 1d>` (default `3h`), `--limit=<n>` (default `25`,
applied per sport query profile), `--json`.

Output shows, per candidate: provider, sport + confidence, publisher, published time, headline,
source URL, classification signals, and fingerprint (flagged if it's an exact-URL duplicate within
the batch) — never an article body, never a secret. It ends with a newsroom health summary:
per-provider health (OK / OK-but-empty / UNAVAILABLE / THROTTLED / ERROR, with accepted-of-returned
counts), totals by classified sport, the duplicate count, and every candidate the intake filter rejected
with its reason (section 16).

If `NEWSDATA_API_KEY` isn't configured, NewsData reports `unavailable` in the summary; if GDELT is
throttled it reports `throttled`; the command still exits successfully with whatever the other
providers returned.

## 12. NewsData environment configuration

Copy `.env.example` to `.env.local` and set:

```
NEWSDATA_API_KEY=your-key-here
```

`.env.local` is gitignored. The key is read server-side only
(`src/lib/news/providers/newsdata/provider.ts`); it is never read from `NEXT_PUBLIC_*`, never sent
to the client, and never logged (including in error messages — see
`tests/unit/news/newsdata-provider.test.ts`).

## 13. What moves to next phase

Explicitly **not** built in Phase 3 (see the phase brief's scope hold): Supabase, any database,
persistent ingestion, a scheduler/cron/background worker, the public live homepage feed, real story
clustering (only exact-URL duplicate flagging exists), AI summaries, full deduplication, an editor
CMS, search indexing, accounts, auth, paywall, advertising, analytics, push, scores/stats, fantasy,
or betting.

Before any real newsroom candidate reaches the public homepage, see the recommendations in the
Phase 3 return report — quality, duplicate volume, irrelevant results, classification accuracy,
source diversity, headline quality, freshness, and provider reliability all need a human review
pass first.

## 14. Future provider adapter strategy

Section 15 shows this working: `gdelt-gkg` and `wikipedia-events` were added without touching the
aggregator's provider-specific code.

Every provider implements the same `CandidateProvider` interface
(`src/lib/news/providers/types.ts`): `id`, `displayName`, `requiresApiKey`, `expectedFreshness`,
`fetchCandidates()`. Adding a future provider (a paid API once justified, a new free source, etc.)
means: add a policy record (section 6) with status `approved` only after an actual terms review,
implement `client.ts` (raw fetch) + `normalize.ts` (mapping into `NewsCandidate` via the shared
`buildCandidate` helper) + `provider.ts` (the `CandidateProvider` object) under
`src/lib/news/providers/<name>/`, and register it in `src/lib/news/providers/index.ts`. Nothing
else in the aggregator, CLI, or classification layer needs to know a new provider exists.

## 15. Live validation — 2026-09-20

All numbers below are from real network runs on 2026-09-20 (US, NFL Week 2 / MLB pennant race / WNBA
playoffs / NBA offseason), run by the engineering side with no owner involvement. Reproduce with
`pnpm news:probe --provider=all --window=6h --limit=50`.

### 15.1 Provider reliability findings

| Provider | Result on 2026-09-20 | Detail |
| --- | --- | --- |
| **GDELT DOC 2.0 API** | **Throttled (HTTP 429), every attempt** | 4 requests over ~25 minutes from this machine, each answered 429 in 9–10 s, including a single-query request with no other traffic beforehand. The throttle is per-IP and outlasts the documented "1 request / 5 s" spacing, so waiting a few seconds does not clear it. Marked operationally degraded for the session; not retried in a loop. |
| **GDELT GKG 15-minute files** | **Validated live** | `data.gdeltproject.org/gdeltv2/…gkg.csv.zip` — ~2 MB, ~0.6 s each, no throttling across ~90 downloads. 6 h window: ~11k titled rows → 137–149 sports candidates in 18 s. Same GDELT project and terms as the DOC API, different (plain-file) path. |
| **Wikipedia Current Events** | **Validated live** | MediaWiki parse API, ~0.3 s/request. Editor-curated, so volume is small: 4 items across 3 days on the day of the run (0–8 per day over the prior week), each with a real publisher URL. |
| NewsData.io | Unavailable | No `NEWSDATA_API_KEY` exists locally. Adapter intact and unit-tested (incl. 429 → `throttled`); not validated live. |

**Conclusion:** the DOC API cannot be the only freshness source. GKG files are a much better GDELT
integration for a scheduled ingester (bulk files, no per-query throttle); the DOC API is kept as
an on-demand query path behind a cooldown.

### 15.2 How GDELT throttling now behaves

- `429` (or a `200` plain-text "please limit requests" body) raises a typed `ProviderRateLimitedError`.
- The provider **stops immediately** — a probe that would have issued 11 sequential sport queries
  now issues exactly 1 — and reports `throttled` (not `error`).
- A 60 s in-process **cooldown** (longer if `Retry-After` says so) makes further calls return
  `throttled` without touching the network. There are no retry loops.
- The same typed handling exists for NewsData and the Wikipedia/GKG providers.

### 15.3 Data sources for the quality inspection

- **Approved live providers (production-eligible):** `gdelt-gkg` (6 h, 137–149 candidates, ~10 min old
  at the newest) and `wikipedia-events`.
- **Engineering sample only:** because GKG's sports volume is thin for basketball in the September
  NBA offseason and Wikipedia is thin by design, a one-off sample of **300 headlines** (100 each for
  the basketball / football / baseball query profiles) was pulled from Google News RSS to stress-test
  classification and filtering at the 20–50-per-sport scale the task called for. Google News RSS is
  **not** an approved provider (policy: `rejected`, ambiguous terms), nothing from it is stored in
  the repository, and no test or code path depends on it. Its role was to expose failure *patterns*;
  the regression tests use verbatim headlines that illustrate each pattern.

### 15.4 Candidate quality, per sport

Numbers are from the 300-headline sample unless noted "GKG". "Before" = the Phase 3 classifier with no
intake filter; "after" = this change.

**Basketball** (NBA / WNBA / college basketball) — *good relevance, heavy betting noise.*
Before: 82 high / 18 low. Filter rejected 18 of 100 (7 game-stub/schedule pages such as *"Charlotte
Hornets vs LA Clippers Nov 15, 2026 Game Summary"* — future-dated schedule pages, plus 1 generic ESPN
landing page — 8 template pages in all; 7 betting/DFS pages; 3 video-clip pages). After: 82 accepted → 74 high / 6 medium / 2
low. Zero soccer or other-sport contamination. Sources dominated by Yahoo Sports (30), si.com, NBA.com.
GKG (6 h, offseason): only 9 basketball candidates — WNBA playoffs plus NBA business/draft items — all
relevant, except the false positive in 15.5.

**Football** (NFL / college football) — *highest betting/fantasy load; no soccer flood.*
Before: 92 high / 8 low. Filter rejected 16 of 100: 14 betting/fantasy/props/DFS pages (4 of the 16 also came from
betting-affiliate domains, one of them caught only by its domain), 1 historical-stats page. After: 84 accepted → 77 high / 7 medium / 0
low. The eight low-confidence headlines (college-football matchups like *"No. 10 Alabama rallies to
beat Florida State"*, NFL headlines naming only teams/positions) now score medium via the team/school
lexicon. A **raw "football" query** (not used, run only as a control) returned 48 of 100 results from
school-athletics sites (`12thman.com`, `floridagators.com`, …) and zero NFL; zero soccer in the US-edition
sample — soccer contamination would appear on GDELT's global index, so the profile still never uses
bare "football" (locked by a test). GKG: 42 accepted.

**Baseball** (MLB) — *cleanest sources, worst classification signal.*
Before: **26 high / 74 low** — MLB.com headlines are player/team-centric and rarely say "MLB". Filter
rejected 24 of 100 (10 MLB.com *"… Preview - 09/20/2026"* pages and 1 game-story template page, 9
video clips — 7 *"Condensed Game"*, 2 *"Field View"* — 3 Spanish-language *"Resumen …"* clips, 1 odds page). After: 76 accepted → 25 high / 26 medium / 25 low. The remaining "low"
are player-only headlines (*"Joe Ryan strikes out five"*, *"Pedro Pagés RBI single"*) — MLB.com video
titles — which no deterministic headline lexicon can fix without roster data. GKG: 50 accepted (cap),
but only 21 distinct headlines (15.6).

### 15.5 Concrete junk and false-positive examples (all real)

| Class | Example | Handling |
| --- | --- | --- |
| Betting / props / DFS | *"Storm vs Valkyries Prediction, Pick, WNBA Odds for Saturday"*; *"NFL Touchdown Parlay Week 2: …"*; *"FanDuel Promo Code: Claim $350 Bonus Bets …"* | `betting-or-fantasy` |
| Fantasy | *"2026 Fantasy Football Injury Tracker"* | `betting-or-fantasy` |
| Schedule/preview stubs | *"Toronto Blue Jays at Texas Rangers Preview - 09/20/2026"*; *"San Francisco 49ers vs. Miami Dolphins - September 20, 2026"* | `template-page` |
| Future-dated pages | *"Washington Wizards vs Denver Nuggets Jan 21, 2027 Game Summary"* (published 2026-09-19) | `template-page` |
| Generic landing page | *"Watch ESPN - Stream Live Sports & ESPN Originals"* | `template-page` |
| Video clips | *"Condensed Game: PHI@NYM - 9/19/26"*, *"HLs: Bueckers in playoff form …"* | `video-page` |
| Non-English | *"Resumen Cachorros @ Rojos, Resultados/Jugadas destacadas"* (Spanish, from an "English" query) | `non-english` |
| Historical stats page | *"Stan Hindman 1966 Situational Stats"* | `historical-stats-page` |
| Betting-affiliate domain | covers.com, prizepicks.com, DraftKings, FanDuel | `low-quality-source` |
| Acronym collision | GKG: *"NBA demands probe into deaths of 37 illegal miners in Niger"* — Nigerian Bar Association, classified basketball/**high** | fixed: `AMBIGUOUS_TERM_GUARDS` |
| Phrase collision | GKG: *"Special Olympics Kentucky Truck Pull …"* classified olympics/high | fixed: neutralized phrase |
| Site-name suffix | GKG titles: *"… \| 107.5 The Game (WNKT-FM)"*, *"… – KTBB News, Weather, Ta…"* | fixed: `stripSiteSuffix` |
| Common-word nicknames | *"Congress debates new bills"* would hit the Bills | fixed: nicknames match case-sensitively; 2 hits needed without a query origin |
| **Still wrong** | GKG: *"Caitlin Clark shows off new Nike signature shoe … inspired by favorite NFL team"* — WNBA story classified football/high because it mentions the NFL | Known weakness (15.8) |

### 15.6 Same-event duplicates (input for Phase 4/5 clustering)

Exact-URL duplicates were **zero** in every run; same-*event* duplication is massive:

- **Wire syndication (GKG):** the identical headline appears on many local sites — *"Ravens rule out star
  WR Zay Flowers (hamstring) vs. Saints"* on 13 domains; *"Ronald Acuna Jr.'s late grand slam leads
  Braves past Astros"* on 8; *"Cubs come through in late innings, top Reds"* on 7. Across the 6 h GKG
  run, **137 accepted candidates were only 89 distinct headlines**. An exact normalized-headline group
  is therefore a cheap, high-yield first clustering step.
- **Multi-publisher, different wording (sample):** Angel Reese's 500-rebound record — Bleacher Report,
  Yahoo Sports (×3 headlines), USA Today, SLAM: *"Angel Reese Becomes First WNBA Player to Reach 500
  Rebounds…"* vs *"Angel Reese makes WNBA history (again!) with 500 rebounds in a season"*. The NFL
  videoboard rule change — ESPN, Bleacher Report, Yahoo, Boston.com. Weekly injury reports — NBC Sports vs
  CBS Sports. Wikipedia Current Events yields this shape by design: one event, several cited publishers.
- Also observed: the same article via different tracking parameters (`ocid`, `cmpid`, …) — now stripped
  before fingerprinting.

### 15.7 Changes made from this evidence

**Queries** — deliberately *not* widened. The tuned profiles (NBA/WNBA/college basketball; NFL/college
football; MLB/Major League Baseball) produced relevant results in every sample; the problems were
downstream (team-only headlines, junk pages). Added a test that the football profile never contains bare
"football" and that basketball/baseball keep their league terms. Overfitting the terms to one September
weekend (e.g. adding playoff phrases) was rejected as unsupported by the data.

**Classification** (`classification/lexicon.ts`, `classify.ts`) — still fully deterministic and
inspectable (signals list every hit and tier):
- Three evidence tiers: **strong** (league/event tokens: NBA, WNBA, NFL, MLB, World Series, Super Bowl,
  Heisman…), **team** (NBA/WNBA/NFL/MLB nicknames, sport vocabulary), **weak** (common-word nicknames,
  college programs, "RBI"…). Only strong/team evidence can move a candidate off its query sport.
- `high` = league-level evidence and no contradiction; `medium` = team/vocabulary evidence or two weak
  hints; `low` = query origin only or one weak hint. New **contradictory signal** lines (rival sport
  present; soccer/hockey vocabulary) downgrade `high` to `medium`.
- Whole-word matching (fixes "NBA" inside "WNBA"), case-sensitive nicknames, ambiguous-acronym guards
  (NBA/SEC/ACC/FBS), neutralized phrases ("Special Olympics").
- **Query-origin-less classification** for feed-style providers (Wikipedia, GKG): needs a league term or
  two distinct team/vocabulary hits; otherwise `unknown`/`none`.

**Intake filter** (`filters/intake.ts`) — nine named rules, each traced to a real example above.
Rejections are returned and printed with reasons, never silently dropped. Conservative by design: it does
not reject "draft picks", "way-too-early predictions", or "beat the odds".

**Source quality** (`sources/quality.ts`) — `known` / `unknown` / `low-quality`, ~35 known publisher/league
domains, ~13 betting-affiliate domains. Operational only, no editorial or political meaning. It earned its
place: it caught 4 of the 16 football rejections in the sample and all 3 sportsbook promo-code pages
(Bet365, COVERS, FanDuel) in the GKG run — one of them ("Bet365 Bonus Code…") matched no headline rule.

### 15.8 Known weaknesses

- **Incidental league mentions** (the Caitlin Clark/NFL example) — headline-only classification can't tell
  the subject from an aside. Needs clustering + a second opinion (e.g. the article's own section/keywords).
- **Player-only headlines** (MLB.com video titles) stay `low`; fixing that needs roster data or an LLM
  pass, both out of scope.
- **Wikipedia items are sentences, not headlines**, are CC BY-SA, and carry day-level timestamps; they
  are an internal discovery signal, not display text (policy: `headlineDisplayAllowed: false`).
- **GKG titles are HTML `<title>`s**, sometimes truncated at ~100 characters, with residual site suffixes
  the heuristic doesn't catch. No article-level language field other than the translation flag.
- **GKG volume is a sample of the global feed** (~11k titled rows / 6 h), so it under-covers niche sports
  and off-season leagues (9 basketball items in 6 h in September).
- **Intake filtering is headline/URL pattern based** and English/US-centric; betting news that is
  genuinely news (e.g. a sportsbook regulatory story) will be rejected by design until a human-review lane
  exists.
- Live behavior of NewsData is still unvalidated (no key).
- The GDELT DOC throttle window is unknown; the cooldown is a fixed 60 s and process-local.

### 15.9 Recommendations

1. Make **GKG + Wikipedia** the always-on discovery baseline; keep the DOC API as an opportunistic
   query path behind its cooldown; add NewsData when a free key exists.
2. In the warehouse phase, dedupe first on **exact normalized headline** (137 → 89 in one run), then
   on shared cited-URL/event signals, then on fuzzy same-event matching (Phase 4/5).
3. Ingest GKG on a 15-minute schedule keyed on the file stamp (idempotent; the files never change) rather
   than by time window.
4. Add a per-publisher allow/deny list to the warehouse admin rather than growing the code lists.
5. Re-run this validation in-season for basketball (October–June) before setting basketball ranking
   thresholds; September data under-represents it.

## 16. Intake filtering, health states, and failover

**Provider states** (`ProviderHealth.state`): `ok`, `empty` (succeeded, zero candidates), `unavailable`
(not configured — e.g. no key), `throttled` (HTTP 429 / rate-limit body, cooldown active), `error`
(timeout, network failure, non-JSON/malformed body, non-2xx). The probe prints one line per provider
plus accepted-of-returned counts.

**Failover:** every provider result is captured independently (`Promise.all` with a per-provider
try/catch). A provider being `throttled`, `unavailable`, `error`, or `empty` never affects another's
candidates. Verified live: GDELT DOC `throttled` + NewsData `unavailable` + GKG/Wikipedia `ok` returns
141 candidates with each provider's state reported (`tests/unit/news/newsroom.test.ts`,
`provider-throttling.test.ts`).

**Intake reasons:** `malformed-headline`, `non-english`, `betting-or-fantasy`, `template-page`,
`video-page`, `generic-page`, `historical-stats-page`, `not-sports`, `low-quality-source`. Tests use
verbatim headlines from the 2026-09-20 samples plus explicit "must keep" cases.

## 17. Provider policy additions (review date 2026-09-20)

| Provider id | Status | Notes |
| --- | --- | --- |
| `gdelt-gkg` | `approved` | Same dataset/terms as GDELT DOC (`gdeltproject.org/about.html`: unrestricted commercial use, citation + link required). Headline display allowed with attribution; no article bodies; no images. |
| `wikipedia-events` | `approved` (discovery only) | CC BY-SA 4.0 text; attribution + share-alike for reuse, so `headlineDisplayAllowed: false` — internal discovery text only, publisher URL/name/day kept. Wikimedia API etiquette (descriptive User-Agent, sequential requests) enforced in the client. |
| `wikinews` | `deferred` | License fine; not useful (sparse). |
| `google-news-rss`, `bing-news-rss` | `rejected` | Unofficial feeds, no commercial-aggregation grant. |
| `publisher-rss` | `rejected` | Fox Sports, CNN, team sites are non-commercial only; CBS ambiguous. |

Existing policies (GDELT DOC, NewsData, GNews, NewsAPI, Currents, ESPN RSS) were not loosened.
