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
        "news_ingestion_units", "news_providers", "news_sources",
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

  it("do not schedule anything (no pg_cron / cron jobs in this phase)", () => {
    expect(stripped).not.toMatch(/cron\.schedule|create extension[^;]*pg_cron/i);
  });
});
