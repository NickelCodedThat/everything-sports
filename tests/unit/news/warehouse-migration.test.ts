import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTAKE_REJECT_REASONS } from "@/lib/news/filters/intake";

/**
 * Static checks over the version-controlled migrations — they run in the normal
 * unit suite (no database needed) and guard the security posture and the dedupe
 * keys. The live-database counterparts are in tests/integration/warehouse.
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
const sql = files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");
const stripped = sql.replace(/--.*$/gm, "");

const TABLES = [...stripped.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

describe("warehouse migrations", () => {
  it("are version-controlled with sortable timestamped names", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it("create the expected warehouse tables", () => {
    expect(TABLES.sort()).toEqual(
      [
        "candidate_ingestion_events", "candidate_rejections", "ingestion_runs", "news_candidates",
        "news_ingestion_units", "news_providers", "news_sources", "newsroom_locks",
        "clustering_runs", "story_cluster_ambiguities", "story_cluster_members", "story_cluster_merges", "story_clusters",
      ].sort(),
    );
  });

  it("enable RLS on every table and define no policies (no anonymous/authenticated access)", () => {
    for (const table of TABLES) {
      expect(stripped).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`));
      expect(stripped).toMatch(new RegExp(`revoke all on public\\.${table}\\s+from public, anon, authenticated`));
    }
    expect(stripped).not.toMatch(/create policy/i);
  });

  it("never grant anything to anon/authenticated/public — only service_role", () => {
    const grants = [...stripped.matchAll(/grant [^;]+ to ([^;]+);/gi)].map((m) => m[1].trim());
    expect(grants.length).toBeGreaterThan(0);
    for (const target of grants) expect(target).toBe("service_role");
  });

  it("restrict every function to service_role", () => {
    for (const fn of ["news_ingest_batch", "news_warehouse_stats"]) {
      expect(stripped).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
      expect(stripped).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
    }
  });

  it("make headline-group and other views run with the caller's privileges", () => {
    expect(stripped).toMatch(/create view public\.news_headline_groups\s+with \(security_invoker = true\)/);
  });

  it("enforce the dedupe keys with unique constraints/indexes", () => {
    expect(stripped).toMatch(/normalized_source_url\s+text not null unique/);
    expect(stripped).toMatch(/unit_key\s+text not null unique/);
    expect(stripped).toMatch(/create unique index news_candidates_provider_item_uidx[\s\S]*?\(provider_id, provider_item_id\)[\s\S]*?where provider_item_id is not null/);
    expect(stripped).toMatch(/create unique index news_candidates_headline_root_uidx[\s\S]*?\(headline_kind, normalized_headline\)[\s\S]*?where headline_primary_id is null/);
    expect(stripped).toMatch(/unique \(candidate_id, ingestion_run_id, unit_key\)/);
    expect(stripped).toMatch(/unique \(provider_id, fingerprint\)/);
    expect(stripped).toMatch(/domain\s+text not null unique/);
  });

  it("use ON CONFLICT rather than select-then-insert as the write path", () => {
    expect(stripped).toMatch(/on conflict do nothing[\s\S]*returning id into v_candidate_id/);
    expect(stripped).toMatch(/on conflict \(unit_key\) do nothing/);
    expect(stripped).toMatch(/on conflict \(candidate_id, ingestion_run_id, unit_key\) do nothing/);
  });

  it("constrain status-like columns instead of leaving free text", () => {
    expect(stripped).toMatch(/status\s+text not null default 'new' check \(status in \('new', 'accepted', 'rejected', 'duplicate', 'clustered', 'promoted'\)\)/);
    expect(stripped).toMatch(/status\s+text not null default 'running' check \(status in \('running', 'succeeded', 'partial', 'failed'\)\)/);
    expect(stripped).toMatch(/quality_bucket text not null default 'unknown' check \(quality_bucket in \('known', 'unknown', 'low-quality'\)\)/);
  });

  it("list every intake rejection reason (plus disabled-source) in the rejections check constraint", () => {
    for (const reason of INTAKE_REJECT_REASONS) expect(stripped).toContain(`'${reason}'`);
    expect(stripped).toContain("'disabled-source'");
  });

  it("index the workloads the brief names", () => {
    for (const fragment of [
      "(published_at desc nulls last)", "(discovered_at desc)", "(sport, published_at desc nulls last)",
      "news_candidates (provider_id)", "news_candidates (source_id)", "news_candidates (status)",
      "(normalized_headline)", "(fingerprint)",
    ]) {
      expect(stripped).toContain(fragment);
    }
  });

  it("store no article body, HTML or image bytes", () => {
    const candidates = stripped.match(/create table public\.news_candidates \(([\s\S]*?)\n\);/)?.[1] ?? "";
    expect(candidates).not.toMatch(/\b(body|content|html|article_text|image_data)\b/);
    expect(candidates).toMatch(/remote_image_ref\s+text/);
  });

  it("schedule only in the dedicated schedule migration (Phase 5); the warehouse schema itself has no cron", () => {
    const warehouse = readFileSync(join(MIGRATIONS_DIR, files[0]), "utf8").replace(/--.*$/gm, "");
    expect(warehouse).not.toMatch(/cron\.schedule|pg_cron/i);
  });
});

describe("newsroom engine migrations (Phase 5)", () => {
  const engine = readFileSync(join(MIGRATIONS_DIR, "20260920120000_newsroom_engine.sql"), "utf8").replace(/--.*$/gm, "");
  const schedule = readFileSync(join(MIGRATIONS_DIR, "20260920120100_newsroom_schedule.sql"), "utf8");
  const scheduleCode = schedule.replace(/--.*$/gm, "");

  it("protect the lock table like every other warehouse table", () => {
    expect(engine).toMatch(/alter table public\.newsroom_locks enable row level security/);
    expect(engine).toMatch(/revoke all on public\.newsroom_locks from public, anon, authenticated/);
    expect(engine).toMatch(/lock_key\s+text primary key/);
  });

  it("make lock acquisition atomic: one INSERT ... ON CONFLICT DO UPDATE ... WHERE expired", () => {
    expect(engine).toMatch(/on conflict \(lock_key\) do update[\s\S]*where public\.newsroom_locks\.expires_at <= now\(\)/);
  });

  it("restrict every new function to service_role", () => {
    for (const fn of ["newsroom_try_acquire_lock", "newsroom_release_lock", "news_reap_stale_runs"]) {
      expect(engine).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
      expect(engine).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
    }
  });

  it("reap stale runs by updating (never deleting) with an explicit reason", () => {
    expect(engine).not.toMatch(/delete from public\.ingestion_runs/);
    expect(engine).toContain("'stale-run-reaped'");
    expect(engine).toMatch(/finished_at = now\(\)/);
  });

  it("expose the internal feed without a plain headline column, so discovery text cannot pass as a headline", () => {
    const feed = engine.match(/create view public\.news_candidate_feed[\s\S]*?from public\.news_candidates c/)?.[0] ?? "";
    expect(feed).toMatch(/security_invoker = true/);
    expect(feed).toMatch(/publisher_headline/);
    expect(feed).toMatch(/discovery_text/);
    expect(feed).not.toMatch(/c\.headline\s*,/);
    expect(engine).toMatch(/revoke all on public\.news_candidate_feed from public, anon, authenticated/);
  });

  it("evolve the headline-group view by adding columns (root, sport, sports)", () => {
    expect(engine).toMatch(/create or replace view public\.news_headline_groups/);
    for (const column of ["root_candidate_id", "as sport", "as sports", "provider_count"]) expect(engine).toContain(column);
  });

  it("schedule with NO secret and NO environment-specific URL in the migration", () => {
    expect(scheduleCode).not.toMatch(/https?:\/\//i);
    expect(scheduleCode).not.toMatch(/Bearer [A-Za-z0-9]{8,}/);
    expect(scheduleCode).not.toMatch(/sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{10,}/);
    // secrets come from Vault at call time
    expect(scheduleCode).toContain("'newsroom_worker_url'");
    expect(scheduleCode).toContain("'newsroom_cron_secret'");
    expect(scheduleCode).toMatch(/vault\.decrypted_secrets/);
  });

  it("make the worker call a safe no-op until Vault is configured, and asynchronous via pg_net", () => {
    expect(scheduleCode).toMatch(/return null;/);
    expect(scheduleCode).toMatch(/net\.http_post/);
    expect(scheduleCode).toMatch(/timeout_milliseconds := 55000/);
  });

  it("install idempotent jobs by name, guarded on pg_cron being available", () => {
    expect(scheduleCode).toMatch(/if exists \(select 1 from pg_extension where extname = 'pg_cron'\)/);
    for (const name of ["newsroom-gkg-ingest", "newsroom-wikipedia-ingest", "newsroom-newsdata-ingest", "newsroom-reap-stale-runs", "newsroom-cron-history-cleanup"]) {
      expect(scheduleCode).toContain(`cron.schedule('${name}'`);
    }
  });

  it("keep cron history cleanup modest (7 days) and never touch warehouse data", () => {
    expect(scheduleCode).toMatch(/delete from cron\.job_run_details where end_time < now\(\) - interval '7 days'/);
    expect(scheduleCode).not.toMatch(/delete from public\.news_/);
  });

  it("restrict the worker/status functions to service_role", () => {
    for (const fn of ["newsroom_invoke_worker", "newsroom_scheduler_status"]) {
      expect(scheduleCode).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    }
  });

  it("do not let the database download or parse GDELT files", () => {
    expect(scheduleCode).not.toMatch(/gdeltproject|\.gkg\.csv|unzip/i);
  });
});

describe("story clustering migration (Phase 6)", () => {
  const clustering = readFileSync(join(MIGRATIONS_DIR, "20260920140000_story_clustering.sql"), "utf8").replace(/--.*$/gm, "");

  it("enables pg_trgm in the extensions schema and indexes only publisher titles with GIN", () => {
    expect(clustering).toMatch(/create extension if not exists pg_trgm with schema extensions/);
    expect(clustering).toMatch(/create index news_candidates_headline_trgm_idx\s+on public\.news_candidates using gin \(normalized_headline extensions\.gin_trgm_ops\)\s+where headline_kind = 'publisher-title'/);
  });

  it("enforces one cluster per candidate with the primary key, not application code", () => {
    expect(clustering).toMatch(/create table public\.story_cluster_members \(\s+candidate_id\s+uuid primary key references public\.news_candidates \(id\) on delete cascade/);
  });

  it("restricts every clustering function to service_role", () => {
    for (const fn of ["news_cluster_neighbors", "news_cluster_assign", "story_cluster_recompute", "story_cluster_merge", "story_cluster_move_member", "story_cluster_age_out", "news_reap_stale_clustering_runs"]) {
      expect(clustering).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
      expect(clustering).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
    }
  });

  it("serializes writers of one exact headline with an advisory transaction lock", () => {
    expect(clustering).toMatch(/pg_advisory_xact_lock\(hashtextextended\('story-cluster:'/);
  });

  it("makes the internal views security_invoker and never grants them to clients", () => {
    for (const view of ["news_unclustered_candidates", "story_cluster_feed", "story_cluster_review_queue"]) {
      expect(clustering).toMatch(new RegExp(`create view public\\.${view}\\s+with \\(security_invoker = true\\)`));
    }
  });

  it("never lets a cluster point at itself or form a merge chain by construction", () => {
    expect(clustering).toMatch(/check \(merged_into_id is null or \(status = 'closed' and merged_into_id <> id\)\)/);
    expect(clustering).toMatch(/would form a chain\/cycle/);
  });
});
