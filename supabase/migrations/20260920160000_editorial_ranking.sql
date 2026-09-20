-- Phase 7 — Editorial Ranking + Internal Publication Pipeline
--
-- One editorial_item per story_cluster: the durable, internal record an editor works from.
-- Ranking (src/lib/news/editorial-ranking, pure and unit-tested) decides eligibility, score,
-- urgency and desk; this schema stores the latest result, the manual editor state (status,
-- overrides) and an audit trail of every ranking run and every editor mutation.
--
-- Nothing here is public: same security posture as Phases 4-6 (RLS on, no policies, everything
-- revoked from public/anon/authenticated, service_role only). "approved" means READY FOR FUTURE
-- PUBLICATION — nothing in this phase publishes anything.

-- ---------------------------------------------------------------------------
-- editorial_ranking_runs — audit trail (kept apart from ingestion_runs / clustering_runs)
-- ---------------------------------------------------------------------------

create table public.editorial_ranking_runs (
  id                    uuid primary key default gen_random_uuid(),
  trigger               text not null default 'manual' check (trigger in ('manual', 'scheduled', 'test')),
  algorithm_version     text not null,
  window_label          text,
  sport_filter          text,
  status                text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  clusters_considered   integer not null default 0 check (clusters_considered >= 0),
  eligible_count        integer not null default 0 check (eligible_count >= 0),
  review_count          integer not null default 0 check (review_count >= 0),
  held_count            integer not null default 0 check (held_count >= 0),
  items_created         integer not null default 0 check (items_created >= 0),
  items_updated         integer not null default 0 check (items_updated >= 0),
  error_message         text,
  metadata              jsonb not null default '{}'::jsonb,
  check (finished_at is null or finished_at >= started_at)
);

create index editorial_ranking_runs_started_idx on public.editorial_ranking_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- editorial_items — one per story cluster (cluster_id UNIQUE)
-- ---------------------------------------------------------------------------

create table public.editorial_items (
  id                          uuid primary key default gen_random_uuid(),
  cluster_id                  uuid not null unique references public.story_clusters (id),
  -- Editor-owned lifecycle. Ranking only sets it on insert; it never moves an item afterwards.
  -- 'published' is reserved for the future public-read phase and cannot be set in Phase 7.
  status                      text not null default 'candidate' check (status in ('candidate', 'review', 'approved', 'held', 'rejected', 'published')),
  -- Verbatim publisher headline of the representative candidate, or null when not publication-safe.
  -- Never an LLM rewrite, never discovery text.
  headline                    text,
  -- Reserved: original Everything Sports summary, written later. Always null in Phase 7.
  dek                         text,
  sport                       text not null check (sport in ('basketball', 'football', 'baseball', 'boxing', 'mma', 'soccer', 'hockey', 'tennis', 'golf', 'motorsports', 'olympics', 'other', 'unknown')),
  league                      text,
  event_type                  text,
  urgency                     text not null default 'normal' check (urgency in ('normal', 'developing', 'breaking-candidate')),
  editorial_score             numeric(9,2) not null default 0,
  -- 1 (top) .. 4, a coarse band of the score for at-a-glance triage.
  editorial_priority          smallint not null default 4 check (editorial_priority between 1 and 4),
  -- 1-based rank among eligible items in the latest ranking run; null when not ranked.
  rank_position               integer check (rank_position is null or rank_position >= 1),
  -- Native desk: run | huddle | diamond | fight-desk | world-game | across-the-board.
  section                     text,
  -- { lead: bool, wire: bool, now: bool } — which cross-sport placements the item qualifies for.
  section_eligibility         jsonb not null default '{}'::jsonb,
  eligibility                 text not null default 'eligible' check (eligibility in ('eligible', 'review', 'ineligible')),
  -- [{code, severity, detail}] — every hold/review reason; nothing is dropped silently.
  eligibility_reasons         jsonb not null default '[]'::jsonb check (jsonb_typeof(eligibility_reasons) = 'array'),
  -- [{key, label, points, detail}] — the full "why is this ranked here" breakdown; sums to editorial_score.
  score_parts                 jsonb not null default '[]'::jsonb check (jsonb_typeof(score_parts) = 'array'),
  -- Snapshot of the active manual overrides that were applied to this score.
  active_overrides            jsonb not null default '[]'::jsonb,
  representative_candidate_id uuid references public.news_candidates (id) on delete set null,
  cluster_confidence          text check (cluster_confidence is null or cluster_confidence in ('high', 'medium', 'low')),
  candidate_count             integer not null default 0,
  source_count                integer not null default 0,
  provider_count              integer not null default 0,
  entities                    text[] not null default '{}',
  first_seen_at               timestamptz,
  last_seen_at                timestamptz,
  first_published_at          timestamptz,
  last_published_at           timestamptz,
  -- Licensed photography is a later phase: nothing is ever hotlinked or copied.
  image_status                text not null default 'missing' check (image_status in ('missing', 'pending', 'licensed')),
  ranking_run_id              uuid references public.editorial_ranking_runs (id) on delete set null,
  algorithm_version           text,
  last_ranked_at              timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index editorial_items_rank_idx on public.editorial_items (rank_position) where rank_position is not null;
create index editorial_items_status_idx on public.editorial_items (status);
create index editorial_items_section_idx on public.editorial_items (section, editorial_score desc);
create index editorial_items_run_idx on public.editorial_items (ranking_run_id);

create trigger editorial_items_set_updated_at
  before update on public.editorial_items
  for each row execute function public.news_set_updated_at();

-- ---------------------------------------------------------------------------
-- editorial_overrides — durable, removable manual priority controls
--   pin            sort first (still subject to eligibility)
--   boost          + amount
--   suppress       − amount (default 80)
--   force_section  place in a specific slate section (only when the item qualifies for it)
--   force_priority replace the algorithmic score with `amount`
-- Removal is soft (removed_at) so the history survives. One ACTIVE override per (item, kind).
-- Overrides change priority/placement only: they are applied AFTER eligibility, so they can
-- never make an ineligible item (discovery text, low confidence, closed cluster) publishable.
-- ---------------------------------------------------------------------------

create table public.editorial_overrides (
  id                bigint generated always as identity primary key,
  editorial_item_id uuid not null references public.editorial_items (id) on delete cascade,
  kind              text not null check (kind in ('pin', 'boost', 'suppress', 'force_section', 'force_priority')),
  amount            numeric(8,2) check (amount is null or (amount >= 0 and amount <= 1000)),
  text_value        text,
  reason            text,
  created_by        text not null default 'cli',
  created_at        timestamptz not null default now(),
  removed_at        timestamptz,
  removed_by        text,
  removed_reason    text,
  check (kind <> 'force_section' or text_value is not null),
  check (kind not in ('boost', 'force_priority') or amount is not null),
  check (removed_at is null or removed_at >= created_at)
);

create unique index editorial_overrides_active_uidx
  on public.editorial_overrides (editorial_item_id, kind)
  where removed_at is null;
create index editorial_overrides_item_idx on public.editorial_overrides (editorial_item_id, created_at desc);

-- ---------------------------------------------------------------------------
-- editorial_events — audit of every editor mutation (status changes, override add/remove)
-- ---------------------------------------------------------------------------

create table public.editorial_events (
  id                bigint generated always as identity primary key,
  editorial_item_id uuid not null references public.editorial_items (id) on delete cascade,
  action            text not null,
  detail            jsonb not null default '{}'::jsonb,
  reason            text,
  actor             text not null default 'cli',
  created_at        timestamptz not null default now()
);

create index editorial_events_item_idx on public.editorial_events (editorial_item_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, no policies, no client privileges.
-- ---------------------------------------------------------------------------

alter table public.editorial_ranking_runs enable row level security;
alter table public.editorial_items        enable row level security;
alter table public.editorial_overrides    enable row level security;
alter table public.editorial_events       enable row level security;

revoke all on public.editorial_ranking_runs from public, anon, authenticated;
revoke all on public.editorial_items        from public, anon, authenticated;
revoke all on public.editorial_overrides    from public, anon, authenticated;
revoke all on public.editorial_events       from public, anon, authenticated;

revoke all on sequence public.editorial_overrides_id_seq from public, anon, authenticated;
revoke all on sequence public.editorial_events_id_seq    from public, anon, authenticated;

grant select, insert, update, delete on public.editorial_ranking_runs to service_role;
grant select, insert, update, delete on public.editorial_items        to service_role;
grant select, insert, update, delete on public.editorial_overrides    to service_role;
grant select, insert, update, delete on public.editorial_events       to service_role;

grant usage, select on sequence public.editorial_overrides_id_seq to service_role;
grant usage, select on sequence public.editorial_events_id_seq    to service_role;

-- ---------------------------------------------------------------------------
-- editorial_upsert_items — idempotent write of one ranking run's results.
--
-- One cluster = one item (cluster_id UNIQUE, ON CONFLICT DO UPDATE): running the same rank
-- twice updates scores and never duplicates. `status` is editor-owned: it is only written on
-- insert. If an APPROVED item's headline changes because the cluster's representative changed,
-- that is recorded in editorial_events so an approval is never silently altered.
-- ---------------------------------------------------------------------------

create or replace function public.editorial_upsert_items(p_run_id uuid, p_items jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_created integer := 0;
  v_updated integer := 0;
  v_existing record;
  v_id uuid;
  i record;
begin
  if not exists (select 1 from public.editorial_ranking_runs where id = p_run_id) then
    raise exception 'editorial_upsert_items: unknown ranking run %', p_run_id using errcode = 'foreign_key_violation';
  end if;

  for i in
    select * from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
      cluster_id uuid, initial_status text, headline text, sport text, league text, event_type text,
      urgency text, editorial_score numeric, editorial_priority smallint, rank_position integer,
      section text, section_eligibility jsonb, eligibility text, eligibility_reasons jsonb,
      score_parts jsonb, active_overrides jsonb, representative_candidate_id uuid,
      cluster_confidence text, candidate_count integer, source_count integer, provider_count integer,
      entities jsonb, first_seen_at timestamptz, last_seen_at timestamptz,
      first_published_at timestamptz, last_published_at timestamptz, algorithm_version text
    )
    order by x.cluster_id
  loop
    select id, status, headline into v_existing from public.editorial_items where cluster_id = i.cluster_id;

    if not found then
      insert into public.editorial_items (
        cluster_id, status, headline, sport, league, event_type, urgency, editorial_score, editorial_priority,
        rank_position, section, section_eligibility, eligibility, eligibility_reasons, score_parts,
        active_overrides, representative_candidate_id, cluster_confidence, candidate_count, source_count,
        provider_count, entities, first_seen_at, last_seen_at, first_published_at, last_published_at,
        ranking_run_id, algorithm_version, last_ranked_at
      )
      values (
        i.cluster_id, coalesce(i.initial_status, 'candidate'), i.headline, i.sport, i.league, i.event_type, i.urgency,
        i.editorial_score, i.editorial_priority, i.rank_position, i.section, coalesce(i.section_eligibility, '{}'::jsonb),
        i.eligibility, coalesce(i.eligibility_reasons, '[]'::jsonb), coalesce(i.score_parts, '[]'::jsonb),
        coalesce(i.active_overrides, '[]'::jsonb), i.representative_candidate_id, i.cluster_confidence,
        coalesce(i.candidate_count, 0), coalesce(i.source_count, 0), coalesce(i.provider_count, 0),
        coalesce(array(select jsonb_array_elements_text(coalesce(i.entities, '[]'::jsonb))), '{}'),
        i.first_seen_at, i.last_seen_at, i.first_published_at, i.last_published_at,
        p_run_id, i.algorithm_version, now()
      );
      v_created := v_created + 1;
    else
      update public.editorial_items set
        headline = i.headline, sport = i.sport, league = i.league, event_type = i.event_type, urgency = i.urgency,
        editorial_score = i.editorial_score, editorial_priority = i.editorial_priority, rank_position = i.rank_position,
        section = i.section, section_eligibility = coalesce(i.section_eligibility, '{}'::jsonb),
        eligibility = i.eligibility, eligibility_reasons = coalesce(i.eligibility_reasons, '[]'::jsonb),
        score_parts = coalesce(i.score_parts, '[]'::jsonb), active_overrides = coalesce(i.active_overrides, '[]'::jsonb),
        representative_candidate_id = i.representative_candidate_id, cluster_confidence = i.cluster_confidence,
        candidate_count = coalesce(i.candidate_count, 0), source_count = coalesce(i.source_count, 0),
        provider_count = coalesce(i.provider_count, 0),
        entities = coalesce(array(select jsonb_array_elements_text(coalesce(i.entities, '[]'::jsonb))), '{}'),
        first_seen_at = i.first_seen_at, last_seen_at = i.last_seen_at,
        first_published_at = i.first_published_at, last_published_at = i.last_published_at,
        ranking_run_id = p_run_id, algorithm_version = i.algorithm_version, last_ranked_at = now()
      where id = v_existing.id;
      v_updated := v_updated + 1;

      if v_existing.status = 'approved' and v_existing.headline is distinct from i.headline then
        insert into public.editorial_events (editorial_item_id, action, detail, actor)
        values (v_existing.id, 'approved-headline-changed',
                jsonb_build_object('before', v_existing.headline, 'after', i.headline), 'ranking');
      end if;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

revoke all on function public.editorial_upsert_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.editorial_upsert_items(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- editorial_finish_rank — housekeeping after a run:
--   * items not ranked in THIS run lose their rank_position (they fell out of the window)
--   * items whose cluster was merged away are closed out and can no longer be ranked
-- ---------------------------------------------------------------------------

create or replace function public.editorial_finish_rank(p_run_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_unranked integer;
  v_closed integer;
begin
  update public.editorial_items
  set rank_position = null
  where rank_position is not null and ranking_run_id is distinct from p_run_id;
  get diagnostics v_unranked = row_count;

  update public.editorial_items i
  set eligibility = 'ineligible',
      rank_position = null,
      eligibility_reasons = jsonb_build_array(jsonb_build_object('code', 'closed-cluster', 'severity', 'ineligible', 'detail', 'cluster was merged into another cluster'))
  from public.story_clusters c
  where c.id = i.cluster_id and c.merged_into_id is not null and i.eligibility <> 'ineligible';
  get diagnostics v_closed = row_count;

  return jsonb_build_object('unranked', v_unranked, 'closed_merged', v_closed);
end;
$$;

revoke all on function public.editorial_finish_rank(uuid) from public, anon, authenticated;
grant execute on function public.editorial_finish_rank(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Editor mutations — each one atomic and audited in editorial_events.
-- ---------------------------------------------------------------------------

create or replace function public.editorial_set_status(p_item uuid, p_status text, p_reason text default null, p_actor text default 'cli')
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item public.editorial_items%rowtype;
begin
  if p_status not in ('candidate', 'review', 'approved', 'held', 'rejected') then
    raise exception 'editorial_set_status: status % cannot be set (published is reserved for a future phase)', p_status;
  end if;

  select * into v_item from public.editorial_items where id = p_item for update;
  if not found then
    raise exception 'editorial_set_status: unknown editorial item %', p_item;
  end if;

  -- Approval means "ready for future publication": it must be publication-safe and eligible.
  -- An editor can change priority, but cannot approve past a legal/safety hold.
  if p_status = 'approved' then
    if v_item.headline is null then
      raise exception 'editorial_set_status: cannot approve an item without a publication-safe publisher headline';
    end if;
    if v_item.eligibility = 'ineligible' then
      raise exception 'editorial_set_status: cannot approve an ineligible item (%)', v_item.eligibility_reasons;
    end if;
  end if;

  if v_item.status = p_status then
    return jsonb_build_object('changed', false, 'status', p_status);
  end if;

  update public.editorial_items set status = p_status where id = p_item;
  insert into public.editorial_events (editorial_item_id, action, detail, reason, actor)
  values (p_item, 'status', jsonb_build_object('from', v_item.status, 'to', p_status), p_reason, coalesce(p_actor, 'cli'));

  return jsonb_build_object('changed', true, 'from', v_item.status, 'status', p_status);
end;
$$;

create or replace function public.editorial_set_override(
  p_item uuid, p_kind text, p_amount numeric default null, p_text text default null,
  p_reason text default null, p_actor text default 'cli'
)
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_prev bigint;
begin
  perform 1 from public.editorial_items where id = p_item for update;
  if not found then
    raise exception 'editorial_set_override: unknown editorial item %', p_item;
  end if;

  -- Replacing an active override of the same kind keeps history: the old one is closed as superseded.
  update public.editorial_overrides
  set removed_at = now(), removed_by = coalesce(p_actor, 'cli'), removed_reason = 'superseded'
  where editorial_item_id = p_item and kind = p_kind and removed_at is null
  returning id into v_prev;

  insert into public.editorial_overrides (editorial_item_id, kind, amount, text_value, reason, created_by)
  values (p_item, p_kind, p_amount, p_text, p_reason, coalesce(p_actor, 'cli'))
  returning id into v_id;

  insert into public.editorial_events (editorial_item_id, action, detail, reason, actor)
  values (p_item, 'override-set',
          jsonb_build_object('override_id', v_id, 'kind', p_kind, 'amount', p_amount, 'text', p_text, 'supersedes', v_prev),
          p_reason, coalesce(p_actor, 'cli'));
  return v_id;
end;
$$;

create or replace function public.editorial_remove_override(p_item uuid, p_kind text, p_reason text default null, p_actor text default 'cli')
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ids bigint[];
begin
  with removed as (
    update public.editorial_overrides
    set removed_at = now(), removed_by = coalesce(p_actor, 'cli'), removed_reason = coalesce(p_reason, 'removed')
    where editorial_item_id = p_item and removed_at is null and (p_kind is null or kind = p_kind)
    returning id, kind
  )
  select coalesce(array_agg(id), '{}') into v_ids from removed;

  if cardinality(v_ids) > 0 then
    insert into public.editorial_events (editorial_item_id, action, detail, reason, actor)
    values (p_item, 'override-removed', jsonb_build_object('override_ids', to_jsonb(v_ids), 'kind', p_kind), p_reason, coalesce(p_actor, 'cli'));
  end if;
  return cardinality(v_ids);
end;
$$;

revoke all on function public.editorial_set_status(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.editorial_set_override(uuid, text, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.editorial_remove_override(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.editorial_set_status(uuid, text, text, text) to service_role;
grant execute on function public.editorial_set_override(uuid, text, numeric, text, text, text) to service_role;
grant execute on function public.editorial_remove_override(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Stale ranking-run reaper (close, never delete) + its cron job.
-- ---------------------------------------------------------------------------

create or replace function public.news_reap_stale_ranking_runs(p_stale_after interval default interval '30 minutes')
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  with reaped as (
    update public.editorial_ranking_runs
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

revoke all on function public.news_reap_stale_ranking_runs(interval) from public, anon, authenticated;
grant execute on function public.news_reap_stale_ranking_runs(interval) to service_role;

do $jobs$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('newsroom-reap-stale-ranking-runs', '*/10 * * * *', $cmd$select public.news_reap_stale_ranking_runs(interval '30 minutes')$cmd$);
  end if;
end
$jobs$;
