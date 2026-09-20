import "server-only";
import type { WarehouseClient } from "../warehouse/client";
import type { EventType, MatchConfidence } from "../clustering/config";
import type {
  ClusterInput,
  EditorialStatus,
  MemberInput,
  NearMissInput,
  OverrideInput,
  OverrideKind,
  SourceQuality,
} from "./types";

import { readPages } from "./paging";

const CHUNK = 40;

export interface LoadClustersOptions {
  /** Only clusters with activity (newest published, else last seen) since this time. */
  since: Date;
  sport?: string;
  limit?: number;
}

/** Loads live clusters with their members, sources and unresolved near misses — pure input for the ranker. */
export async function loadClusterInputs(
  client: WarehouseClient,
  options: LoadClustersOptions,
): Promise<ClusterInput[]> {
  let query = client
    .from("story_cluster_feed")
    .select("*")
    .gte("fresh_at", options.since.toISOString())
    .order("fresh_at", { ascending: false })
    .order("cluster_id");
  if (options.sport) query = query.eq("sport", options.sport);
  const clusters = await readPages(
    (from, to) => query.range(from, to),
    "loading clusters",
    options.limit ?? 2000,
  );
  if (clusters.length === 0) return [];

  const ids = clusters.map((c) => c.cluster_id as string);
  const membersByCluster = new Map<string, MemberInput[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const data = await readPages(
      (from, to) =>
        client
          .from("story_cluster_members")
          .select(
            "cluster_id, candidate_id, news_candidates!inner(headline, headline_kind, source_url, published_at, discovered_at, news_sources(domain, display_name, quality_bucket, is_enabled), news_providers(provider_key))",
          )
          .in("cluster_id", ids.slice(i, i + CHUNK))
          .order("candidate_id")
          .range(from, to),
      "loading cluster members",
    );
    for (const row of data ?? []) {
      const c = row.news_candidates;
      const published = c.published_at ? new Date(c.published_at) : null;
      const member: MemberInput = {
        candidateId: row.candidate_id,
        headline: c.headline,
        headlineKind: c.headline_kind as MemberInput["headlineKind"],
        url: c.source_url,
        domain: c.news_sources?.domain ?? "",
        sourceName: c.news_sources?.display_name ?? "",
        quality: (c.news_sources?.quality_bucket ?? "unknown") as SourceQuality,
        sourceEnabled: c.news_sources?.is_enabled ?? true,
        providerKey: c.news_providers?.provider_key ?? "",
        reportedAt: published ?? new Date(c.discovered_at),
        publishedAt: published,
      };
      const list = membersByCluster.get(row.cluster_id) ?? [];
      list.push(member);
      membersByCluster.set(row.cluster_id, list);
    }
  }

  const queue = await readPages(
    (from, to) =>
      client
        .from("story_cluster_review_queue")
        .select(
          "ambiguity_id, current_cluster_id, suggested_cluster_id, reason, confidence",
        )
        .order("ambiguity_id")
        .range(from, to),
    "loading near misses",
  );
  const nearByCluster = new Map<string, NearMissInput[]>();
  for (const row of queue ?? []) {
    for (const id of [row.current_cluster_id, row.suggested_cluster_id]) {
      if (!id) continue;
      const list = nearByCluster.get(id) ?? [];
      list.push({
        reason: row.reason as string,
        confidence: row.confidence as MatchConfidence,
      });
      nearByCluster.set(id, list);
    }
  }

  return clusters.map((c) => ({
    clusterId: c.cluster_id as string,
    sport: c.sport as string,
    league: c.league,
    eventType: (c.event_type as EventType | null) ?? null,
    status: c.status as string,
    confidence: c.confidence as MatchConfidence,
    canonicalHeadline: c.canonical_headline,
    representativeCandidateId: c.representative_candidate_id,
    candidateCount: c.candidate_count as number,
    sourceCount: c.source_count as number,
    providerCount: c.provider_count as number,
    firstSeenAt: new Date(c.first_seen_at as string),
    lastSeenAt: new Date(c.last_seen_at as string),
    firstPublishedAt: c.first_published_at
      ? new Date(c.first_published_at)
      : null,
    lastPublishedAt: c.last_published_at ? new Date(c.last_published_at) : null,
    entities: (c.entities as string[] | null) ?? [],
    members: membersByCluster.get(c.cluster_id as string) ?? [],
    nearMisses: nearByCluster.get(c.cluster_id as string) ?? [],
  }));
}

export interface EditorialState {
  overridesByCluster: Map<string, OverrideInput[]>;
  statusByCluster: Map<string, EditorialStatus>;
}

/** Active (non-removed) overrides and existing editor-owned statuses, keyed by cluster. */
export async function loadEditorialState(
  client: WarehouseClient,
): Promise<EditorialState> {
  const items = await readPages(
    (from, to) =>
      client
        .from("editorial_items")
        .select("id, cluster_id, status")
        .order("id")
        .range(from, to),
    "loading editorial items",
  );
  const clusterByItem = new Map((items ?? []).map((i) => [i.id, i.cluster_id]));
  const statusByCluster = new Map(
    (items ?? []).map((i) => [i.cluster_id, i.status as EditorialStatus]),
  );

  const overrides = await readPages(
    (from, to) =>
      client
        .from("editorial_overrides")
        .select("*")
        .is("removed_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    "loading overrides",
  );
  const overridesByCluster = new Map<string, OverrideInput[]>();
  for (const o of overrides ?? []) {
    const clusterId = clusterByItem.get(o.editorial_item_id);
    if (!clusterId) continue;
    const list = overridesByCluster.get(clusterId) ?? [];
    list.push({
      id: o.id,
      kind: o.kind as OverrideKind,
      amount: o.amount === null ? null : Number(o.amount),
      text: o.text_value,
      reason: o.reason,
      createdAt: new Date(o.created_at),
    });
    overridesByCluster.set(clusterId, list);
  }
  return { overridesByCluster, statusByCluster };
}
