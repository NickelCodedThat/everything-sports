-- Phase 5 — Scheduling (Supabase Cron = pg_cron, calling the worker through pg_net)
--
-- This migration is portable and contains NO secrets and NO environment-specific URL.
-- The worker URL and the shared secret live in Supabase Vault (names below) and are read
-- at call time by newsroom_invoke_worker(). Until both exist the function is a logged
-- no-op, so applying this migration to a fresh/local project is always safe.
--
--   Vault secret name           holds
--   newsroom_worker_url         https://<your-host>/api/internal/newsroom/tick
--   newsroom_cron_secret        the value of NEWSROOM_CRON_SECRET on the worker host
--
-- Setup / rotation SQL: supabase/templates/newsroom-vault-secrets.template.sql
-- The database only *triggers* work. It never downloads or parses GDELT files.

do $ext$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end
$ext$;

-- Reads the two Vault secrets and fires an asynchronous HTTP POST at the worker.
-- pg_net queues the request and returns immediately, so a slow ingestion never holds a
-- cron job open (Supabase recommends short cron jobs). Returns the pg_net request id, or
-- null when scheduling is not configured yet.
create or replace function public.newsroom_invoke_worker(p_provider text default null)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url    text;
  v_secret text;
  v_id     bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    raise warning 'newsroom_invoke_worker: vault/pg_net unavailable — scheduling not active';
    return null;
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'newsroom_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'newsroom_cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'newsroom_invoke_worker: Vault secrets newsroom_worker_url / newsroom_cron_secret are not set — skipping';
    return null;
  end if;

  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    into v_id
    using v_url,
          jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_secret),
          jsonb_build_object('provider', p_provider, 'trigger', 'scheduled');
  return v_id;
end;
$$;

revoke all on function public.newsroom_invoke_worker(text) from public, anon, authenticated;
grant execute on function public.newsroom_invoke_worker(text) to service_role;

-- Booleans and job names only — never a secret or a URL.
create or replace function public.newsroom_scheduler_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cron     boolean := exists (select 1 from pg_extension where extname = 'pg_cron');
  v_net      boolean := exists (select 1 from pg_extension where extname = 'pg_net');
  v_url_set  boolean := false;
  v_key_set  boolean := false;
  v_jobs     jsonb := '[]'::jsonb;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select exists (select 1 from vault.decrypted_secrets where name = ''newsroom_worker_url'')' into v_url_set;
    execute 'select exists (select 1 from vault.decrypted_secrets where name = ''newsroom_cron_secret'')' into v_key_set;
  end if;
  if v_cron and to_regclass('cron.job') is not null then
    execute $q$select coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active) order by jobname), '[]'::jsonb)
               from cron.job where jobname like 'newsroom-%'$q$ into v_jobs;
  end if;
  return jsonb_build_object(
    'pg_cron_installed', v_cron,
    'pg_net_installed', v_net,
    'worker_configured', v_url_set and v_key_set,
    'jobs', v_jobs
  );
end;
$$;

revoke all on function public.newsroom_scheduler_status() from public, anon, authenticated;
grant execute on function public.newsroom_scheduler_status() to service_role;

-- The jobs. cron.schedule() upserts by job name, so re-applying is idempotent.
--   GKG: 15-minute files; run 2 minutes past each quarter hour so the new file has usually
--        been published (the worker still tolerates it not being there yet).
--   Wikipedia Current Events: day-curated, low volume — hourly.
--   NewsData: free tier is ~12h delayed — every 6 hours; a no-op until NEWSDATA_API_KEY exists.
--   Reaper: pure SQL, so recovery works even when the worker host is down.
--   GDELT DOC API is deliberately NOT scheduled (throttled; manual/opportunistic only).
do $jobs$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('newsroom-gkg-ingest', '2-59/15 * * * *', $cmd$select public.newsroom_invoke_worker('gdelt-gkg')$cmd$);
    perform cron.schedule('newsroom-wikipedia-ingest', '7 * * * *', $cmd$select public.newsroom_invoke_worker('wikipedia-events')$cmd$);
    perform cron.schedule('newsroom-newsdata-ingest', '23 */6 * * *', $cmd$select public.newsroom_invoke_worker('newsdata')$cmd$);
    perform cron.schedule('newsroom-reap-stale-runs', '*/10 * * * *', $cmd$select public.news_reap_stale_runs(interval '30 minutes')$cmd$);
    -- cron.job_run_details grows forever; keep a week.
    perform cron.schedule('newsroom-cron-history-cleanup', '17 3 * * *', $cmd$delete from cron.job_run_details where end_time < now() - interval '7 days'$cmd$);
  end if;
end
$jobs$;
