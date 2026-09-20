import type { WarehouseClient } from "../warehouse/client";
import type { EventType, MatchConfidence } from "./config";
import { CONFIDENCE_RANK } from "./score";

/**
 * INTERNAL cluster read model — server-only, service role, not connected to any page or
 * public API. The future ranking/editorial phase reads clusters here.
 */
export type ClusterSort = "freshest" | "most-sources";

export interface ClusterQuery {
  sport?: string;
  eventType?: EventType;
  /** Minimum cluster confidence (medium includes high; low includes all). */
  minConfidence?: MatchConfidence;
  /** Only clusters with activity since this time (published, else discovered). */
  since?: Date;
  /** Distinct publisher domains. Default 1. */
  minSources?: number;
  sort?: ClusterSort;
  /** Default 25, capped at 200. */
  limit?: number;
  /** Load members/sources for each cluster. Default false. */
  includeMembers?: boolean;
}

export interface ClusterMember {
  candidateId: string;
  clusterId: string;
  headline: string;
  headlineKind: "publisher-title" | "discovery-text";
  url: string;
  sourceDomain: string;
  sourceName: string;
  provider: string;
  method: string;
  score: number;
  confidence: MatchConfidence;
  eventType: string | null;
  joinedAt: Date;
  publishedAt: Date | null;
  discoveredAt: Date;
}

export interface ClusterSource {
  domain: string;
  name: string;
  candidateCount: number;
}

export interface StoryClusterView {
  id: string;
  sport: string;
  league: string | null;
  eventType: string | null;
  status: string;
  confidence: MatchConfidence;
  /** The representative candidate's own publisher headline — never a rewrite, never discovery text. */
  canonicalHeadline: string | null;
  representative: { candidateId: string; url: string | null; sourceDomain: string | null; sourceName: string | null } | null;
  candidateCount: number;
  /** Distinct publisher domains. */
  sourceCount: number;
  /** Distinct discovery providers. */
  providerCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
  entities: string[];
  members?: ClusterMember[];
  sources?: ClusterSource[];
}

export const MAX_CLUSTER_LIMIT = 200;
const CONFIDENCE_AT_LEAST: Record<MatchConfidence, MatchConfidence[]> = {
  high: ["high"],
  medium: ["high", "medium"],
  low: ["high", "medium", "low"],
};

type FeedRow = {
  cluster_id: string | null;
  sport: string | null;
  league: string | null;
  event_type: string | null;
  status: string | null;
  confidence: string | null;
  canonical_headline: string | null;
  representative_candidate_id: string | null;
  representative_url: string | null;
  representative_domain: string | null;
  representative_source: string | null;
  candidate_count: number | null;
  source_count: number | null;
  provider_count: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  first_published_at: string | null;
  last_published_at: string | null;
  entities: string[] | null;
};

function toView(row: FeedRow): StoryClusterView {
  return {
    id: row.cluster_id as string,
    sport: row.sport as string,
    league: row.league,
    eventType: row.event_type,
    status: row.status as string,
    confidence: row.confidence as MatchConfidence,
    canonicalHeadline: row.canonical_headline,
    representative: row.representative_candidate_id
      ? { candidateId: row.representative_candidate_id, url: row.representative_url, sourceDomain: row.representative_domain, sourceName: row.representative_source }
      : null,
    candidateCount: row.candidate_count as number,
    sourceCount: row.source_count as number,
    providerCount: row.provider_count as number,
    firstSeenAt: new Date(row.first_seen_at as string),
    lastSeenAt: new Date(row.last_seen_at as string),
    firstPublishedAt: row.first_published_at ? new Date(row.first_published_at) : null,
    lastPublishedAt: row.last_published_at ? new Date(row.last_published_at) : null,
    entities: row.entities ?? [],
  };
}

export async function getClusterMembers(client: WarehouseClient, clusterIds: string[]): Promise<ClusterMember[]> {
  if (clusterIds.length === 0) return [];
  const { data, error } = await client
    .from("story_cluster_members")
    .select(
      "candidate_id, cluster_id, match_method, match_score, confidence, event_type, joined_at, news_candidates!inner(headline, headline_kind, source_url, published_at, discovered_at, news_sources(domain, display_name), news_providers(provider_key))",
    )
    .in("cluster_id", clusterIds)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(`getClusterMembers failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const c = row.news_candidates;
    return {
      candidateId: row.candidate_id,
      clusterId: row.cluster_id,
      headline: c.headline,
      headlineKind: c.headline_kind as ClusterMember["headlineKind"],
      url: c.source_url,
      sourceDomain: c.news_sources?.domain ?? "",
      sourceName: c.news_sources?.display_name ?? "",
      provider: c.news_providers?.provider_key ?? "",
      method: row.match_method,
      score: Number(row.match_score),
      confidence: row.confidence as MatchConfidence,
      eventType: row.event_type,
      joinedAt: new Date(row.joined_at),
      publishedAt: c.published_at ? new Date(c.published_at) : null,
      discoveredAt: new Date(c.discovered_at),
    };
  });
}

/** Distinct publisher domains with the number of candidates each contributed. */
export function summarizeSources(members: ClusterMember[]): ClusterSource[] {
  const byDomain = new Map<string, ClusterSource>();
  for (const m of members) {
    const entry = byDomain.get(m.sourceDomain) ?? { domain: m.sourceDomain, name: m.sourceName, candidateCount: 0 };
    entry.candidateCount += 1;
    byDomain.set(m.sourceDomain, entry);
  }
  return [...byDomain.values()].sort((a, b) => b.candidateCount - a.candidateCount || a.domain.localeCompare(b.domain));
}

async function attachMembers(client: WarehouseClient, clusters: StoryClusterView[]): Promise<StoryClusterView[]> {
  const members = await getClusterMembers(client, clusters.map((c) => c.id));
  const byCluster = new Map<string, ClusterMember[]>();
  for (const m of members) byCluster.set(m.clusterId, [...(byCluster.get(m.clusterId) ?? []), m]);
  return clusters.map((c) => {
    const list = byCluster.get(c.id) ?? [];
    return { ...c, members: list, sources: summarizeSources(list) };
  });
}

export async function listClusters(client: WarehouseClient, query: ClusterQuery = {}): Promise<StoryClusterView[]> {
  const limit = Math.min(Math.max(query.limit ?? 25, 1), MAX_CLUSTER_LIMIT);
  let request = client.from("story_cluster_feed").select("*").gte("source_count", query.minSources ?? 1).limit(limit);

  request =
    (query.sort ?? "freshest") === "most-sources"
      ? request.order("source_count", { ascending: false }).order("fresh_at", { ascending: false }).order("cluster_id", { ascending: true })
      : request.order("fresh_at", { ascending: false }).order("cluster_id", { ascending: true });

  if (query.sport) request = request.eq("sport", query.sport);
  if (query.eventType) request = request.eq("event_type", query.eventType);
  if (query.minConfidence) request = request.in("confidence", CONFIDENCE_AT_LEAST[query.minConfidence]);
  if (query.since) request = request.gte("fresh_at", query.since.toISOString());

  const { data, error } = await request;
  if (error) throw new Error(`listClusters failed: ${error.message}`);
  const clusters = (data ?? []).map((row) => toView(row as FeedRow));
  return query.includeMembers ? attachMembers(client, clusters) : clusters;
}

export async function getCluster(client: WarehouseClient, clusterId: string): Promise<StoryClusterView | null> {
  const { data, error } = await client.from("story_cluster_feed").select("*").eq("cluster_id", clusterId).maybeSingle();
  if (error) throw new Error(`getCluster failed: ${error.message}`);
  if (!data) return null;
  return (await attachMembers(client, [toView(data as FeedRow)]))[0];
}

// ---------------------------------------------------------------------------
// Needs-review (near-miss) queue
// ---------------------------------------------------------------------------

export interface ReviewItem {
  ambiguityId: number;
  candidateId: string;
  headline: string;
  currentClusterId: string;
  suggestedClusterId: string;
  suggestedHeadline: string | null;
  score: number;
  confidence: MatchConfidence;
  reason: string;
  matchedHeadline: string | null;
  createdAt: Date;
}

export async function listReviewQueue(client: WarehouseClient, limit = 50): Promise<ReviewItem[]> {
  const { data, error } = await client
    .from("story_cluster_review_queue")
    .select("*")
    .order("score", { ascending: false })
    .order("ambiguity_id", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), MAX_CLUSTER_LIMIT));
  if (error) throw new Error(`listReviewQueue failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const candidateIds = [...new Set(rows.map((r) => r.candidate_id as string))];
  const clusterIds = [...new Set(rows.map((r) => r.suggested_cluster_id as string))];
  const [{ data: cands, error: e1 }, { data: clusters, error: e2 }] = await Promise.all([
    client.from("news_candidates").select("id, headline").in("id", candidateIds),
    client.from("story_clusters").select("id, canonical_headline").in("id", clusterIds),
  ]);
  if (e1) throw new Error(`listReviewQueue failed: ${e1.message}`);
  if (e2) throw new Error(`listReviewQueue failed: ${e2.message}`);
  const headlineOf = new Map((cands ?? []).map((c) => [c.id, c.headline]));
  const clusterHeadline = new Map((clusters ?? []).map((c) => [c.id, c.canonical_headline]));

  return rows.map((r) => ({
    ambiguityId: r.ambiguity_id as number,
    candidateId: r.candidate_id as string,
    headline: headlineOf.get(r.candidate_id as string) ?? "",
    currentClusterId: r.current_cluster_id as string,
    suggestedClusterId: r.suggested_cluster_id as string,
    suggestedHeadline: clusterHeadline.get(r.suggested_cluster_id as string) ?? null,
    score: Number(r.score),
    confidence: r.confidence as MatchConfidence,
    reason: r.reason as string,
    matchedHeadline: ((r.evidence as { matched?: string } | null)?.matched as string | undefined) ?? null,
    createdAt: new Date(r.created_at as string),
  }));
}

// ---------------------------------------------------------------------------
// Manual operations (internal code/CLI only)
// ---------------------------------------------------------------------------

/** Folds cluster `from` into cluster `into`. Transactional; `from` is archived, never deleted. */
export async function mergeClusters(client: WarehouseClient, into: string, from: string, reason?: string): Promise<{ membersMoved: number }> {
  const { data, error } = await client.rpc("story_cluster_merge", { p_into: into, p_from: from, p_reason: reason ?? undefined });
  if (error) throw new Error(`story_cluster_merge failed: ${error.message}`);
  return { membersMoved: (data as { members_moved: number }).members_moved };
}

/** Moves one candidate to another cluster (the small "fix a false merge" operation). */
export async function moveMember(client: WarehouseClient, candidateId: string, toCluster: string): Promise<{ moved: boolean }> {
  const { data, error } = await client.rpc("story_cluster_move_member", { p_candidate_id: candidateId, p_to: toCluster });
  if (error) throw new Error(`story_cluster_move_member failed: ${error.message}`);
  return { moved: (data as { moved: boolean }).moved };
}

export { CONFIDENCE_RANK };
