import { ingestBatch } from "@/lib/news/warehouse/candidates";
import { normalizedUrlKey } from "@/lib/news/warehouse/normalize";
import type { CandidateProvider } from "@/lib/news/providers/types";
import { runClustering, type ClusterRunOptions, type ClusterRunReport } from "@/lib/news/clustering/run";
import { fakeUnitProvider, makeCandidate, makeClient, openRun, pool } from "../warehouse/helpers";
import type { Sport } from "@/types/sport";

export const client = makeClient();
export const NOW = new Date("2026-09-20T12:00:00Z");
export const gkg = fakeUnitProvider({});

let clock = 0;
/** Strictly increasing default publication times (one minute apart), so processing order is deterministic. */
const nextTime = () => new Date(Date.UTC(2026, 8, 20, 4, 0) + ++clock * 60_000).toISOString();

export interface Spec {
  headline: string;
  domain: string;
  at?: string;
  sport?: Sport;
  path?: string;
  provider?: "gdelt-gkg" | "wikipedia-events";
}

/** Ingests synthetic candidates (one per spec) and returns their ids in spec order. */
export async function ingest(specs: Spec[], runProvider: CandidateProvider = gkg): Promise<string[]> {
  const runId = await openRun(client, runProvider);
  const candidates = specs.map((spec, i) =>
    makeCandidate({
      headline: spec.headline,
      url: `https://${spec.domain}/${spec.path ?? `story-${i}-${Math.random().toString(36).slice(2, 8)}`}`,
      publishedAt: spec.at ?? nextTime(),
      queryProfileSport: spec.sport ?? "baseball",
      provider: spec.provider ?? "gdelt-gkg",
    }),
  );
  await ingestBatch(client, { runId, candidates, rejected: [] });
  const { rows } = await pool.query("select id, normalized_source_url from news_candidates where normalized_source_url = any($1)", [candidates.map((c) => normalizedUrlKey(c.sourceUrl))]);
  const idByUrl = new Map(rows.map((r) => [r.normalized_source_url as string, r.id as string]));
  const ids = candidates.map((c) => idByUrl.get(normalizedUrlKey(c.sourceUrl))!);
  return ids;
}

export function cluster(options: ClusterRunOptions = {}): Promise<ClusterRunReport> {
  return runClustering(client, { window: "48h", now: NOW, trigger: "test", ...options });
}

export async function clusterOf(candidateId: string): Promise<string | null> {
  const { rows } = await pool.query("select cluster_id from story_cluster_members where candidate_id = $1", [candidateId]);
  return rows[0]?.cluster_id ?? null;
}

export async function liveClusters() {
  const { rows } = await pool.query("select * from story_clusters where merged_into_id is null order by created_at, id");
  return rows;
}
