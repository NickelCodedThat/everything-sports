import { Pool } from "pg";
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { buildCandidate, type RawCandidateInput } from "@/lib/news/normalization/build-candidate";
import type { NewsCandidate } from "@/lib/news/candidates/types";
import type { CandidateProvider } from "@/lib/news/providers/types";
import { createWarehouseClient, type WarehouseClient } from "@/lib/news/warehouse/client";
import { startRun } from "@/lib/news/warehouse/ingestion-runs";
import { syncProvider } from "@/lib/news/warehouse/providers";

loadDotEnvFiles();

export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const pool = new Pool({ connectionString: DB_URL, max: 4 });

export function makeClient(): WarehouseClient {
  return createWarehouseClient();
}

/** Wipes every warehouse table so each test starts from an empty database. */
export async function resetWarehouse(): Promise<void> {
  await pool.query(
    `truncate table candidate_ingestion_events, candidate_rejections, news_ingestion_units,
       news_candidates, ingestion_runs, news_sources, news_providers, newsroom_locks, clustering_runs, editorial_ranking_runs restart identity cascade`,
  );
}

export async function scalar<T = number>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await pool.query(sql, params);
  return Object.values(rows[0])[0] as T;
}

/** Synthetic candidate — every headline/URL used in tests is invented for the scenario it covers. */
export function makeCandidate(
  overrides: Partial<RawCandidateInput> & { headline?: string; url?: string } = {},
): NewsCandidate {
  const n = Math.random().toString(36).slice(2, 8);
  const candidate = buildCandidate({
    provider: "gdelt-gkg",
    headline: overrides.headline ?? `Harbor City Herons rally past Lakeview Owls in extra innings ${n}`,
    sourceUrl: overrides.url ?? `https://www.example-news-${n}.com/mlb/story-${n}`,
    queryProfileSport: "baseball",
    publishedAt: "2026-09-20T04:45:00Z",
    language: "English",
    ...overrides,
  });
  if (!candidate) throw new Error("test candidate rejected by buildCandidate");
  return candidate;
}

/** A provider whose immutable units are served from a map. `null` = unit not published yet; an Error is thrown. */
export function fakeUnitProvider(
  units: Record<string, NewsCandidate[] | null | Error>,
  id: CandidateProvider["id"] = "gdelt-gkg",
): CandidateProvider {
  return {
    id,
    displayName: `fake ${id}`,
    requiresApiKey: false,
    expectedFreshness: "near-realtime",
    async fetchCandidates() {
      return { providerId: id, candidates: [], status: "ok", durationMs: 0 };
    },
    units: {
      async list() {
        return Object.keys(units);
      },
      async fetch(key) {
        const value = units[key];
        if (value instanceof Error) throw value;
        return value ?? null;
      },
    },
  };
}

export function fakeFeedProvider(
  id: CandidateProvider["id"],
  result: { status: "ok" | "unavailable" | "throttled" | "error"; candidates?: NewsCandidate[]; message?: string },
): CandidateProvider {
  return {
    id,
    displayName: `fake ${id}`,
    requiresApiKey: false,
    expectedFreshness: "unknown",
    async fetchCandidates() {
      return { providerId: id, candidates: result.candidates ?? [], status: result.status, message: result.message, durationMs: 0 };
    },
  };
}

/** Registers the provider and opens a run, returning the run id for direct ingestBatch calls. */
export async function openRun(client: WarehouseClient, provider: CandidateProvider): Promise<string> {
  const row = await syncProvider(client, provider);
  const run = await startRun(client, { providerId: row.id, trigger: "test" });
  return run.id;
}

const VAULT_NAMES = ["newsroom_worker_url", "newsroom_cron_secret"];

/**
 * Runs `fn` with exactly the given newsroom Vault secrets (or none), then restores whatever a
 * developer had configured locally — so tests never depend on, or clobber, local scheduling setup.
 */
export async function withVaultSecrets<T>(secrets: { url?: string; secret?: string }, fn: () => Promise<T>): Promise<T> {
  const saved = (await pool.query("select name, decrypted_secret from vault.decrypted_secrets where name = any($1)", [VAULT_NAMES])).rows as {
    name: string;
    decrypted_secret: string;
  }[];
  const wipe = () => pool.query("delete from vault.secrets where name = any($1)", [VAULT_NAMES]);
  await wipe();
  if (secrets.url) await pool.query("select vault.create_secret($1, 'newsroom_worker_url')", [secrets.url]);
  if (secrets.secret) await pool.query("select vault.create_secret($1, 'newsroom_cron_secret')", [secrets.secret]);
  try {
    return await fn();
  } finally {
    await wipe();
    for (const row of saved) await pool.query("select vault.create_secret($1, $2)", [row.decrypted_secret, row.name]);
  }
}
