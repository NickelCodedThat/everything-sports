-- Deployment template — NOT a migration (Supabase only applies supabase/migrations).
-- Run once per environment in the Supabase SQL editor (or `supabase db query`), after
-- replacing the two placeholders. NEVER commit real values.
--
--   1. Generate the shared secret and set the SAME value as NEWSROOM_CRON_SECRET on the
--      worker host (e.g. `openssl rand -hex 32`). Do not reuse the Supabase secret key.
--   2. Point the URL at the deployed worker route.

select vault.create_secret(
  'https://YOUR-HOST.example/api/internal/newsroom/tick',
  'newsroom_worker_url',
  'Worker endpoint invoked by Supabase Cron'
);

select vault.create_secret(
  'REPLACE_WITH_RANDOM_SECRET',
  'newsroom_cron_secret',
  'Bearer secret the worker expects (must equal NEWSROOM_CRON_SECRET on the host)'
);

-- ---------------------------------------------------------------------------
-- ROTATION:
--   The worker compares one secret, so rotate in one motion: set the new NEWSROOM_CRON_SECRET
--   on the worker host, then immediately run:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'newsroom_cron_secret'),
--     'NEW_RANDOM_SECRET'
--   );
--
--   A tick that lands between the two steps gets 401; the next slot retries it (ingestion is
--   idempotent and each GKG window overlaps the previous one).
--
-- CHANGING THE URL:
--   select vault.update_secret((select id from vault.secrets where name = 'newsroom_worker_url'), 'https://NEW-HOST/...');
--
-- PAUSING SCHEDULING without touching migrations:
--   select cron.alter_job((select jobid from cron.job where jobname = 'newsroom-gkg-ingest'), active := false);
-- ---------------------------------------------------------------------------
