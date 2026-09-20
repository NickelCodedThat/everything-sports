import type { WarehouseClient } from "./client";

/**
 * INTERNAL fresh-candidate query for the future publication pipeline — not a
 * public API and not connected to any page. Reads the `news_candidate_feed`
 * view (service role only).
 *
 * Safety by construction: the view has no plain `headline` column. A publisher's
 * title arrives as `publisherHeadline`; provider prose such as a Wikipedia
 * Current Events sentence arrives only as `discoveryText`. Discovery text is
 * also excluded from results unless the caller asks for it.
 */
export type CandidateConfidence = "high" | "medium" | "low";
export type CandidateSourceQuality = "known" | "unknown" | "low-quality";

export interface FeedQuery {
  sport?: string;
  /** Provider keys, e.g. ["gdelt-gkg"]. */
  providers?: string[];
  sourceQuality?: CandidateSourceQuality[];
  /** Minimum classification confidence (medium includes high; low includes all three, never 'none'). */
  minConfidence?: CandidateConfidence;
  publishedSince?: Date;
  publishedUntil?: Date;
  discoveredSince?: Date;
  discoveredUntil?: Date;
  /** Defaults to ['new','accepted'] — headline-group roots, not their duplicates. */
  statuses?: ("new" | "accepted" | "rejected" | "duplicate" | "clustered" | "promoted")[];
  /** Include provider prose that must never be shown as a headline. Default false. */
  includeDiscoveryText?: boolean;
  /** Include candidates from sources disabled in the database. Default false. */
  includeDisabledSources?: boolean;
  /** Default 50, capped at 500. */
  limit?: number;
}

export interface FeedItem {
  candidateId: string;
  status: string;
  headlineKind: "publisher-title" | "discovery-text";
  /** A publisher's own title — the only text that may ever become a publication headline. Null for discovery text. */
  publisherHeadline: string | null;
  /** Provider prose (internal diagnostic only). Null for publisher titles. */
  discoveryText: string | null;
  normalizedHeadline: string;
  headlineGroupRootId: string | null;
  sport: string;
  league: string | null;
  confidence: string;
  signals: string[];
  sourceQuality: string;
  source: { domain: string; name: string; enabled: boolean };
  provider: string;
  url: string;
  language: string | null;
  publishedAt: Date | null;
  discoveredAt: Date;
  /** published_at when the provider supplied one, otherwise discovered_at — the sort key. */
  freshAt: Date;
}

const CONFIDENCE_AT_LEAST: Record<CandidateConfidence, string[]> = {
  high: ["high"],
  medium: ["high", "medium"],
  low: ["high", "medium", "low"],
};

export const MAX_FEED_LIMIT = 500;

/** The only accessor that should turn a feed item into publishable headline text. */
export function getPublishableHeadline(item: Pick<FeedItem, "headlineKind" | "publisherHeadline">): string | null {
  return item.headlineKind === "publisher-title" ? item.publisherHeadline : null;
}

export async function listFreshCandidates(client: WarehouseClient, query: FeedQuery = {}): Promise<FeedItem[]> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), MAX_FEED_LIMIT);

  let request = client
    .from("news_candidate_feed")
    .select("*")
    .in("status", query.statuses ?? ["new", "accepted"])
    .order("fresh_at", { ascending: false })
    .order("candidate_id", { ascending: false })
    .limit(limit);

  if (!query.includeDiscoveryText) request = request.eq("headline_kind", "publisher-title");
  if (!query.includeDisabledSources) request = request.eq("source_enabled", true);
  if (query.sport) request = request.eq("sport", query.sport);
  if (query.providers?.length) request = request.in("provider_key", query.providers);
  if (query.sourceQuality?.length) request = request.in("source_quality", query.sourceQuality);
  if (query.minConfidence) request = request.in("classification_confidence", CONFIDENCE_AT_LEAST[query.minConfidence]);
  if (query.publishedSince) request = request.gte("published_at", query.publishedSince.toISOString());
  if (query.publishedUntil) request = request.lte("published_at", query.publishedUntil.toISOString());
  if (query.discoveredSince) request = request.gte("discovered_at", query.discoveredSince.toISOString());
  if (query.discoveredUntil) request = request.lte("discovered_at", query.discoveredUntil.toISOString());

  const { data, error } = await request;
  if (error) throw new Error(`listFreshCandidates failed: ${error.message}`);

  return data.map((row) => ({
    candidateId: row.candidate_id as string,
    status: row.status as string,
    headlineKind: row.headline_kind as FeedItem["headlineKind"],
    publisherHeadline: row.publisher_headline,
    discoveryText: row.discovery_text,
    normalizedHeadline: row.normalized_headline as string,
    headlineGroupRootId: row.headline_primary_id,
    sport: row.sport as string,
    league: row.league,
    confidence: row.classification_confidence as string,
    signals: Array.isArray(row.classification_signals) ? (row.classification_signals as string[]) : [],
    sourceQuality: row.source_quality as string,
    source: { domain: row.source_domain as string, name: row.source_name as string, enabled: row.source_enabled === true },
    provider: row.provider_key as string,
    url: row.source_url as string,
    language: row.language,
    publishedAt: row.published_at ? new Date(row.published_at) : null,
    discoveredAt: new Date(row.discovered_at as string),
    freshAt: new Date(row.fresh_at as string),
  }));
}

/** One exact-normalized-headline group — the clean input a clustering phase starts from. */
export interface HeadlineGroupInput {
  headlineKind: "publisher-title" | "discovery-text";
  normalizedHeadline: string;
  sampleHeadline: string;
  sourceCount: number;
  candidateCount: number;
  providerCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
  /** Most common sport classification among the group's candidates. */
  sport: string;
  sports: string[];
  rootCandidateId: string | null;
}

export interface HeadlineGroupQuery {
  /** Defaults to publisher titles only — discovery text is not a headline. */
  headlineKind?: "publisher-title" | "discovery-text";
  sport?: string;
  minSources?: number;
  seenSince?: Date;
  limit?: number;
}

export async function listHeadlineGroupInputs(client: WarehouseClient, query: HeadlineGroupQuery = {}): Promise<HeadlineGroupInput[]> {
  let request = client
    .from("news_headline_groups")
    .select("*")
    .eq("headline_kind", query.headlineKind ?? "publisher-title")
    .gte("source_count", query.minSources ?? 1)
    .order("last_seen_at", { ascending: false })
    .limit(Math.min(Math.max(query.limit ?? 100, 1), MAX_FEED_LIMIT));
  if (query.sport) request = request.eq("sport", query.sport);
  if (query.seenSince) request = request.gte("last_seen_at", query.seenSince.toISOString());

  const { data, error } = await request;
  if (error) throw new Error(`listHeadlineGroupInputs failed: ${error.message}`);

  return data.map((row) => ({
    headlineKind: row.headline_kind as HeadlineGroupInput["headlineKind"],
    normalizedHeadline: row.normalized_headline as string,
    sampleHeadline: row.sample_headline as string,
    sourceCount: row.source_count as number,
    candidateCount: row.candidate_count as number,
    providerCount: row.provider_count as number,
    firstSeenAt: new Date(row.first_seen_at as string),
    lastSeenAt: new Date(row.last_seen_at as string),
    firstPublishedAt: row.first_published_at ? new Date(row.first_published_at) : null,
    lastPublishedAt: row.last_published_at ? new Date(row.last_published_at) : null,
    sport: row.sport as string,
    sports: (row.sports as string[]) ?? [],
    rootCandidateId: row.root_candidate_id,
  }));
}
