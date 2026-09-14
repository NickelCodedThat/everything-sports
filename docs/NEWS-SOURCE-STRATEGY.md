# News Source Strategy

**Status:** Phase 3 — Multi-Source Live Newsroom Foundation
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

Reconsidering any of these requires updating its policy record after an actual terms review, not
just flipping a status flag.

## 11. Running `pnpm news:probe`

```bash
pnpm news:probe                                                    # all approved providers, every sport, 3h window
pnpm news:probe --provider=gdelt --sport=basketball --window=3h --limit=20
pnpm news:probe --provider=all --json                              # structured output for debugging
pnpm news:probe --provider=local --sport=basketball                # offline, no network — exercises the pipeline against fixture data
```

Flags: `--provider=gdelt|newsdata|local|all` (default `all` — every **approved** real provider;
`local` is an offline diagnostic provider and is deliberately excluded from `all`), `--sport=<sport
name>|all` (default `all`), `--window=<e.g. 3h, 1d>` (default `3h`), `--limit=<n>` (default `25`,
applied per sport query profile), `--json`.

Output shows, per candidate: provider, sport + confidence, publisher, published time, headline,
source URL, classification signals, and fingerprint (flagged if it's an exact-URL duplicate within
the batch) — never an article body, never a secret. It ends with a newsroom health summary:
per-provider candidate/failure counts, totals by classified sport, and a duplicate count.

If `NEWSDATA_API_KEY` isn't configured, NewsData reports `unavailable` in the summary; the command
still exits successfully with GDELT's results.

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

Every provider implements the same `CandidateProvider` interface
(`src/lib/news/providers/types.ts`): `id`, `displayName`, `requiresApiKey`, `expectedFreshness`,
`fetchCandidates()`. Adding a future provider (a paid API once justified, a new free source, etc.)
means: add a policy record (section 6) with status `approved` only after an actual terms review,
implement `client.ts` (raw fetch) + `normalize.ts` (mapping into `NewsCandidate` via the shared
`buildCandidate` helper) + `provider.ts` (the `CandidateProvider` object) under
`src/lib/news/providers/<name>/`, and register it in `src/lib/news/providers/index.ts`. Nothing
else in the aggregator, CLI, or classification layer needs to know a new provider exists.
