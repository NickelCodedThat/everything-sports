-- Phase 5 — Automated Newsroom Engine (database side)
--
-- Adds what a scheduled, unattended ingester needs from Postgres:
--   * newsroom_locks + acquire/release functions — lease-style overlap protection
--   * news_reap_stale_runs — recovery for runs whose process died mid-flight
--   * news_headline_groups — evolved with the columns a clustering phase needs
--   * news_candidate_feed  — internal "freshest first" read model (no public access)
--   * newsroom_scheduler_status — is cron wired up? (booleans only, never secrets)
--
-- Same security posture as Phase 4: RLS on, no policies, everything revoked from
-- public/anon/authenticated, service_role only.

-- ---------------------------------------------------------------------------
-- Overlap protection: a lease lock keyed by name (e.g. 'ingest:gdelt-gkg').
--
-- A session-level advisory lock cannot be used: the server talks to Postgres over
-- pooled REST/RPC calls, so a lock taken in one request is gone before the next.
-- A row with an expiry survives across requests and self-heals after a crash:
-- once expires_at passes, the next caller may take it over.
-- ---------------------------------------------------------------------------

create table public.newsroom_locks (
  lock_key    text primary key check (length(lock_key) > 0),
  holder      uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  check (expires_at > acquired_at)
);

alter table public.newsroom_locks enable row level security;
revoke all on public.newsroom_locks from public, anon, authenticated;
grant select, insert, update, delete on public.newsroom_locks to service_role;

-- Returns true when the caller now holds the lock. The INSERT ... ON CONFLICT DO UPDATE
-- ... WHERE expired is atomic on the lock row, so two racing callers cannot both win.
create or replace function public.newsroom_try_acquire_lock(p_lock_key text, p_holder uuid, p_ttl interval)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  insert into public.newsroom_locks (lock_key, holder, acquired_at, expires_at)
  values (p_lock_key, p_holder, now(), now() + p_ttl)
  on conflict (lock_key) do update
    set holder = excluded.holder,
        acquired_at = now(),
        expires_at = excluded.expires_at
    where public.newsroom_locks.expires_at <= now();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- Only the current holder can release; releasing a lock you no longer hold (it expired and
-- was taken over) is a harmless no-op that returns false.
create or replace function public.newsroom_release_lock(p_lock_key text, p_holder uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  delete from public.newsroom_locks where lock_key = p_lock_key and holder = p_holder;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.newsroom_try_acquire_lock(text, uuid, interval) from public, anon, authenticated;
revoke all on function public.newsroom_release_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.newsroom_try_acquire_lock(text, uuid, interval) to service_role;
grant execute on function public.newsroom_release_lock(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Stale-run reaper. Never deletes: a run stuck in 'running' is closed as failed with an
-- explicit reason and a finished_at, keeping the audit trail.
-- ---------------------------------------------------------------------------

create or replace function public.news_reap_stale_runs(p_stale_after interval default interval '30 minutes')
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  with reaped as (
    update public.ingestion_runs
    set status = 'failed',
        provider_state = 'error',
        finished_at = now(),
        error_message = 'stale-run-reaped: still running after ' || p_stale_after::text
                        || ' (started ' || started_at::text || ')',
        metadata = metadata || jsonb_build_object('failure_reason', 'stale-run-reaped', 'reaped_at', now())
    where status = 'running'
      and started_at < now() - p_stale_after
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from reaped;

  return jsonb_build_object('reaped', cardinality(v_ids), 'run_ids', to_jsonb(v_ids));
end;
$$;

revoke all on function public.news_reap_stale_runs(interval) from public, anon, authenticated;
grant execute on function public.news_reap_stale_runs(interval) to service_role;

-- ---------------------------------------------------------------------------
-- Headline groups, evolved as clean input for a future clustering phase.
-- (Adds columns at the end so the Phase 4 definition stays a valid prefix.)
-- Still exact-normalized-headline grouping — not clustering.
-- ---------------------------------------------------------------------------

create or replace view public.news_headline_groups
  with (security_invoker = true) as
select
  c.headline_kind,
  c.normalized_headline,
  (array_agg(c.headline order by c.created_at, c.id))[1] as sample_headline,
  count(*)::integer                         as candidate_count,
  count(distinct c.source_id)::integer      as source_count,
  min(c.discovered_at)                      as first_seen_at,
  max(c.discovered_at)                      as last_seen_at,
  -- Added in Phase 5:
  (array_agg(c.id order by c.created_at, c.id) filter (where c.headline_primary_id is null))[1] as root_candidate_id,
  mode() within group (order by c.sport)    as sport,
  array_agg(distinct c.sport)               as sports,
  count(distinct c.provider_id)::integer    as provider_count,
  min(c.published_at)                       as first_published_at,
  max(c.published_at)                       as last_published_at
from public.news_candidates c
group by c.headline_kind, c.normalized_headline;

revoke all on public.news_headline_groups from public, anon, authenticated;
grant select on public.news_headline_groups to service_role;

-- ---------------------------------------------------------------------------
-- news_candidate_feed — internal read model, freshest first.
--
-- Deliberately has NO plain `headline` column. Publisher titles surface as
-- publisher_headline; provider prose (Wikipedia Current Events sentences, CC BY-SA
-- text that must never be shown as a headline) surfaces only as discovery_text.
-- A consumer therefore cannot pick up discovery text as a publication headline by accident.
-- ---------------------------------------------------------------------------

create view public.news_candidate_feed
  with (security_invoker = true) as
select
  c.id                                              as candidate_id,
  c.status,
  c.headline_kind,
  case when c.headline_kind = 'publisher-title' then c.headline end as publisher_headline,
  case when c.headline_kind = 'discovery-text'  then c.headline end as discovery_text,
  c.normalized_headline,
  c.headline_primary_id,
  c.sport,
  c.league,
  c.classification_confidence,
  c.classification_signals,
  c.source_quality,
  c.language,
  c.query_profile,
  c.source_url,
  c.published_at,
  c.discovered_at,
  coalesce(c.published_at, c.discovered_at)         as fresh_at,
  p.provider_key,
  s.domain                                          as source_domain,
  s.display_name                                    as source_name,
  s.is_enabled                                      as source_enabled
from public.news_candidates c
join public.news_providers p on p.id = c.provider_id
join public.news_sources   s on s.id = c.source_id;

revoke all on public.news_candidate_feed from public, anon, authenticated;
grant select on public.news_candidate_feed to service_role;

-- Freshest-first paging needs an index on the expression the view sorts by.
create index news_candidates_fresh_at_idx
  on public.news_candidates ((coalesce(published_at, discovered_at)) desc, id);
