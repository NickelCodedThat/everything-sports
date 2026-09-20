-- Phase 4 — Persistent News Warehouse
--
-- Durable memory for the newsroom: provider registry, publisher domains,
-- canonical candidates (one row per normalized URL), per-sighting provenance,
-- rejection records, ingestion-run audit trail, and immutable-unit cursors
-- (e.g. GDELT GKG 15-minute files).
--
-- Security model: every table has RLS enabled with NO policies and all client
-- privileges revoked. Only the server-side secret key (service_role) can read
-- or write. Provider *policy* stays canonical in src/lib/news/policy/registry.ts;
-- the columns here are operational copies only.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.news_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- news_providers — discovery systems (gdelt, gdelt-gkg, newsdata, wikipedia-events)
-- ---------------------------------------------------------------------------

create table public.news_providers (
  id                 smallint generated always as identity primary key,
  provider_key       text not null unique check (provider_key = lower(provider_key) and length(provider_key) > 0),
  display_name       text not null,
  -- Operational switch, owned by the database: 'disabled' makes the ingester refuse to run the provider.
  status             text not null default 'active' check (status in ('active', 'degraded', 'disabled')),
  expected_freshness text not null check (expected_freshness in ('realtime', 'near-realtime', 'delayed-12h', 'daily-curated', 'unknown')),
  requires_api_key   boolean not null default false,
  -- Copy of the code registry's status at last sync; the registry stays canonical.
  policy_status      text not null check (policy_status in ('approved', 'development-only', 'deferred', 'rejected')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger news_providers_set_updated_at
  before update on public.news_providers
  for each row execute function public.news_set_updated_at();

-- ---------------------------------------------------------------------------
-- news_sources — actual publishers, keyed by normalized domain
-- ---------------------------------------------------------------------------

create table public.news_sources (
  id             bigint generated always as identity primary key,
  domain         text not null unique check (domain = lower(domain) and domain !~ '^www\.' and length(domain) > 0),
  display_name   text not null,
  -- Operational bucket, not an editorial/political score. See src/lib/news/sources/quality.ts.
  quality_bucket text not null default 'unknown' check (quality_bucket in ('known', 'unknown', 'low-quality')),
  -- Lets a future control room silence a bad source without a code change; the ingester honors it.
  is_enabled     boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger news_sources_set_updated_at
  before update on public.news_sources
  for each row execute function public.news_set_updated_at();

-- ---------------------------------------------------------------------------
-- ingestion_runs — auditable record of every ingestion attempt
-- ---------------------------------------------------------------------------

create table public.ingestion_runs (
  id                        uuid primary key default gen_random_uuid(),
  provider_id               smallint not null references public.news_providers (id),
  status                    text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  trigger                   text not null default 'manual' check (trigger in ('manual', 'scheduled', 'test')),
  window_label              text,
  provider_state            text check (provider_state in ('ok', 'empty', 'unavailable', 'throttled', 'error')),
  started_at                timestamptz not null default now(),
  finished_at               timestamptz,
  records_returned          integer not null default 0 check (records_returned >= 0),
  records_accepted          integer not null default 0 check (records_accepted >= 0),
  records_rejected          integer not null default 0 check (records_rejected >= 0),
  records_inserted          integer not null default 0 check (records_inserted >= 0),
  records_duplicate_url     integer not null default 0 check (records_duplicate_url >= 0),
  records_duplicate_headline integer not null default 0 check (records_duplicate_headline >= 0),
  observations_created      integer not null default 0 check (observations_created >= 0),
  sources_created           integer not null default 0 check (sources_created >= 0),
  units_processed           integer not null default 0 check (units_processed >= 0),
  units_skipped             integer not null default 0 check (units_skipped >= 0),
  error_message             text,
  metadata                  jsonb not null default '{}'::jsonb,
  check (finished_at is null or finished_at >= started_at)
);

create index ingestion_runs_provider_started_idx on public.ingestion_runs (provider_id, started_at desc);
create index ingestion_runs_started_idx on public.ingestion_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- news_ingestion_units — immutable provider units (GKG 15-minute files) processed exactly once
-- ---------------------------------------------------------------------------

create table public.news_ingestion_units (
  id                  bigint generated always as identity primary key,
  provider_id         smallint not null references public.news_providers (id),
  -- e.g. 'gdelt-gkg:20260920121500'. Globally unique: a unit is claimed in the same
  -- transaction that stores its candidates, so a rerun (or a concurrent worker) is a no-op.
  unit_key            text not null unique,
  ingestion_run_id    uuid not null references public.ingestion_runs (id),
  candidates_received integer not null default 0,
  candidates_inserted integer not null default 0,
  processed_at        timestamptz not null default now(),
  check (position(':' in unit_key) > 1)
);

create index news_ingestion_units_provider_idx on public.news_ingestion_units (provider_id, processed_at desc);

-- ---------------------------------------------------------------------------
-- news_candidates — canonical candidate, exactly one row per normalized URL
-- ---------------------------------------------------------------------------

create table public.news_candidates (
  id                        uuid primary key default gen_random_uuid(),
  -- The provider that FIRST discovered this URL. Later sightings live in candidate_ingestion_events.
  provider_id               smallint not null references public.news_providers (id),
  provider_item_id          text,
  source_id                 bigint not null references public.news_sources (id),
  headline                  text not null check (length(btrim(headline)) > 0),
  normalized_headline       text not null check (length(normalized_headline) > 0),
  -- 'publisher-title': a publisher's own title. 'discovery-text': provider prose (e.g. Wikipedia
  -- event sentences, CC BY-SA) that must never be displayed as a headline.
  headline_kind             text not null default 'publisher-title' check (headline_kind in ('publisher-title', 'discovery-text')),
  source_url                text not null,
  normalized_source_url     text not null unique,
  published_at              timestamptz,
  discovered_at             timestamptz not null,
  sport                     text not null check (sport in ('basketball', 'football', 'baseball', 'boxing', 'mma', 'soccer', 'hockey', 'tennis', 'golf', 'motorsports', 'olympics', 'other', 'unknown')),
  league                    text,
  classification_confidence text not null check (classification_confidence in ('high', 'medium', 'low', 'none')),
  classification_signals    jsonb not null default '[]'::jsonb check (jsonb_typeof(classification_signals) = 'array'),
  provider_categories       jsonb check (provider_categories is null or jsonb_typeof(provider_categories) = 'array'),
  query_profile             text,
  source_quality            text not null check (source_quality in ('known', 'unknown', 'low-quality')),
  language                  text,
  -- DIAGNOSTIC ONLY: a pointer to a provider-supplied image. Never rendered, downloaded or proxied.
  remote_image_ref          text,
  fingerprint               text not null,
  -- new → first sighting of a headline group; duplicate → same normalized headline as an earlier
  -- candidate (see headline_primary_id); accepted/rejected/clustered/promoted are reserved for
  -- later phases and are not written by ingestion.
  status                    text not null default 'new' check (status in ('new', 'accepted', 'rejected', 'duplicate', 'clustered', 'promoted')),
  -- The root candidate of this normalized-headline group; null on the root itself.
  headline_primary_id       uuid references public.news_candidates (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (headline_primary_id is null or headline_primary_id <> id),
  check (status <> 'duplicate' or headline_primary_id is not null)
);

-- One provider item is one candidate, when the provider exposes an item id.
create unique index news_candidates_provider_item_uidx
  on public.news_candidates (provider_id, provider_item_id)
  where provider_item_id is not null;

-- Backstop for the ingest function's advisory lock: exactly one root per headline group.
create unique index news_candidates_headline_root_uidx
  on public.news_candidates (headline_kind, normalized_headline)
  where headline_primary_id is null;

create index news_candidates_published_at_idx on public.news_candidates (published_at desc nulls last);
create index news_candidates_discovered_at_idx on public.news_candidates (discovered_at desc);
create index news_candidates_sport_published_idx on public.news_candidates (sport, published_at desc nulls last);
create index news_candidates_provider_idx on public.news_candidates (provider_id);
create index news_candidates_source_idx on public.news_candidates (source_id);
create index news_candidates_status_idx on public.news_candidates (status);
create index news_candidates_normalized_headline_idx on public.news_candidates (normalized_headline);
create index news_candidates_fingerprint_idx on public.news_candidates (fingerprint);
create index news_candidates_headline_primary_idx on public.news_candidates (headline_primary_id) where headline_primary_id is not null;

create trigger news_candidates_set_updated_at
  before update on public.news_candidates
  for each row execute function public.news_set_updated_at();

-- ---------------------------------------------------------------------------
-- candidate_ingestion_events — provenance: every sighting of a candidate
-- ---------------------------------------------------------------------------

create table public.candidate_ingestion_events (
  id                 bigint generated always as identity primary key,
  candidate_id       uuid not null references public.news_candidates (id) on delete cascade,
  provider_id        smallint not null references public.news_providers (id),
  ingestion_run_id   uuid not null references public.ingestion_runs (id),
  -- '' when the provider has no immutable units; otherwise e.g. 'gdelt-gkg:20260920121500'.
  unit_key           text not null default '',
  provider_item_id   text,
  observed_at        timestamptz not null default now(),
  published_at       timestamptz,
  -- True on the event that created the canonical candidate.
  created_candidate  boolean not null default false,
  unique (candidate_id, ingestion_run_id, unit_key)
);

create index candidate_ingestion_events_candidate_idx on public.candidate_ingestion_events (candidate_id, observed_at desc);
create index candidate_ingestion_events_run_idx on public.candidate_ingestion_events (ingestion_run_id);
create index candidate_ingestion_events_provider_idx on public.candidate_ingestion_events (provider_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- candidate_rejections — what intake rejected, why, when, and from which provider
-- ---------------------------------------------------------------------------

create table public.candidate_rejections (
  id                  bigint generated always as identity primary key,
  provider_id         smallint not null references public.news_providers (id),
  -- Same fingerprint scheme as candidates (normalized URL). A re-seen rejection bumps times_seen.
  fingerprint         text not null,
  -- Headline + link metadata only: enough to debug intake quality, no article content.
  headline            text not null,
  source_url          text not null,
  publisher_domain    text not null,
  source_id           bigint references public.news_sources (id),
  sport               text,
  reasons             text[] not null check (
    cardinality(reasons) > 0
    and reasons <@ array[
      'malformed-headline', 'non-english', 'betting-or-fantasy', 'template-page', 'video-page',
      'generic-page', 'historical-stats-page', 'not-sports', 'low-quality-source', 'disabled-source'
    ]::text[]
  ),
  first_run_id        uuid not null references public.ingestion_runs (id),
  last_run_id         uuid not null references public.ingestion_runs (id),
  times_seen          integer not null default 1 check (times_seen >= 1),
  first_rejected_at   timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  unique (provider_id, fingerprint)
);

create index candidate_rejections_last_seen_idx on public.candidate_rejections (last_seen_at desc);
create index candidate_rejections_reasons_idx on public.candidate_rejections using gin (reasons);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, no policies, no client privileges.
-- ---------------------------------------------------------------------------

alter table public.news_providers             enable row level security;
alter table public.news_sources               enable row level security;
alter table public.ingestion_runs             enable row level security;
alter table public.news_ingestion_units       enable row level security;
alter table public.news_candidates            enable row level security;
alter table public.candidate_ingestion_events enable row level security;
alter table public.candidate_rejections       enable row level security;

revoke all on public.news_providers             from public, anon, authenticated;
revoke all on public.news_sources               from public, anon, authenticated;
revoke all on public.ingestion_runs             from public, anon, authenticated;
revoke all on public.news_ingestion_units       from public, anon, authenticated;
revoke all on public.news_candidates            from public, anon, authenticated;
revoke all on public.candidate_ingestion_events from public, anon, authenticated;
revoke all on public.candidate_rejections       from public, anon, authenticated;

revoke all on sequence public.news_providers_id_seq             from public, anon, authenticated;
revoke all on sequence public.news_sources_id_seq               from public, anon, authenticated;
revoke all on sequence public.news_ingestion_units_id_seq       from public, anon, authenticated;
revoke all on sequence public.candidate_ingestion_events_id_seq from public, anon, authenticated;
revoke all on sequence public.candidate_rejections_id_seq       from public, anon, authenticated;

grant select, insert, update, delete on public.news_providers             to service_role;
grant select, insert, update, delete on public.news_sources               to service_role;
grant select, insert, update, delete on public.ingestion_runs             to service_role;
grant select, insert, update, delete on public.news_ingestion_units       to service_role;
grant select, insert, update, delete on public.news_candidates            to service_role;
grant select, insert, update, delete on public.candidate_ingestion_events to service_role;
grant select, insert, update, delete on public.candidate_rejections       to service_role;

grant usage, select on sequence public.news_providers_id_seq             to service_role;
grant usage, select on sequence public.news_sources_id_seq               to service_role;
grant usage, select on sequence public.news_ingestion_units_id_seq       to service_role;
grant usage, select on sequence public.candidate_ingestion_events_id_seq to service_role;
grant usage, select on sequence public.candidate_rejections_id_seq       to service_role;

revoke all on function public.news_set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- news_headline_groups — "how many distinct sources are carrying this headline?"
-- Not clustering: exact normalized-headline grouping only.
-- ---------------------------------------------------------------------------

create view public.news_headline_groups
  with (security_invoker = true) as
select
  c.headline_kind,
  c.normalized_headline,
  (array_agg(c.headline order by c.created_at, c.id))[1] as sample_headline,
  count(*)::integer                         as candidate_count,
  count(distinct c.source_id)::integer      as source_count,
  min(c.discovered_at)                      as first_seen_at,
  max(c.discovered_at)                      as last_seen_at
from public.news_candidates c
group by c.headline_kind, c.normalized_headline;

revoke all on public.news_headline_groups from public, anon, authenticated;
grant select on public.news_headline_groups to service_role;

-- ---------------------------------------------------------------------------
-- news_ingest_batch — the atomic, idempotent write path
--
-- One call = one transaction: claim the (optional) immutable unit, upsert sources,
-- upsert candidates on their unique keys, record every sighting, record rejections.
-- Dedupe is enforced by unique indexes + ON CONFLICT, never by SELECT-then-INSERT alone.
-- Any error (e.g. a check-constraint violation) rolls back the whole batch, including
-- the unit claim, so a failed file is retried cleanly.
-- ---------------------------------------------------------------------------

create or replace function public.news_ingest_batch(
  p_run_id      uuid,
  p_candidates  jsonb,
  p_rejections  jsonb,
  p_unit_key    text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_provider_id        smallint;
  v_rows               integer;
  v_candidates_received integer := 0;
  v_inserted           integer := 0;
  v_existing_url       integer := 0;
  v_existing_item      integer := 0;
  v_duplicate_headline integer := 0;
  v_observations       integer := 0;
  v_sources_created    integer := 0;
  v_rej_new            integer := 0;
  v_rej_seen           integer := 0;
  v_disabled_rejected  integer := 0;
  v_candidate_id       uuid;
  v_root_id            uuid;
  v_source_id          bigint;
  v_source_enabled     boolean;
  v_existing_id        uuid;
  v_unit_key           text := coalesce(p_unit_key, '');
  v_created            boolean;
  c                    record;
begin
  p_candidates := coalesce(p_candidates, '[]'::jsonb);
  p_rejections := coalesce(p_rejections, '[]'::jsonb);

  select provider_id into v_provider_id from public.ingestion_runs where id = p_run_id;
  if v_provider_id is null then
    raise exception 'news_ingest_batch: unknown ingestion run %', p_run_id using errcode = 'foreign_key_violation';
  end if;

  v_candidates_received := jsonb_array_length(p_candidates);

  -- 1. Claim the immutable unit. A concurrent or repeated claim inserts nothing and we stop.
  if p_unit_key is not null then
    insert into public.news_ingestion_units (provider_id, unit_key, ingestion_run_id)
    values (v_provider_id, p_unit_key, p_run_id)
    on conflict (unit_key) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return jsonb_build_object(
        'unit_skipped', true, 'candidates_received', v_candidates_received, 'inserted', 0,
        'existing_url', 0, 'existing_provider_item', 0, 'duplicate_headline', 0,
        'observations_created', 0, 'sources_created', 0, 'rejections_recorded', 0,
        'rejections_seen_again', 0, 'disabled_source_rejected', 0
      );
    end if;
  end if;

  -- 2. Upsert publisher domains (candidates and rejections both introduce sources).
  with incoming as (
    select lower(x.publisher_domain) as domain, x.publisher_name, x.source_quality
    from jsonb_to_recordset(p_candidates) as x(publisher_domain text, publisher_name text, source_quality text)
    union all
    select lower(x.publisher_domain), x.publisher_name, x.source_quality
    from jsonb_to_recordset(p_rejections) as x(publisher_domain text, publisher_name text, source_quality text)
  ),
  dedup as (
    select distinct on (domain) domain, coalesce(publisher_name, domain) as display_name, source_quality
    from incoming
    order by domain, (publisher_name is null), source_quality
  ),
  ins as (
    insert into public.news_sources (domain, display_name, quality_bucket)
    select domain, display_name, source_quality from dedup
    on conflict (domain) do nothing
    returning 1
  )
  select count(*) into v_sources_created from ins;

  -- 3. Candidates, in a deterministic order so concurrent batches take advisory locks consistently.
  for c in
    select *
    from jsonb_to_recordset(p_candidates) as x(
      provider_item_id text, headline text, normalized_headline text, headline_kind text,
      source_url text, normalized_source_url text, fingerprint text, publisher_domain text,
      source_quality text, published_at timestamptz, discovered_at timestamptz, sport text,
      league text, classification_confidence text, classification_signals jsonb,
      provider_categories jsonb, query_profile text, language text, remote_image_ref text
    )
    order by x.normalized_headline, x.normalized_source_url
  loop
    select id, is_enabled into v_source_id, v_source_enabled
    from public.news_sources where domain = lower(c.publisher_domain);

    -- A source switched off in the database is never ingested; record why.
    if not v_source_enabled then
      insert into public.candidate_rejections (
        provider_id, fingerprint, headline, source_url, publisher_domain, source_id, sport,
        reasons, first_run_id, last_run_id
      )
      values (
        v_provider_id, c.fingerprint, c.headline, c.source_url, lower(c.publisher_domain), v_source_id, c.sport,
        array['disabled-source'], p_run_id, p_run_id
      )
      on conflict (provider_id, fingerprint) do update
        set times_seen = public.candidate_rejections.times_seen + 1,
            last_seen_at = now(),
            last_run_id = excluded.last_run_id;
      v_disabled_rejected := v_disabled_rejected + 1;
      continue;
    end if;

    -- Serialize writers of the same headline group; the partial unique index is the backstop.
    perform pg_advisory_xact_lock(hashtextextended(c.headline_kind || ':' || c.normalized_headline, 0));

    select id into v_root_id
    from public.news_candidates
    where headline_kind = c.headline_kind
      and normalized_headline = c.normalized_headline
      and headline_primary_id is null;

    insert into public.news_candidates (
      provider_id, provider_item_id, source_id, headline, normalized_headline, headline_kind,
      source_url, normalized_source_url, published_at, discovered_at, sport, league,
      classification_confidence, classification_signals, provider_categories, query_profile,
      source_quality, language, remote_image_ref, fingerprint, status, headline_primary_id
    )
    values (
      v_provider_id, c.provider_item_id, v_source_id, c.headline, c.normalized_headline, c.headline_kind,
      c.source_url, c.normalized_source_url, c.published_at, c.discovered_at, c.sport, c.league,
      c.classification_confidence, coalesce(c.classification_signals, '[]'::jsonb), c.provider_categories,
      c.query_profile, c.source_quality, c.language, c.remote_image_ref, c.fingerprint,
      case when v_root_id is null then 'new' else 'duplicate' end,
      v_root_id
    )
    on conflict do nothing   -- normalized_source_url or (provider_id, provider_item_id) already stored
    returning id into v_candidate_id;

    v_created := v_candidate_id is not null;
    if v_created then
      v_inserted := v_inserted + 1;
      if v_root_id is not null then
        v_duplicate_headline := v_duplicate_headline + 1;
      end if;
    else
      select id into v_existing_id from public.news_candidates
      where normalized_source_url = c.normalized_source_url;
      if v_existing_id is not null then
        v_existing_url := v_existing_url + 1;
      else
        select id into v_existing_id from public.news_candidates
        where provider_id = v_provider_id and provider_item_id = c.provider_item_id;
        if v_existing_id is null then
          raise exception 'news_ingest_batch: candidate neither inserted nor found (%)', c.normalized_source_url;
        end if;
        v_existing_item := v_existing_item + 1;
      end if;
      v_candidate_id := v_existing_id;
    end if;

    -- Provenance: never throw away that another provider/run/file saw this candidate.
    insert into public.candidate_ingestion_events (
      candidate_id, provider_id, ingestion_run_id, unit_key, provider_item_id, published_at, created_candidate
    )
    values (
      v_candidate_id, v_provider_id, p_run_id, v_unit_key, c.provider_item_id, c.published_at,
      v_created
    )
    on conflict (candidate_id, ingestion_run_id, unit_key) do nothing;
    get diagnostics v_rows = row_count;
    v_observations := v_observations + v_rows;

    v_existing_id := null;
    v_candidate_id := null;
  end loop;

  -- 4. Rejections: upsert on (provider, fingerprint); a re-seen rejection bumps a counter.
  with rej as (
    select distinct on (x.fingerprint)
      x.fingerprint, x.headline, x.source_url, lower(x.publisher_domain) as publisher_domain, x.sport,
      array(select jsonb_array_elements_text(x.reasons)) as reasons
    from jsonb_to_recordset(p_rejections) as x(
      fingerprint text, headline text, source_url text, publisher_domain text, sport text, reasons jsonb
    )
    order by x.fingerprint
  ),
  upserted as (
    insert into public.candidate_rejections (
      provider_id, fingerprint, headline, source_url, publisher_domain, source_id, sport, reasons,
      first_run_id, last_run_id
    )
    select v_provider_id, r.fingerprint, r.headline, r.source_url, r.publisher_domain, s.id, r.sport, r.reasons,
           p_run_id, p_run_id
    from rej r
    left join public.news_sources s on s.domain = r.publisher_domain
    on conflict (provider_id, fingerprint) do update
      set times_seen = public.candidate_rejections.times_seen + 1,
          last_seen_at = now(),
          last_run_id = excluded.last_run_id
    returning (xmax = 0) as was_inserted
  )
  select count(*) filter (where was_inserted), count(*) filter (where not was_inserted)
  into v_rej_new, v_rej_seen
  from upserted;

  if p_unit_key is not null then
    update public.news_ingestion_units
    set candidates_received = v_candidates_received, candidates_inserted = v_inserted
    where unit_key = p_unit_key;
  end if;

  return jsonb_build_object(
    'unit_skipped', false,
    'candidates_received', v_candidates_received,
    'inserted', v_inserted,
    'existing_url', v_existing_url,
    'existing_provider_item', v_existing_item,
    'duplicate_headline', v_duplicate_headline,
    'observations_created', v_observations,
    'sources_created', v_sources_created,
    'rejections_recorded', v_rej_new,
    'rejections_seen_again', v_rej_seen,
    'disabled_source_rejected', v_disabled_rejected
  );
end;
$$;

revoke all on function public.news_ingest_batch(uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.news_ingest_batch(uuid, jsonb, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- news_warehouse_stats — internal/debug summary (no public dashboard yet)
-- ---------------------------------------------------------------------------

create or replace function public.news_warehouse_stats(p_recent interval default interval '24 hours')
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with totals as (
    select
      count(*)::integer                                              as total_candidates,
      count(distinct (headline_kind, normalized_headline))::integer  as distinct_headlines,
      count(*) filter (where status = 'duplicate')::integer          as duplicate_headline_candidates,
      count(*) filter (where discovered_at >= now() - p_recent)::integer as new_recent
    from public.news_candidates
  ),
  events as (
    select count(*)::integer as total_events from public.candidate_ingestion_events
  ),
  latest_run as (
    select r.id, p.provider_key, r.status, r.provider_state, r.started_at, r.finished_at,
           r.records_returned, r.records_accepted, r.records_rejected, r.records_inserted,
           r.records_duplicate_url, r.records_duplicate_headline, r.units_processed, r.units_skipped
    from public.ingestion_runs r join public.news_providers p on p.id = r.provider_id
    order by r.started_at desc limit 1
  )
  select jsonb_build_object(
    'total_candidates', (select total_candidates from totals),
    'distinct_headlines', (select distinct_headlines from totals),
    'duplicate_headline_candidates', (select duplicate_headline_candidates from totals),
    'duplicate_headline_rate',
      (select case when total_candidates = 0 then 0 else round(duplicate_headline_candidates::numeric / total_candidates, 4) end from totals),
    'new_in_recent_window', (select new_recent from totals),
    'total_observations', (select total_events from events),
    'sources', (select count(*) from public.news_sources),
    'disabled_sources', (select count(*) from public.news_sources where not is_enabled),
    'by_sport', coalesce((select jsonb_object_agg(sport, n) from (select sport, count(*)::integer n from public.news_candidates group by sport) t), '{}'::jsonb),
    'by_provider', coalesce((select jsonb_object_agg(provider_key, n) from (select p.provider_key, count(*)::integer n from public.news_candidates c join public.news_providers p on p.id = c.provider_id group by p.provider_key) t), '{}'::jsonb),
    'by_source_quality', coalesce((select jsonb_object_agg(source_quality, n) from (select source_quality, count(*)::integer n from public.news_candidates group by source_quality) t), '{}'::jsonb),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*)::integer n from public.news_candidates group by status) t), '{}'::jsonb),
    'rejections_total', (select count(*) from public.candidate_rejections),
    'rejections_by_reason', coalesce((select jsonb_object_agg(reason, n) from (select reason, count(*)::integer n from public.candidate_rejections, unnest(reasons) as reason group by reason) t), '{}'::jsonb),
    'top_headline_groups', coalesce((select jsonb_agg(g) from (
        select sample_headline, source_count, candidate_count from public.news_headline_groups
        where candidate_count > 1 order by source_count desc, candidate_count desc limit 5) g), '[]'::jsonb),
    'latest_run', (select to_jsonb(latest_run) from latest_run),
    'runs_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*)::integer n from public.ingestion_runs group by status) t), '{}'::jsonb)
  );
$$;

revoke all on function public.news_warehouse_stats(interval) from public, anon, authenticated;
grant execute on function public.news_warehouse_stats(interval) to service_role;
