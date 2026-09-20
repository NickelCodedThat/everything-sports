-- Approval belongs to the reviewed headline. A changed headline requires review again.
-- Held/rejected items must be released and reranked before approval, even with stale scores.

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
        status = case when status = 'approved' and headline is distinct from i.headline then 'review' else status end,
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
    if nullif(btrim(v_item.headline), '') is null then
      raise exception 'editorial_set_status: cannot approve an item without a publication-safe publisher headline';
    end if;
    if v_item.eligibility = 'ineligible' or v_item.status in ('held', 'rejected') then
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
