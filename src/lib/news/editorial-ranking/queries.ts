import type { WarehouseClient } from "../warehouse/client";
import { DIVERSITY, OVERRIDE } from "./config";
import { deskForSport } from "./sections";
import { buildSlate, type Slate, type SlateItem, type SlateOptions } from "./slate";
import { orderSupportingSources, toStoryPreview, type StoryPreview, type SupportingSource } from "./story-mapping";
import type { DeskId, EditorialStatus, EligibilityReason, Eligibility, OverrideKind, ScorePart, Urgency } from "./types";

export interface EditorialItemView {
  id: string;
  clusterId: string;
  status: EditorialStatus;
  /** Verbatim representative publisher headline, or null when not publication-safe. */
  headline: string | null;
  dek: null;
  sport: string;
  league: string | null;
  eventType: string | null;
  urgency: Urgency;
  score: number;
  priority: number;
  rankPosition: number | null;
  section: DeskId | null;
  sectionEligibility: { lead: boolean; wire: boolean; now: boolean; desk: boolean; notes: string[] };
  eligibility: Eligibility;
  eligibilityReasons: EligibilityReason[];
  scoreParts: ScorePart[];
  activeOverrides: { id: number; kind: OverrideKind; amount: number | null; text: string | null; reason: string | null }[];
  clusterConfidence: string | null;
  candidateCount: number;
  sourceCount: number;
  providerCount: number;
  entities: string[];
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
  lastSeenAt: Date | null;
  imageStatus: string;
  rankingRunId: string | null;
  algorithmVersion: string | null;
  lastRankedAt: Date | null;
}

type Row = Record<string, unknown> & { id: string; cluster_id: string };
const date = (value: unknown) => (value ? new Date(value as string) : null);

function toView(row: Row): EditorialItemView {
  const r = row as never as Record<string, never>;
  const se = (r.section_eligibility ?? {}) as { lead?: boolean; wire?: boolean; now?: boolean; desk?: boolean; notes?: string[] };
  return {
    id: row.id,
    clusterId: row.cluster_id,
    status: r.status as EditorialStatus,
    headline: (r.headline as string | null) ?? null,
    dek: null,
    sport: r.sport as string,
    league: (r.league as string | null) ?? null,
    eventType: (r.event_type as string | null) ?? null,
    urgency: r.urgency as Urgency,
    score: Number(r.editorial_score),
    priority: Number(r.editorial_priority),
    rankPosition: (r.rank_position as number | null) ?? null,
    section: (r.section as DeskId | null) ?? null,
    sectionEligibility: { lead: se.lead === true, wire: se.wire === true, now: se.now === true, desk: se.desk === true, notes: se.notes ?? [] },
    eligibility: r.eligibility as Eligibility,
    eligibilityReasons: (r.eligibility_reasons as EligibilityReason[]) ?? [],
    scoreParts: (r.score_parts as ScorePart[]) ?? [],
    activeOverrides: (r.active_overrides as EditorialItemView["activeOverrides"]) ?? [],
    clusterConfidence: (r.cluster_confidence as string | null) ?? null,
    candidateCount: Number(r.candidate_count),
    sourceCount: Number(r.source_count),
    providerCount: Number(r.provider_count),
    entities: (r.entities as string[]) ?? [],
    firstPublishedAt: date(r.first_published_at),
    lastPublishedAt: date(r.last_published_at),
    lastSeenAt: date(r.last_seen_at),
    imageStatus: r.image_status as string,
    rankingRunId: (r.ranking_run_id as string | null) ?? null,
    algorithmVersion: (r.algorithm_version as string | null) ?? null,
    lastRankedAt: date(r.last_ranked_at),
  };
}

export interface ItemQuery {
  status?: EditorialStatus[];
  eligibility?: Eligibility[];
  sport?: string;
  /** Only items ranked in the latest run (rank_position not null). */
  rankedOnly?: boolean;
  limit?: number;
}

/** Internal editorial read model, best-ranked first. Server-only; not exposed anywhere public. */
export async function listItems(client: WarehouseClient, query: ItemQuery = {}): Promise<EditorialItemView[]> {
  let request = client
    .from("editorial_items")
    .select("*")
    .order("rank_position", { ascending: true, nullsFirst: false })
    .order("editorial_score", { ascending: false })
    .limit(Math.min(Math.max(query.limit ?? 100, 1), 1000));
  if (query.status?.length) request = request.in("status", query.status);
  if (query.eligibility?.length) request = request.in("eligibility", query.eligibility);
  if (query.sport) request = request.eq("sport", query.sport);
  if (query.rankedOnly) request = request.not("rank_position", "is", null);
  const { data, error } = await request;
  if (error) throw new Error(`listItems failed: ${error.message}`);
  return (data ?? []).map((row) => toView(row as Row));
}

/** Accepts an editorial item id or a cluster id. */
export async function getItem(client: WarehouseClient, idOrClusterId: string): Promise<EditorialItemView | null> {
  const byId = await client.from("editorial_items").select("*").eq("id", idOrClusterId).maybeSingle();
  if (byId.error) throw new Error(`getItem failed: ${byId.error.message}`);
  if (byId.data) return toView(byId.data as Row);
  const byCluster = await client.from("editorial_items").select("*").eq("cluster_id", idOrClusterId).maybeSingle();
  if (byCluster.error) throw new Error(`getItem failed: ${byCluster.error.message}`);
  return byCluster.data ? toView(byCluster.data as Row) : null;
}

export function toSlateItem(view: EditorialItemView): SlateItem {
  const forced = view.activeOverrides.find((o) => o.kind === "force_section");
  return {
    itemId: view.id,
    clusterId: view.clusterId,
    headline: view.headline,
    score: view.score,
    urgency: view.urgency,
    sport: view.sport,
    desk: view.section ?? deskForSport(view.sport),
    eventType: view.eventType,
    sourceCount: view.sourceCount,
    eligibility: view.eligibility,
    status: view.status,
    lead: view.sectionEligibility.lead,
    wire: view.sectionEligibility.wire,
    now: view.sectionEligibility.now,
    deskOk: view.sectionEligibility.desk,
    entityKeys: view.entities.filter((e) => e.startsWith("team:") || e.startsWith("name:")),
    latestAt: view.lastPublishedAt,
    teams: view.entities.filter((e) => e.startsWith("team:")).map((e) => e.slice(5)),
    forcedSection: forced?.text ?? null,
    pinned: view.activeOverrides.some((o) => o.kind === "pin"),
  };
}

/** The internal front-page slate from the latest ranking run. No fixtures; no public exposure. */
export async function getSlate(client: WarehouseClient, options: SlateOptions = {}): Promise<{ slate: Slate; items: Map<string, EditorialItemView> }> {
  const items = await listItems(client, { rankedOnly: true, limit: 1000 });
  const slate = buildSlate(items.map(toSlateItem), options);
  return { slate, items: new Map(items.map((i) => [i.clusterId, i])) };
}

/** The "N sources reporting" panel: representative first, one entry per publisher domain. Metadata only — no bodies or snippets. */
export async function getSupportingSources(client: WarehouseClient, view: Pick<EditorialItemView, "clusterId">): Promise<SupportingSource[]> {
  const { data: cluster, error: clusterError } = await client.from("story_clusters").select("representative_candidate_id").eq("id", view.clusterId).maybeSingle();
  if (clusterError) throw new Error(`getSupportingSources failed: ${clusterError.message}`);
  const representativeId = cluster?.representative_candidate_id ?? null;

  const { data, error } = await client
    .from("story_cluster_members")
    .select("candidate_id, news_candidates!inner(headline, headline_kind, source_url, published_at, discovered_at, news_sources(domain, display_name, quality_bucket, is_enabled))")
    .eq("cluster_id", view.clusterId);
  if (error) throw new Error(`getSupportingSources failed: ${error.message}`);

  const byDomain = new Map<string, SupportingSource>();
  for (const row of data ?? []) {
    const c = row.news_candidates;
    const domain = c.news_sources?.domain ?? "";
    if (!domain || c.news_sources?.is_enabled === false) continue;
    const source: SupportingSource = {
      publisher: c.news_sources?.display_name ?? domain,
      domain,
      url: c.source_url,
      publishedAt: c.published_at ? new Date(c.published_at) : c.discovered_at ? new Date(c.discovered_at) : null,
      headline: c.headline_kind === "publisher-title" ? c.headline : null,
      isRepresentative: row.candidate_id === representativeId,
      quality: (c.news_sources?.quality_bucket ?? "unknown") as SupportingSource["quality"],
    };
    const current = byDomain.get(domain);
    // One entry per publisher: the representative's row wins its domain, otherwise the earliest report.
    if (!current || source.isRepresentative || (!current.isRepresentative && (source.publishedAt?.getTime() ?? Infinity) < (current.publishedAt?.getTime() ?? Infinity))) byDomain.set(domain, source);
  }
  return orderSupportingSources([...byDomain.values()]);
}

export async function getStoryPreview(client: WarehouseClient, view: EditorialItemView): Promise<StoryPreview | null> {
  const sources = await getSupportingSources(client, view);
  return toStoryPreview(
    { id: view.id, clusterId: view.clusterId, headline: view.headline, status: view.status, sport: view.sport, league: view.league, eventType: view.eventType, urgency: view.urgency, sourceCount: view.sourceCount, firstPublishedAt: view.firstPublishedAt, lastPublishedAt: view.lastPublishedAt, eligibility: view.eligibility, eligibilityReasons: view.eligibilityReasons },
    sources,
  );
}

// ---------------------------------------------------------------------------
// Editor mutations — atomic and audited in SQL (editorial_events)
// ---------------------------------------------------------------------------

export async function setStatus(client: WarehouseClient, itemId: string, status: Exclude<EditorialStatus, "published">, reason?: string, actor = "cli"): Promise<{ changed: boolean }> {
  const { data, error } = await client.rpc("editorial_set_status", { p_item: itemId, p_status: status, p_reason: reason ?? undefined, p_actor: actor });
  if (error) throw new Error(error.message.replace(/^editorial_set_status: /, ""));
  return { changed: (data as { changed: boolean }).changed };
}

export interface SetOverrideInput {
  kind: OverrideKind;
  amount?: number;
  text?: string;
  reason?: string;
  actor?: string;
}

export async function setOverride(client: WarehouseClient, itemId: string, input: SetOverrideInput): Promise<number> {
  if (input.kind === "boost" && !(input.amount && input.amount > 0 && input.amount <= OVERRIDE.boostMax)) throw new Error(`boost amount must be between 1 and ${OVERRIDE.boostMax}`);
  if (input.kind === "suppress" && input.amount !== undefined && !(input.amount > 0 && input.amount <= 1000)) throw new Error("suppress amount must be between 1 and 1000");
  const { data, error } = await client.rpc("editorial_set_override", {
    p_item: itemId,
    p_kind: input.kind,
    p_amount: input.kind === "suppress" ? input.amount ?? OVERRIDE.suppressDefault : input.amount ?? undefined,
    p_text: input.text ?? undefined,
    p_reason: input.reason ?? undefined,
    p_actor: input.actor ?? "cli",
  });
  if (error) throw new Error(error.message.replace(/^editorial_set_override: /, ""));
  return Number(data);
}

/** Removes the active override of `kind` (or every active override when kind is omitted). Soft-delete; history is kept. */
export async function removeOverride(client: WarehouseClient, itemId: string, kind?: OverrideKind, reason?: string, actor = "cli"): Promise<number> {
  const { data, error } = await client.rpc("editorial_remove_override", { p_item: itemId, p_kind: (kind ?? null) as never, p_reason: reason ?? undefined, p_actor: actor });
  if (error) throw new Error(error.message);
  return Number(data);
}

export interface AuditEntry {
  at: Date;
  action: string;
  actor: string;
  reason: string | null;
  detail: Record<string, unknown>;
}

export async function getAudit(client: WarehouseClient, itemId: string): Promise<AuditEntry[]> {
  const { data, error } = await client.from("editorial_events").select("*").eq("editorial_item_id", itemId).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error(`getAudit failed: ${error.message}`);
  return (data ?? []).map((row) => ({ at: new Date(row.created_at), action: row.action, actor: row.actor, reason: row.reason, detail: (row.detail ?? {}) as Record<string, unknown> }));
}

export { DIVERSITY };
