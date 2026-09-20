# Everything Sports

A premium, 24/7 sports news publication — basketball leads, football runs a close second, baseball
anchors a strong third, and the rest of the sports world gets serious treatment when the moment
earns it. Free to read, no accounts, no paywall.

Phase 1 built the application foundation, brand/design system, editorial domain model, ranking
engine, fixture data, and a fully composed homepage. Phase 3 adds a **newsroom intake layer** —
real, live sports-news discovery from free sources — as a CLI/dev-only tool, entirely separate from
the public homepage, which still reads only the Phase 1 fixture data. Phase 4 adds a **persistent
news warehouse** (Supabase Postgres) that remembers what the newsroom discovers, and Phase 5 an **automated
newsroom engine** that ingests on a schedule with health monitoring — all internal, none of it connected to
the homepage. See
[Phase 1 scope](#phase-1-scope) and [Newsroom](#newsroom-phase-3-multi-source-candidate-discovery)
below.

The full visual and editorial specification lives at
[`docs/BRAND-UI-BLUEPRINT.md`](docs/BRAND-UI-BLUEPRINT.md). Treat it as canonical.

## Stack

- **Next.js 16** (App Router, React Server Components, TypeScript strict)
- **Tailwind CSS v4** (CSS-first `@theme` tokens, no `tailwind.config.js`)
- **pnpm**
- **Vitest** + **Testing Library** for unit/domain tests
- **Playwright** for responsive/accessibility smoke tests
- Fonts self-hosted via `next/font/google` (League Gothic, Source Serif 4, Source Sans 3) — no
  runtime requests to Google, per the blueprint's self-hosting requirement

## Local development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

To enable the NewsData newsroom provider (optional — GDELT works with no key), copy `.env.example`
to `.env.local` and set `NEWSDATA_API_KEY`. Without it, `pnpm news:probe` reports NewsData as
cleanly unavailable rather than failing.

### Quality gates

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # vitest — domain/ranking/homepage-assembly/newsroom unit tests (no network)
pnpm build       # next build — production build + static generation
pnpm test:e2e    # playwright — responsive + accessibility smoke tests (builds and boots the app)
pnpm news:probe  # live newsroom CLI — see "Newsroom" below; not part of the automated test suite
pnpm test:db     # warehouse + engine integration tests against the local Supabase stack (needs Docker + pnpm db:start)
```

## Project structure

```
src/
  app/                  routes (App Router) — homepage, section stubs, the story shell
                          ([sport]/[slug]), search, icons, robots, dev/newsroom (dev-only)
  components/
    brand/               Wordmark + ES Cut mark (implementation-safe first pass, see below)
    editorial/           story card patterns: LeadPackage, RiverStory, Brief, AnalysisStory,
                          VisualFeature, LiveDevelopingStory, WireRail, StoryImage, StoryMeta...
    navigation/          Header, MobileMenu, MoreMenu, SearchDialog
    layout/              Footer, Container, SectionStub
    ui/                  Button, Tag, IconButton, Timestamp, icons, VisuallyHidden
  data/                  typed fixture data: sources, teams, people, stories (unchanged this phase)
  lib/
    editorial/           homepage section-assembly (buildHomepage) and usage-tracking, independent
                          of React
    news/                the Phase 3 newsroom — see docs/NEWS-SOURCE-STRATEGY.md
      candidates/          NewsCandidate type + fingerprinting
      providers/           CandidateProvider contract; gdelt/, newsdata/, local/ implementations
      classification/      deterministic sport classification
      normalization/       shared candidate-building/validation used by every provider
      policy/              the provider-policy registry
      queries/             provider-agnostic per-sport query term profiles
      urls/                URL normalization (tracking-param stripping, etc.)
      filters/, sources/   conservative intake filter; operational source-quality buckets
      warehouse/           Phase 4 — server-only Supabase persistence (docs/NEWS-WAREHOUSE.md)
      engine/              Phase 5 — scheduled tick, health, GKG lag, worker auth (docs/NEWSROOM-ENGINE.md)
      clustering/          Phase 6 — same-event story clustering, pure scoring + DB orchestration (docs/STORY-CLUSTERING.md)
      cli/                 pnpm news:probe's argument parsing + report formatting
      newsroom.ts           the multi-provider aggregator
    ranking/              editorial scoring + sorting, with its own unit tests
    routes.ts             the internal canonical story path helper (getStoryPath) — see below
    utils/                small helpers (relative time formatting)
  types/                  the domain model: Sport, League, Team/Person refs, NewsSource, Story,
                          StoryCluster, EditorialPriority
scripts/
  news-probe.ts          the pnpm news:probe CLI entry point (runs via tsx, outside Next.js)
  news-ingest.ts, news-warehouse-stats.ts   the Phase 4 warehouse CLIs
  news-worker.ts, news-health.ts            the Phase 5 engine CLIs (tick + health)
supabase/                config.toml + version-controlled migrations for the warehouse schema
tests/
  integration/warehouse/ database integration tests (pnpm test:db; local Supabase only)
  unit/                  vitest specs — ranking, homepage assembly, story routing, and
                          tests/unit/news/ (newsroom: providers, classification, policy, CLI args —
                          all mocked, no network)
  e2e/                    playwright specs for responsive layout, accessible navigation, and
                          story routing/source-attribution
```

Domain logic (`lib/`, `types/`, `data/`) has no React dependency, so it's unit-testable in
isolation and reusable once real ingestion replaces the fixture provider.

## Editorial domain model & ranking

`src/types` defines the canonical `Story` shape — enough to normalize future RSS/API ingestion
into one representation (headline, deck, source + attribution, timestamps, sport/league/teams/
people, image metadata with focal point, content type, urgency, status, editorial priority) without
ever storing full third-party article bodies.

`src/lib/ranking` is a deterministic scoring function combining:

- sport weight (basketball > football > baseball > standard coverage — `SPORT_WEIGHT` in
  `lib/ranking/weights.ts` is the single place this hierarchy is encoded)
- competition tier (professional > international > college > other)
- recency decay
- breaking/developing urgency
- source credibility (staff > wire > syndicated > aggregated)
- editorial input (manual score override, pinning, source count, significance)

`src/lib/editorial/homepage.ts` (`buildHomepage`) assembles the ranked story list into the
homepage's sections (The Wire, The Lead, Now, The Run, The Huddle, The Cut, The Diamond, Fight
Desk, World Game, Across the Board, Most Read), enforcing the blueprint's "no story appears more
than twice on the homepage" rule via a shared usage tracker. Both modules are covered by
`tests/unit`.

## Story routing vs. source attribution

Two distinct URLs exist on every `Story`, and the codebase never conflates them:

- **`getStoryPath(story)`** (`src/lib/routes.ts`) — Everything Sports' own canonical route,
  `/${sport}/${slug}`, served by the story shell at `src/app/[sport]/[slug]/page.tsx`. Every
  editorial component (LeadPackage, MajorSplitStory, RiverStory, Brief, AnalysisStory,
  VisualFeature, LiveDevelopingStory, WireRail, and the homepage's Most Read list) links a reader
  to a headline using this helper — never `story.sourceUrl` directly.
- **`story.sourceUrl`** — the URL of the original/source publication. For an aggregated story this
  is always a real external destination (fictional `example.com` paths in the fixtures — never a
  real publisher, per the copyright rule); for Everything Sports' own original reporting it
  legitimately equals `getStoryPath(story)`, since we are the source. Fixture data derives both
  consistently via the `ownUrl`/`externalUrl` helpers in `src/data/stories.ts` rather than hand-typed
  strings, so they can't drift apart.

The story shell itself is a **lightweight Phase 1 page**, not the future full article/story-cluster
product (blueprint section 17): headline, deck, tags, byline/timestamp, hero image, and — for
aggregated stories only — a "Read original reporting at [Source]" action pointing to `sourceUrl`
(opens in a new tab). Original stories get an honest "full article coming in a later phase" note
instead of a fabricated body. Every fixture story is statically prerendered
(`generateStaticParams`); an unmatched sport or slug renders a real `404` via `notFound()`.

## Newsroom (Phase 3): multi-source candidate discovery

`src/lib/news` is the newsroom intake layer — real sports-news *discovery*, kept deliberately
separate from the production homepage (which still reads only `src/data/stories.ts`; this phase
does not touch it). Full strategy, provider policy, and rationale:
[`docs/NEWS-SOURCE-STRATEGY.md`](docs/NEWS-SOURCE-STRATEGY.md).

In short: a `CandidateProvider` (`src/lib/news/providers/types.ts`) fetches raw results from one
source and normalizes them into a provider-neutral `NewsCandidate`
(`src/lib/news/candidates/types.ts`) — headline, publisher, source URL, timestamps, classification;
never a full article body. GDELT DOC 2.0 (`providers/gdelt`) and NewsData.io
(`providers/newsdata`, requires `NEWSDATA_API_KEY`) are the two approved live providers; an offline
`local` provider (`providers/local`) exercises the same pipeline against fixture data with no
network call. The aggregator (`newsroom.ts`) queries multiple providers in parallel, keeps one
provider's failure from erasing another's results, and flags exact-URL duplicates.

Inspect it with the CLI — `pnpm news:probe` (see the strategy doc for flags) — or, in `next dev`
only, at `/dev/newsroom` (guarded to 404 outside development; not linked from navigation).
`NewsCandidate → Story` (classification refinement, real deduplication, clustering, ranking
integration, editorial review) is future-phase work.

## News warehouse (Phase 4): persistent candidate history

The newsroom's discovered candidates are now stored durably in Supabase Postgres — deduplicated by
normalized URL, grouped by normalized headline, with every provider/run/file sighting kept as
provenance. **Server-side only**; the public site does not read it. Full design, schema, dedupe rules
and validation numbers: [`docs/NEWS-WAREHOUSE.md`](docs/NEWS-WAREHOUSE.md).

```bash
pnpm db:start                       # local Supabase (Docker); applies supabase/migrations
pnpm db:status -o env               # copy API_URL / SECRET_KEY into .env.local (SUPABASE_URL / SUPABASE_SECRET_KEY)
pnpm news:ingest                    # ingest live GDELT GKG (last 2h) — safe to run repeatedly
pnpm news:warehouse:stats           # internal summary
pnpm db:reset                       # rebuild the local schema from migrations
pnpm test:db                        # integration tests against the local database
```

## Newsroom engine (Phase 5): scheduled ingestion and health

Supabase Cron triggers a secured, server-only Next.js worker (`POST /api/internal/newsroom/tick`) every 15 minutes
for GDELT GKG (hourly for Wikipedia Current Events; the throttled DOC API is never scheduled). Overlapping runs are
prevented by a database lease lock, crashed runs are reaped, and provider health/alert conditions are queryable.
It creates warehouse candidates only — nothing is promoted to a Story or shown on the site. Architecture, security,
cadences, runbook and the (single) remote deployment step: [`docs/NEWSROOM-ENGINE.md`](docs/NEWSROOM-ENGINE.md).

```bash
pnpm news:worker                    # the exact production tick, run locally (--provider, --force, --json)
pnpm news:health                    # provider health states + alert conditions (--json, --strict, --scheduler)
pnpm news:ingest                    # unchanged manual ingest        pnpm news:warehouse:stats   # unchanged
```

## Story clustering (Phase 6): one story, every source

Internally groups candidates that report the same event into a `story_cluster` — exact headline, `pg_trgm` headline
similarity, team/person/score evidence, event type and contradiction guards, biased toward precision (a false merge is worse than a
false split). Every membership stores why it happened. Runs after ingestion in the scheduled tick, in its own failure boundary.
Internal only: the homepage still reads fixtures. Design, thresholds, validation and known weaknesses:
[`docs/STORY-CLUSTERING.md`](docs/STORY-CLUSTERING.md).

```bash
pnpm news:cluster --dry-run         # propose clusters/memberships/evidence, write nothing (--window --sport --limit --json)
pnpm news:cluster                   # cluster recent unclustered candidates
pnpm news:clusters                  # inspect clusters (--show=<id>, --review for the near-miss queue, --merge=<into>,<from>)
```

## Brand implementation

Design tokens (color, type scale, spacing, radii, motion, z-index) are transcribed from the
blueprint into `src/app/globals.css` and mapped into Tailwind's `@theme`. The palette is
light-default per the approved decision — Blacktop is used explicitly on specific dark modules
(masthead sticky nav accents, breaking urgency, The Cut's visual feature), not as a global dark
mode; automatic `prefers-color-scheme` support is intentionally deferred until a manual theme
control exists, per the blueprint.

The **Wordmark** and **ES Cut** mark (`src/components/brand`) are an **implementation-safe first
pass** — plain League Gothic typography and a geometric monogram approximation, not JD's final
hand-tuned vectors. They're isolated components specifically so the production artwork can drop in
later without a layout refactor.

## Phase 1 scope

**Built:** application foundation, design tokens, domain model, ranking engine, fixture data
(37 original fictional stories across all covered sports), news provider abstraction, homepage
(all 11 sections), a lightweight internal story route (`/[sport]/[slug]`) so every homepage story
link resolves successfully, responsive navigation (desktop two-row masthead + sticky nav, mobile
full-screen menu with focus trap), 7 editorial card patterns, accessibility (skip link, landmarks,
one `h1`, visible focus, 44px touch targets, reduced-motion handling, `role="status"` live
regions), lightweight section pages for the primary nav destinations so no top-nav link is dead.

**Deferred, by design:**

- Live third-party news ingestion (only the local fixture provider exists)
- The full article/story-cluster reading experience (blueprint section 17) — the current story
  route is an intentionally lightweight Phase 1 shell, not that product
- Full search (the search dialog is honest about this — it submits to `/search`, which
  acknowledges the query rather than faking results)
- Auth, accounts, paywall, subscriptions, Supabase, monetization
- Complete manual dark theme (tokens exist; the toggle doesn't yet)
- Broad section-page builds beyond the primary nav's lightweight stubs
- A true desktop side-by-side Lead+Now rail above 1180px (blueprint section 13); Now currently
  renders as its own full-width section at every breakpoint

## Phase 3 scope

**Built:** the newsroom candidate pipeline described above — `NewsCandidate` model, GDELT and
NewsData providers (policy-approved, see the strategy doc), a provider-policy registry covering six
providers total, deterministic sport classification, URL normalization + fingerprinting + exact-URL
duplicate flagging, the multi-provider aggregator, the `pnpm news:probe` CLI, and an optional
dev-only `/dev/newsroom` preview.

**Explicitly not built** (see the scope hold in `docs/NEWS-SOURCE-STRATEGY.md` §13): the public
homepage still reads only fixture data — no real candidate has reached it. No database, no
persistent ingestion, no scheduler/cron, no story clustering beyond exact-URL duplicate flags, no
AI summaries, no editor CMS, no search indexing, no accounts/auth/paywall/advertising/analytics.

## Images

Fixture story images are original locally-generated SVG compositions (`public/images/fixtures`,
regenerated by a small script) standing in for photography — abstract arena-lighting beams in
brand tones, not stock photos or literal sports-equipment iconography. Swap in real photography by
replacing `Story.image.src` per story; the `ImageMeta` shape (focal point, credit, dimensions) is
already designed for it.
