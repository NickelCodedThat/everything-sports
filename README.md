# Everything Sports

A premium, 24/7 sports news publication — basketball leads, football runs a close second, baseball
anchors a strong third, and the rest of the sports world gets serious treatment when the moment
earns it. Free to read, no accounts, no paywall.

This repository is the **Phase 1 vertical slice**: application foundation, brand/design system,
editorial domain model, a ranking engine, realistic fixture data, and a fully composed homepage.
There is no live news ingestion yet — see [Scope](#phase-1-scope) below.

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

### Quality gates

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # vitest — domain/ranking/homepage-assembly unit tests
pnpm build       # next build — production build + static generation
pnpm test:e2e    # playwright — responsive + accessibility smoke tests (builds and boots the app)
```

## Project structure

```
src/
  app/                  routes (App Router) — homepage, section stubs, search, icons, robots
  components/
    brand/               Wordmark + ES Cut mark (implementation-safe first pass, see below)
    editorial/           story card patterns: LeadPackage, RiverStory, Brief, AnalysisStory,
                          VisualFeature, LiveDevelopingStory, WireRail, StoryImage, StoryMeta...
    navigation/          Header, MobileMenu, MoreMenu, SearchDialog
    layout/              Footer, Container, SectionStub
    ui/                  Button, Tag, IconButton, Timestamp, icons, VisuallyHidden
  data/                  typed fixture data: sources, teams, people, stories
  lib/
    editorial/           homepage section-assembly (buildHomepage) and usage-tracking, independent
                          of React
    news/providers/      NewsProvider contract + the local/mock provider
    ranking/              editorial scoring + sorting, with its own unit tests
    utils/                small helpers (relative time formatting)
  types/                  the domain model: Sport, League, Team/Person refs, NewsSource, Story,
                          StoryCluster, EditorialPriority
tests/
  unit/                  vitest specs for ranking and homepage assembly
  e2e/                    playwright specs for responsive layout and accessible navigation
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

## News provider abstraction

`src/lib/news/providers` defines a `NewsProvider` interface (`fetchStories`) that any future
ingestion source — RSS, a paid news API, ESPN, whatever — implements independently, always
normalizing into the canonical `Story` type before returning. Phase 1 ships one provider,
`localNewsProvider`, backed by the typed fixtures in `src/data`. Nothing in the product is coupled
to a specific vendor.

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
(all 11 sections), responsive navigation (desktop two-row masthead + sticky nav, mobile full-screen
menu with focus trap), 7 editorial card patterns, accessibility (skip link, landmarks, one `h1`,
visible focus, 44px touch targets, reduced-motion handling, `role="status"` live regions),
lightweight section pages for the primary nav destinations so no top-nav link is dead.

**Deferred, by design:**

- Live third-party news ingestion (only the local fixture provider exists)
- Individual article/story-cluster pages (story links point to real, correctly-shaped URLs that
  aren't built yet)
- Full search (the search dialog is honest about this — it submits to `/search`, which
  acknowledges the query rather than faking results)
- Auth, accounts, paywall, subscriptions, Supabase, monetization
- Complete manual dark theme (tokens exist; the toggle doesn't yet)
- Broad section-page builds beyond the primary nav's lightweight stubs
- A true desktop side-by-side Lead+Now rail above 1180px (blueprint section 13); Now currently
  renders as its own full-width section at every breakpoint

## Images

Fixture story images are original locally-generated SVG compositions (`public/images/fixtures`,
regenerated by a small script) standing in for photography — abstract arena-lighting beams in
brand tones, not stock photos or literal sports-equipment iconography. Swap in real photography by
replacing `Story.image.src` per story; the `ImageMeta` shape (focal point, credit, dimensions) is
already designed for it.
