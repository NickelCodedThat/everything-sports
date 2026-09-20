-- Phase 6 — Story Event Clustering ("One story. Every source.")
--
-- Groups candidates that report the SAME real-world event into one story_cluster,
-- conservatively: precision over recall. The database owns everything that must be
-- atomic or fast (fuzzy neighbour search with pg_trgm, membership uniqueness, race
-- guards, aggregates, representative selection, merges). The scoring / event-type /
-- entity / contradiction logic lives in src/lib/news/clustering (pure, unit-tested) and
-- hands each decision to news_cluster_assign together with the evidence that justified it.
--
-- Same security posture as Phases 4/5: RLS on, no policies, everything revoked from
-- public/anon/authenticated, service_role only. Internal only — nothing here is read by
-- the public site.

-- ---------------------------------------------------------------------------
-- pg_trgm — fuzzy headline similarity (similarity / word_similarity, GIN index)
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- clustering_runs — audit trail for clustering (kept apart from ingestion_runs)
-- ---------------------------------------------------------------------------

create table public.clustering_runs (
  id                     uuid primary key default gen_random_uuid(),
  trigger                text not null default 'manual' check (trigger in ('manual', 'scheduled', 'test')),
  algorithm_version      text not null,
  window_label           text,
  sport_filter           text,
  status                 text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  candidates_considered  integer not null default 0 check (candidates_considered >= 0),
  clusters_created       integer not null default 0 check (clusters_created >= 0),
  memberships_created    integer not null default 0 check (memberships_created >= 0),
  joined_existing        integer not null default 0 check (joined_existing >= 0),
  ambiguous_count        integer not null default 0 check (ambiguous_count >= 0),
  error_message          text,
  metadata               jsonb not null default '{}'::jsonb,
  check (finished_at is null or finished_at >= started_at)
);

create index clustering_runs_started_idx on public.clustering_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- story_clusters — one real-world sports event
-- ---------------------------------------------------------------------------

create table public.story_clusters (
  id                          uuid primary key default gen_random_uuid(),
  sport                       text not null check (sport in ('basketball', 'football', 'baseball', 'boxing', 'mma', 'soccer', 'hockey', 'tennis', 'golf', 'motorsports', 'olympics', 'other', 'unknown')),
  league                      text,
  -- Deterministic, nullable: null means "unclear", never a forced guess. Recomputed from members.
  event_type                  text check (event_type is null or event_type in (
    'trade', 'signing', 'injury', 'game-result', 'preview', 'record', 'discipline', 'coaching',
    'draft', 'transaction', 'retirement', 'death', 'business', 'other'
  )),
  -- open: receiving coverage. stable: quiet for a day. closed: aged out, or merged into another cluster.
  -- needs_review is reserved for a future editorial tool; nothing sets it automatically.
  status                      text not null default 'open' check (status in ('open', 'stable', 'closed', 'needs_review')),
  -- Best internal display candidate (NOT an editorial choice). Null when the cluster holds only discovery-text.
  representative_candidate_id uuid references public.news_candidates (id) on delete set null,
  -- Copy of the representative's publisher headline. No rewriting, no summary.
  canonical_headline          text,
  first_seen_at               timestamptz not null,
  last_seen_at                timestamptz not null,
  first_published_at          timestamptz,
  last_published_at           timestamptz,
  candidate_count             integer not null default 0 check (candidate_count >= 0),
  -- DISTINCT publisher domains (news_sources) — not rows, not sightings.
  source_count                integer not null default 0 check (source_count >= 0),
  -- DISTINCT discovery providers that ever saw any member (canonical provider + every later sighting).
  provider_count              integer not null default 0 check (provider_count >= 0),
  -- Weakest member match: a cluster is only as sure as its least certain join.
  confidence                  text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  -- Set on the archived side of a merge. Survivors always have merged_into_id null, so cycles are impossible.
  merged_into_id              uuid references public.story_clusters (id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  check (merged_into_id is null or (status = 'closed' and merged_into_id <> id))
);

create index story_clusters_live_last_seen_idx on public.story_clusters (last_seen_at desc) where merged_into_id is null;
create index story_clusters_sport_seen_idx on public.story_clusters (sport, last_seen_at desc) where merged_into_id is null;
create index story_clusters_merged_into_idx on public.story_clusters (merged_into_id) where merged_into_id is not null;

create trigger story_clusters_set_updated_at
  before update on public.story_clusters
  for each row execute function public.news_set_updated_at();

-- ---------------------------------------------------------------------------
-- story_cluster_members — every candidate belongs to at most ONE cluster
-- (candidate_id is the primary key: the database, not JavaScript, enforces it)
-- ---------------------------------------------------------------------------

create table public.story_cluster_members (
  candidate_id           uuid primary key references public.news_candidates (id) on delete cascade,
  cluster_id             uuid not null references public.story_clusters (id),
  joined_at              timestamptz not null default now(),
  -- seed: first member of a new cluster. exact-headline / fuzzy-headline / entity-overlap: the evidence route.
  -- manual: moved by an operator.
  match_method           text not null check (match_method in ('seed', 'exact-headline', 'fuzzy-headline', 'entity-overlap', 'manual')),
  match_score            numeric(5,4) not null check (match_score >= 0 and match_score <= 1),
  confidence             text not null check (confidence in ('high', 'medium', 'low')),
  -- Snapshot of the deterministic features used for this decision.
  event_type             text,
  entities               text[] not null default '{}',
  -- WHY this membership happened: similarity, shared entities, contradictions checked, windows, thresholds.
  evidence               jsonb not null default '{}'::jsonb,
  merged_from_cluster_id uuid references public.story_clusters (id),
  clustering_run_id      uuid references public.clustering_runs (id) on delete set null
);

create index story_cluster_members_cluster_idx on public.story_cluster_members (cluster_id);

-- ---------------------------------------------------------------------------
-- story_cluster_ambiguities — "close to a cluster but below auto-merge confidence"
-- The candidate itself is NOT merged (it seeds/joins its own cluster); this is the near-miss
-- queue a future editorial tool can work from.
-- ---------------------------------------------------------------------------

create table public.story_cluster_ambiguities (
  id                 bigint generated always as identity primary key,
  candidate_id       uuid not null references public.news_candidates (id) on delete cascade,
  -- The cluster the candidate nearly joined.
  cluster_id         uuid not null references public.story_clusters (id),
  score              numeric(5,4) not null check (score >= 0 and score <= 1),
  confidence         text not null check (confidence in ('high', 'medium', 'low')),
  reason             text not null,
  evidence           jsonb not null default '{}'::jsonb,
  clustering_run_id  uuid references public.clustering_runs (id) on delete set null,
  created_at         timestamptz not null default now(),
  dismissed_at       timestamptz,
  unique (candidate_id, cluster_id)
);

create index story_cluster_ambiguities_cluster_idx on public.story_cluster_ambiguities (cluster_id);

-- ---------------------------------------------------------------------------
-- story_cluster_merges — audit of every manual merge
-- ---------------------------------------------------------------------------

create table public.story_cluster_merges (
  id                 bigint generated always as identity primary key,
  into_cluster_id    uuid not null references public.story_clusters (id),
  from_cluster_id    uuid not null references public.story_clusters (id),
  members_moved      integer not null check (members_moved >= 0),
  from_source_count  integer not null,
  from_candidate_count integer not null,
  reason             text,
  merged_at          timestamptz not null default now(),
  check (into_cluster_id <> from_cluster_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, no policies, no client privileges.
-- ---------------------------------------------------------------------------

alter table public.clustering_runs            enable row level security;
alter table public.story_clusters             enable row level security;
alter table public.story_cluster_members      enable row level security;
alter table public.story_cluster_ambiguities  enable row level security;
alter table public.story_cluster_merges       enable row level security;

revoke all on public.clustering_runs            from public, anon, authenticated;
revoke all on public.story_clusters             from public, anon, authenticated;
revoke all on public.story_cluster_members      from public, anon, authenticated;
revoke all on public.story_cluster_ambiguities  from public, anon, authenticated;
revoke all on public.story_cluster_merges       from public, anon, authenticated;

revoke all on sequence public.story_cluster_ambiguities_id_seq from public, anon, authenticated;
revoke all on sequence public.story_cluster_merges_id_seq      from public, anon, authenticated;

grant select, insert, update, delete on public.clustering_runs            to service_role;
grant select, insert, update, delete on public.story_clusters             to service_role;
grant select, insert, update, delete on public.story_cluster_members      to service_role;
grant select, insert, update, delete on public.story_cluster_ambiguities  to service_role;
grant select, insert, update, delete on public.story_cluster_merges       to service_role;

grant usage, select on sequence public.story_cluster_ambiguities_id_seq to service_role;
grant usage, select on sequence public.story_cluster_merges_id_seq      to service_role;

-- ---------------------------------------------------------------------------
-- Trigram index.
--
-- GIN over normalized_headline, PARTIAL to publisher titles: discovery-text (Wikipedia
-- sentences) never takes part in fuzzy matching, so indexing it would only add size and
-- write cost. GIN (not GiST) because clustering is read-heavy: one neighbour search per
-- new candidate against a table that grows by tens of rows per 15 minutes, so slower
-- index maintenance is irrelevant and GIN's faster lookup wins. Exact-headline lookups keep
-- using the existing btree on normalized_headline. Not indexed on purpose: headline
-- (display text) and every other column — no query trigram-searches them.
-- ---------------------------------------------------------------------------

create index news_candidates_headline_trgm_idx
  on public.news_candidates using gin (normalized_headline extensions.gin_trgm_ops)
  where headline_kind = 'publisher-title';

-- ---------------------------------------------------------------------------
-- news_cluster_neighbors — the BOUNDED candidate set for one candidate.
--
-- Never compares against "every candidate": only rows that (a) have the identical
-- normalized headline, (b) are publisher titles of the SAME sport whose trigram similarity
-- clears p_floor, or (c) are same-sport publisher titles that mention one of the candidate's
-- teams (p_team_regex, built by the caller from its team lexicon; needed because two outlets
-- can describe one game in very different words) — and in every case lie within +/- p_window
-- of the candidate's own time. Retrieval (c) does not depend on cluster membership, so a
-- dry run (which writes nothing) sees exactly the same neighbours as a real run. Members of
-- one cluster are collapsed to one row per normalized headline: fourteen clustered wire copies
-- of one headline are one comparison, not fourteen. (Unclustered rows are never collapsed:
-- a dry run must still see which of them it has already placed.) The threshold is set explicitly per call (transaction-local), so the `%`
-- operator's global default (0.3) is never what decides anything. Actual match decisions
-- are made by the caller with its own thresholds; p_floor only bounds the search.
-- ---------------------------------------------------------------------------

create or replace function public.news_cluster_neighbors(
  p_candidate_id uuid,
  p_window       interval,
  p_floor        real,
  p_limit        integer default 80,
  p_team_regex   text default null
)
returns table (
  candidate_id         uuid,
  headline             text,
  normalized_headline  text,
  headline_kind        text,
  sport                text,
  league               text,
  source_id            bigint,
  source_domain        text,
  provider_id          smallint,
  published_at         timestamptz,
  discovered_at        timestamptz,
  fresh_at             timestamptz,
  cluster_id           uuid,
  cluster_first_fresh_at timestamptz,
  cluster_last_fresh_at  timestamptz,
  cluster_event_type   text,
  similarity           real,
  word_similarity      real,
  exact_headline       boolean
)
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_x record;
begin
  select c.id, c.headline_kind, c.normalized_headline, c.sport, coalesce(c.published_at, c.discovered_at) as fresh_at
  into v_x
  from public.news_candidates c
  where c.id = p_candidate_id;

  if not found then
    return;
  end if;

  perform set_config('pg_trgm.similarity_threshold', p_floor::text, true);

  return query
  with hits as (
    select y.id, true as is_exact
    from public.news_candidates y
    where y.normalized_headline = v_x.normalized_headline
      and y.headline_kind = v_x.headline_kind
      and y.id <> p_candidate_id
      and coalesce(y.published_at, y.discovered_at) between v_x.fresh_at - p_window and v_x.fresh_at + p_window
    union all
    select y.id, false
    from public.news_candidates y
    where v_x.headline_kind = 'publisher-title'
      and y.headline_kind = 'publisher-title'
      and y.sport = v_x.sport
      and y.id <> p_candidate_id
      and y.normalized_headline operator(extensions.%) v_x.normalized_headline
      and coalesce(y.published_at, y.discovered_at) between v_x.fresh_at - p_window and v_x.fresh_at + p_window
    union all
    select y.id, false
    from public.news_candidates y
    where p_team_regex is not null
      and y.normalized_headline ~ p_team_regex
      and v_x.headline_kind = 'publisher-title'
      and y.headline_kind = 'publisher-title'
      and y.sport = v_x.sport
      and y.id <> p_candidate_id
      and coalesce(y.published_at, y.discovered_at) between v_x.fresh_at - p_window and v_x.fresh_at + p_window
  ),
  dedup as (
    select h.id, bool_or(h.is_exact) as is_exact from hits h group by h.id
  )
  select
    q.id, q.headline, q.normalized_headline, q.headline_kind, q.sport, q.league,
    q.source_id, q.domain, q.provider_id, q.published_at, q.discovered_at, q.fresh_at,
    q.cluster_id, span.first_fresh, span.last_fresh, sc.event_type,
    extensions.similarity(q.normalized_headline, v_x.normalized_headline),
    greatest(
      extensions.word_similarity(v_x.normalized_headline, q.normalized_headline),
      extensions.word_similarity(q.normalized_headline, v_x.normalized_headline)
    ),
    q.is_exact
  from (
    select
      y.id, y.headline, y.normalized_headline, y.headline_kind, y.sport, y.league, y.source_id, s.domain,
      y.provider_id, y.published_at, y.discovered_at, coalesce(y.published_at, y.discovered_at) as fresh_at,
      m.cluster_id, d.is_exact,
      row_number() over (
        partition by coalesce(m.cluster_id::text, y.id::text), y.normalized_headline
        order by d.is_exact desc, y.id
      ) as rn
    from dedup d
    join public.news_candidates y on y.id = d.id
    join public.news_sources s on s.id = y.source_id
    left join public.story_cluster_members m on m.candidate_id = y.id
  ) q
  left join public.story_clusters sc on sc.id = q.cluster_id
  left join lateral (
    select min(coalesce(cc.published_at, cc.discovered_at)) as first_fresh,
           max(coalesce(cc.published_at, cc.discovered_at)) as last_fresh
    from public.story_cluster_members mm
    join public.news_candidates cc on cc.id = mm.candidate_id
    where mm.cluster_id = q.cluster_id
  ) span on q.cluster_id is not null
  where q.rn = 1
  order by q.is_exact desc, 17 desc, 12 desc, q.id
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.news_cluster_neighbors(uuid, interval, real, integer, text) from public, anon, authenticated;
grant execute on function public.news_cluster_neighbors(uuid, interval, real, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- story_cluster_recompute — the ONE place aggregates and the representative are computed.
--
-- Counters are never incremented incrementally (which drifts); they are recomputed from the
-- members inside the same transaction that changed them, under a row lock on the cluster.
--
-- Representative = best internal DISPLAY candidate, in this order:
--   1. publisher-title only (discovery-text can never be representative)
--   2. usable headline (20-220 chars, no truncation ellipsis, no " – Site Name" suffix)
--   3. source is enabled
--   4. source quality bucket: known > unknown > low-quality (an operational bucket, NOT credibility)
--   5. classification confidence: high > medium > low > none
--   6. has a real publication timestamp
--   7. source independence: a source contributing fewer candidates to this cluster wins
--   8. earliest published_at, then candidate id (fully deterministic)
-- ---------------------------------------------------------------------------

create or replace function public.story_cluster_recompute(p_cluster_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rep_id       uuid;
  v_rep_headline text;
  v_count        integer;
begin
  perform 1 from public.story_clusters where id = p_cluster_id for update;
  if not found then
    raise exception 'story_cluster_recompute: unknown cluster %', p_cluster_id using errcode = 'foreign_key_violation';
  end if;

  select count(*) into v_count from public.story_cluster_members where cluster_id = p_cluster_id;
  if v_count = 0 then
    update public.story_clusters
    set candidate_count = 0, source_count = 0, provider_count = 0,
        representative_candidate_id = null, canonical_headline = null, status = 'closed'
    where id = p_cluster_id;
    return;
  end if;

  select r.id, r.headline into v_rep_id, v_rep_headline
  from (
    select
      c.id, c.headline, c.published_at, s.is_enabled, s.quality_bucket, c.classification_confidence,
      count(*) over (partition by c.source_id) as source_share
    from public.story_cluster_members m
    join public.news_candidates c on c.id = m.candidate_id
    join public.news_sources s on s.id = c.source_id
    where m.cluster_id = p_cluster_id
      and c.headline_kind = 'publisher-title'
  ) r
  order by
    (length(r.headline) between 20 and 220
       and r.headline !~ '(\.\.\.|…)\s*$'
       and r.headline !~ '\s[–—|]\s[^–—|]{2,60}$') desc,
    r.is_enabled desc,
    case r.quality_bucket when 'known' then 2 when 'unknown' then 1 else 0 end desc,
    case r.classification_confidence when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end desc,
    (r.published_at is not null) desc,
    r.source_share asc,
    r.published_at asc nulls last,
    r.id
  limit 1;

  update public.story_clusters sc
  set
    sport                       = agg.sport,
    league                      = agg.league,
    event_type                  = agg.event_type,
    representative_candidate_id = v_rep_id,
    canonical_headline          = v_rep_headline,
    candidate_count             = agg.candidate_count,
    source_count                = agg.source_count,
    provider_count              = (
      select count(*) from (
        select c2.provider_id from public.story_cluster_members m2
          join public.news_candidates c2 on c2.id = m2.candidate_id where m2.cluster_id = p_cluster_id
        union
        select e.provider_id from public.story_cluster_members m3
          join public.candidate_ingestion_events e on e.candidate_id = m3.candidate_id where m3.cluster_id = p_cluster_id
      ) providers
    ),
    first_seen_at               = agg.first_seen_at,
    last_seen_at                = agg.last_seen_at,
    first_published_at          = agg.first_published_at,
    last_published_at           = agg.last_published_at,
    confidence                  = agg.confidence
  from (
    select
      count(*)::integer                                       as candidate_count,
      count(distinct c.source_id)::integer                    as source_count,
      min(c.discovered_at)                                    as first_seen_at,
      max(c.discovered_at)                                    as last_seen_at,
      min(c.published_at)                                     as first_published_at,
      max(c.published_at)                                     as last_published_at,
      mode() within group (order by c.sport)                  as sport,
      mode() within group (order by c.league)                 as league,
      mode() within group (order by m.event_type)             as event_type,
      (array['low', 'medium', 'high'])[
        min(case m.confidence when 'low' then 1 when 'medium' then 2 else 3 end)
      ]                                                       as confidence
    from public.story_cluster_members m
    join public.news_candidates c on c.id = m.candidate_id
    where m.cluster_id = p_cluster_id
  ) agg
  where sc.id = p_cluster_id;
end;
$$;

revoke all on function public.story_cluster_recompute(uuid) from public, anon, authenticated;
grant execute on function public.story_cluster_recompute(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- news_cluster_assign — the atomic, idempotent write path for ONE candidate.
--
-- p_decision (jsonb):
--   cluster_id     uuid|null   cluster to join; null = create a new cluster
--   method         text        seed | exact-headline | fuzzy-headline | entity-overlap
--   score          numeric     0..1
--   confidence     text        high | medium | low
--   event_type     text|null   deterministic event type of this candidate
--   entities       text[]      entity evidence of this candidate
--   evidence       object      the full "why"
--   run_id         uuid|null   clustering_runs.id
--   ambiguous      array       [{cluster_id, score, confidence, reason, evidence}] near misses
--   exact_window_hours numeric default 48
--
-- Concurrency: an advisory transaction lock on the candidate's exact-headline key serialises
-- every writer of one headline group. A worker that intends to create a NEW cluster re-checks,
-- under that lock, whether a same-headline sibling is already clustered and joins it instead —
-- so two workers can never create two clusters for one exact headline. Membership uniqueness is
-- the primary key on story_cluster_members.candidate_id.
-- ---------------------------------------------------------------------------

create or replace function public.news_cluster_assign(p_candidate_id uuid, p_decision jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_c            record;
  v_cluster      uuid;
  v_existing     uuid;
  v_method       text;
  v_score        numeric;
  v_confidence   text;
  v_evidence     jsonb;
  v_created      boolean := false;
  v_race_guard   boolean := false;
  v_rows         integer;
  v_ambiguous    integer := 0;
  v_sibling      uuid;
  v_hops         integer := 0;
  v_next         uuid;
  v_window       interval;
  a              jsonb;
begin
  p_decision := coalesce(p_decision, '{}'::jsonb);

  select c.id, c.headline_kind, c.normalized_headline, c.sport, c.league, c.discovered_at,
         coalesce(c.published_at, c.discovered_at) as fresh_at
  into v_c
  from public.news_candidates c
  where c.id = p_candidate_id;
  if not found then
    raise exception 'news_cluster_assign: unknown candidate %', p_candidate_id using errcode = 'foreign_key_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('story-cluster:' || v_c.headline_kind || ':' || v_c.normalized_headline, 0));

  select cluster_id into v_existing from public.story_cluster_members where candidate_id = p_candidate_id;
  if found then
    return jsonb_build_object('status', 'already-clustered', 'cluster_id', v_existing, 'created_cluster', false);
  end if;

  v_cluster    := nullif(p_decision->>'cluster_id', '')::uuid;
  v_method     := coalesce(p_decision->>'method', 'seed');
  v_score      := coalesce((p_decision->>'score')::numeric, 1);
  v_confidence := coalesce(p_decision->>'confidence', 'high');
  v_evidence   := coalesce(p_decision->'evidence', '{}'::jsonb);
  v_window     := make_interval(secs => coalesce((p_decision->>'exact_window_hours')::numeric, 48) * 3600);

  -- Race guard: about to create a new cluster, but a same-headline sibling may have been clustered
  -- by a concurrent worker since the caller looked. Follow it.
  if v_cluster is null then
    select m.cluster_id into v_sibling
    from public.news_candidates s
    join public.story_cluster_members m on m.candidate_id = s.id
    where s.headline_kind = v_c.headline_kind
      and s.normalized_headline = v_c.normalized_headline
      and s.id <> p_candidate_id
      and coalesce(s.published_at, s.discovered_at) between v_c.fresh_at - v_window and v_c.fresh_at + v_window
      and (s.sport = v_c.sport or s.sport in ('unknown', 'other') or v_c.sport in ('unknown', 'other'))
    order by m.joined_at, s.id
    limit 1;
    if found then
      v_cluster := v_sibling;
      v_method := 'exact-headline';
      v_score := 1;
      v_confidence := 'high';
      v_evidence := v_evidence || jsonb_build_object('race_guard', true);
      v_race_guard := true;
    end if;
  end if;

  -- A cluster merged away in the meantime forwards to its survivor.
  while v_cluster is not null loop
    select merged_into_id into v_next from public.story_clusters where id = v_cluster;
    exit when v_next is null;
    v_hops := v_hops + 1;
    if v_hops > 10 then
      raise exception 'news_cluster_assign: merge chain too long from %', v_cluster;
    end if;
    v_cluster := v_next;
  end loop;

  if v_cluster is null then
    insert into public.story_clusters (sport, league, event_type, status, first_seen_at, last_seen_at)
    values (v_c.sport, v_c.league, nullif(p_decision->>'event_type', ''), 'open', v_c.discovered_at, v_c.discovered_at)
    returning id into v_cluster;
    v_created := true;
    v_method := 'seed';
  else
    perform 1 from public.story_clusters where id = v_cluster for update;
    if not found then
      raise exception 'news_cluster_assign: unknown cluster %', v_cluster using errcode = 'foreign_key_violation';
    end if;
    update public.story_clusters set status = 'open' where id = v_cluster and status = 'stable';
  end if;

  insert into public.story_cluster_members (
    candidate_id, cluster_id, match_method, match_score, confidence, event_type, entities, evidence, clustering_run_id
  )
  values (
    p_candidate_id, v_cluster, v_method, round(v_score, 4), v_confidence,
    nullif(p_decision->>'event_type', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_decision->'entities', '[]'::jsonb))), '{}'),
    v_evidence,
    nullif(p_decision->>'run_id', '')::uuid
  )
  on conflict (candidate_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('status', 'already-clustered', 'cluster_id', v_cluster, 'created_cluster', false);
  end if;

  -- The candidate now sits in a cluster: any near-miss pointing at that same cluster is resolved.
  delete from public.story_cluster_ambiguities where candidate_id = p_candidate_id and cluster_id = v_cluster;

  for a in select * from jsonb_array_elements(coalesce(p_decision->'ambiguous', '[]'::jsonb)) loop
    continue when (a->>'cluster_id')::uuid = v_cluster;
    insert into public.story_cluster_ambiguities (candidate_id, cluster_id, score, confidence, reason, evidence, clustering_run_id)
    values (
      p_candidate_id, (a->>'cluster_id')::uuid, round((a->>'score')::numeric, 4), a->>'confidence',
      coalesce(a->>'reason', 'below-auto-merge-confidence'), coalesce(a->'evidence', '{}'::jsonb),
      nullif(p_decision->>'run_id', '')::uuid
    )
    on conflict (candidate_id, cluster_id) do update
      set score = excluded.score, confidence = excluded.confidence, reason = excluded.reason,
          evidence = excluded.evidence, clustering_run_id = excluded.clustering_run_id;
    v_ambiguous := v_ambiguous + 1;
  end loop;

  perform public.story_cluster_recompute(v_cluster);

  return jsonb_build_object(
    'status', 'assigned', 'cluster_id', v_cluster, 'created_cluster', v_created,
    'method', v_method, 'race_guard', v_race_guard, 'ambiguous_recorded', v_ambiguous
  );
end;
$$;

revoke all on function public.news_cluster_assign(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.news_cluster_assign(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- story_cluster_merge — fold cluster B (p_from) into cluster A (p_into).
--
-- Transactional. Memberships (with their original method/score/evidence) are moved, not
-- rewritten; provenance (candidate_ingestion_events) is untouched because it hangs off the
-- candidate. The emptied cluster is ARCHIVED (status closed, merged_into_id set, counts 0),
-- never deleted, so history and the audit row stay resolvable. Both clusters are locked in
-- id order (no deadlock between two opposite merges). A survivor must itself be un-merged and
-- merged_into_id is only ever written on the archived side, so a cycle cannot form.
-- ---------------------------------------------------------------------------

create or replace function public.story_cluster_merge(p_into uuid, p_from uuid, p_reason text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_into      record;
  v_from      record;
  v_moved     integer;
begin
  if p_into is null or p_from is null then
    raise exception 'story_cluster_merge: both clusters are required';
  end if;
  if p_into = p_from then
    raise exception 'story_cluster_merge: cannot merge a cluster into itself (%)', p_into;
  end if;

  perform 1 from public.story_clusters where id in (p_into, p_from) order by id for update;

  select id, merged_into_id into v_into from public.story_clusters where id = p_into;
  if not found then raise exception 'story_cluster_merge: unknown target cluster %', p_into; end if;
  select id, merged_into_id, source_count, candidate_count into v_from from public.story_clusters where id = p_from;
  if not found then raise exception 'story_cluster_merge: unknown source cluster %', p_from; end if;

  if v_into.merged_into_id is not null then
    raise exception 'story_cluster_merge: target % was itself merged into % (would form a chain/cycle)', p_into, v_into.merged_into_id;
  end if;
  if v_from.merged_into_id is not null then
    raise exception 'story_cluster_merge: source % is already merged into %', p_from, v_from.merged_into_id;
  end if;

  update public.story_cluster_members
  set cluster_id = p_into, merged_from_cluster_id = p_from
  where cluster_id = p_from;
  get diagnostics v_moved = row_count;

  -- Near-misses that pointed at the archived cluster now point at the survivor; ones that would
  -- duplicate an existing row, or that the candidate has just resolved by moving in, are dropped.
  delete from public.story_cluster_ambiguities a
  where a.cluster_id = p_from
    and exists (select 1 from public.story_cluster_ambiguities b where b.candidate_id = a.candidate_id and b.cluster_id = p_into);
  update public.story_cluster_ambiguities set cluster_id = p_into where cluster_id = p_from;
  delete from public.story_cluster_ambiguities a
  where a.cluster_id = p_into
    and exists (select 1 from public.story_cluster_members m where m.candidate_id = a.candidate_id and m.cluster_id = p_into);

  insert into public.story_cluster_merges (into_cluster_id, from_cluster_id, members_moved, from_source_count, from_candidate_count, reason)
  values (p_into, p_from, v_moved, v_from.source_count, v_from.candidate_count, p_reason);

  update public.story_clusters set status = 'closed', merged_into_id = p_into where id = p_from;
  perform public.story_cluster_recompute(p_from);
  update public.story_clusters set status = 'open' where id = p_into and status in ('stable', 'closed');
  perform public.story_cluster_recompute(p_into);

  return jsonb_build_object('into', p_into, 'from', p_from, 'members_moved', v_moved);
end;
$$;

revoke all on function public.story_cluster_merge(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.story_cluster_merge(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- story_cluster_move_member — the small internal "fix one false merge" operation.
-- (Full split tooling is a future editorial feature.)
-- ---------------------------------------------------------------------------

create or replace function public.story_cluster_move_member(p_candidate_id uuid, p_to uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_from uuid;
  v_dest_merged uuid;
begin
  select cluster_id into v_from from public.story_cluster_members where candidate_id = p_candidate_id;
  if not found then
    raise exception 'story_cluster_move_member: candidate % is not in a cluster', p_candidate_id;
  end if;
  if v_from = p_to then
    return jsonb_build_object('moved', false, 'reason', 'already-in-cluster');
  end if;

  perform 1 from public.story_clusters where id in (v_from, p_to) order by id for update;
  select merged_into_id into v_dest_merged from public.story_clusters where id = p_to;
  if not found then raise exception 'story_cluster_move_member: unknown destination cluster %', p_to; end if;
  if v_dest_merged is not null then
    raise exception 'story_cluster_move_member: destination % was merged into %', p_to, v_dest_merged;
  end if;

  update public.story_cluster_members
  set cluster_id = p_to,
      merged_from_cluster_id = v_from,
      evidence = evidence || jsonb_build_object('moved_from', v_from, 'previous_method', match_method),
      match_method = 'manual'
  where candidate_id = p_candidate_id;

  delete from public.story_cluster_ambiguities where candidate_id = p_candidate_id and cluster_id = p_to;
  perform public.story_cluster_recompute(v_from);
  perform public.story_cluster_recompute(p_to);
  return jsonb_build_object('moved', true, 'from', v_from, 'to', p_to);
end;
$$;

revoke all on function public.story_cluster_move_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.story_cluster_move_member(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- story_cluster_age_out — open → stable → closed by quiet time. Only status; never touches
-- counts. (Merged clusters are already closed.)
-- ---------------------------------------------------------------------------

create or replace function public.story_cluster_age_out(
  p_stable_after interval default interval '24 hours',
  p_close_after  interval default interval '72 hours',
  p_now          timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_closed integer;
  v_stable integer;
begin
  update public.story_clusters set status = 'closed'
  where status in ('open', 'stable') and merged_into_id is null and last_seen_at < p_now - p_close_after;
  get diagnostics v_closed = row_count;

  update public.story_clusters set status = 'stable'
  where status = 'open' and merged_into_id is null and last_seen_at < p_now - p_stable_after;
  get diagnostics v_stable = row_count;

  return jsonb_build_object('stable', v_stable, 'closed', v_closed);
end;
$$;

revoke all on function public.story_cluster_age_out(interval, interval, timestamptz) from public, anon, authenticated;
grant execute on function public.story_cluster_age_out(interval, interval, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Stale clustering-run reaper (same contract as news_reap_stale_runs: close, never delete).
-- ---------------------------------------------------------------------------

create or replace function public.news_reap_stale_clustering_runs(p_stale_after interval default interval '30 minutes')
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  with reaped as (
    update public.clustering_runs
    set status = 'failed',
        finished_at = now(),
        error_message = 'stale-run-reaped: still running after ' || p_stale_after::text || ' (started ' || started_at::text || ')'
    where status = 'running' and started_at < now() - p_stale_after
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from reaped;
  return jsonb_build_object('reaped', cardinality(v_ids), 'run_ids', to_jsonb(v_ids));
end;
$$;

revoke all on function public.news_reap_stale_clustering_runs(interval) from public, anon, authenticated;
grant execute on function public.news_reap_stale_clustering_runs(interval) to service_role;

do $jobs$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('newsroom-reap-stale-clustering-runs', '*/10 * * * *', $cmd$select public.news_reap_stale_clustering_runs(interval '30 minutes')$cmd$);
  end if;
end
$jobs$;

-- ---------------------------------------------------------------------------
-- Internal read models (security_invoker, service_role only).
-- ---------------------------------------------------------------------------

-- Candidates that belong to no cluster yet — the clustering work queue and a health signal.
create view public.news_unclustered_candidates
  with (security_invoker = true) as
select
  c.id                                       as candidate_id,
  c.sport,
  c.headline_kind,
  coalesce(c.published_at, c.discovered_at)  as fresh_at,
  c.discovered_at
from public.news_candidates c
where not exists (select 1 from public.story_cluster_members m where m.candidate_id = c.id);

-- Live clusters with their representative. Discovery-text can never be the representative,
-- so representative_* / canonical_headline are null for a cluster holding only discovery text.
create view public.story_cluster_feed
  with (security_invoker = true) as
select
  sc.id                                             as cluster_id,
  sc.sport,
  sc.league,
  sc.event_type,
  sc.status,
  sc.confidence,
  sc.canonical_headline,
  sc.representative_candidate_id,
  rc.source_url                                     as representative_url,
  rs.domain                                         as representative_domain,
  rs.display_name                                   as representative_source,
  sc.candidate_count,
  sc.source_count,
  sc.provider_count,
  sc.first_seen_at,
  sc.last_seen_at,
  sc.first_published_at,
  sc.last_published_at,
  coalesce(sc.last_published_at, sc.last_seen_at)   as fresh_at,
  coalesce((
    select array_agg(distinct ent order by ent)
    from public.story_cluster_members m, lateral unnest(m.entities) as ent
    where m.cluster_id = sc.id
  ), '{}'::text[])                                  as entities
from public.story_clusters sc
left join public.news_candidates rc on rc.id = sc.representative_candidate_id
left join public.news_sources rs on rs.id = rc.source_id
where sc.merged_into_id is null
  and sc.candidate_count > 0;

-- Near-misses still unresolved: the candidate is in a different cluster than the one it nearly joined.
create view public.story_cluster_review_queue
  with (security_invoker = true) as
select
  a.id                 as ambiguity_id,
  a.candidate_id,
  m.cluster_id         as current_cluster_id,
  a.cluster_id         as suggested_cluster_id,
  a.score,
  a.confidence,
  a.reason,
  a.evidence,
  a.created_at
from public.story_cluster_ambiguities a
join public.story_cluster_members m on m.candidate_id = a.candidate_id
where a.dismissed_at is null
  and m.cluster_id <> a.cluster_id;

revoke all on public.news_unclustered_candidates from public, anon, authenticated;
revoke all on public.story_cluster_feed          from public, anon, authenticated;
revoke all on public.story_cluster_review_queue  from public, anon, authenticated;
grant select on public.news_unclustered_candidates to service_role;
grant select on public.story_cluster_feed          to service_role;
grant select on public.story_cluster_review_queue  to service_role;
