import type { NewsCandidate } from "../candidates/types";
import type { RejectedCandidate } from "../filters/intake";
import type { WarehouseClient } from "./client";
import type { Json } from "./database.types";
import { normalizedUrlKey, toCandidatePayload, toRejectionPayload } from "./normalize";
import type { CandidateIngestionEventRow, CandidateRejectionRow, IngestMetrics, WarehouseCandidateRow } from "./types";

export interface IngestBatchInput {
  runId: string;
  /** Immutable provider unit (e.g. 'gdelt-gkg:20260920121500'); omit for providers without units. */
  unitKey?: string;
  candidates: NewsCandidate[];
  rejected: RejectedCandidate[];
}

function asCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`news_ingest_batch returned an unexpected "${field}"`);
  }
  return value;
}

/**
 * The single atomic write path. One call is one database transaction: the
 * (optional) unit claim, source upserts, candidate upserts, provenance rows
 * and rejections all commit together or not at all. Idempotent on the unit key
 * and on the normalized URL.
 */
export async function ingestBatch(client: WarehouseClient, input: IngestBatchInput): Promise<IngestMetrics> {
  const { data, error } = await client.rpc("news_ingest_batch", {
    p_run_id: input.runId,
    // Payload interfaces are plain JSON-serializable objects; the generated `Json` type just lacks an index signature for them.
    p_candidates: input.candidates.map(toCandidatePayload) as unknown as Json,
    p_rejections: input.rejected.map(toRejectionPayload) as unknown as Json,
    ...(input.unitKey ? { p_unit_key: input.unitKey } : {}),
  });
  if (error) throw new Error(`news_ingest_batch failed: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("news_ingest_batch returned no result");

  const result = data as Record<string, unknown>;
  return {
    unitSkipped: result.unit_skipped === true,
    candidatesReceived: asCount(result.candidates_received, "candidates_received"),
    inserted: asCount(result.inserted, "inserted"),
    existingUrl: asCount(result.existing_url, "existing_url"),
    existingProviderItem: asCount(result.existing_provider_item, "existing_provider_item"),
    duplicateHeadline: asCount(result.duplicate_headline, "duplicate_headline"),
    observationsCreated: asCount(result.observations_created, "observations_created"),
    sourcesCreated: asCount(result.sources_created, "sources_created"),
    rejectionsRecorded: asCount(result.rejections_recorded, "rejections_recorded"),
    rejectionsSeenAgain: asCount(result.rejections_seen_again, "rejections_seen_again"),
    disabledSourceRejected: asCount(result.disabled_source_rejected, "disabled_source_rejected"),
  };
}

export async function findCandidateByUrl(client: WarehouseClient, sourceUrl: string): Promise<WarehouseCandidateRow | null> {
  const { data, error } = await client
    .from("news_candidates")
    .select("*")
    .eq("normalized_source_url", normalizedUrlKey(sourceUrl))
    .maybeSingle();
  if (error) throw new Error(`findCandidateByUrl failed: ${error.message}`);
  return data;
}

export async function listCandidates(
  client: WarehouseClient,
  options: { sport?: string; limit?: number } = {},
): Promise<WarehouseCandidateRow[]> {
  let query = client.from("news_candidates").select("*").order("discovered_at", { ascending: false }).limit(options.limit ?? 50);
  if (options.sport) query = query.eq("sport", options.sport);
  const { data, error } = await query;
  if (error) throw new Error(`listCandidates failed: ${error.message}`);
  return data;
}

/** Every sighting of a candidate — which providers, runs and units have seen it. */
export async function getCandidateProvenance(client: WarehouseClient, candidateId: string): Promise<CandidateIngestionEventRow[]> {
  const { data, error } = await client
    .from("candidate_ingestion_events")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("observed_at", { ascending: true });
  if (error) throw new Error(`getCandidateProvenance failed: ${error.message}`);
  return data;
}

export async function listRejections(client: WarehouseClient, limit = 50): Promise<CandidateRejectionRow[]> {
  const { data, error } = await client.from("candidate_rejections").select("*").order("last_seen_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`listRejections failed: ${error.message}`);
  return data;
}

/** Exact-normalized-headline groups carried by more than one candidate: "N sources are reporting this". */
export async function listHeadlineGroups(client: WarehouseClient, limit = 20) {
  const { data, error } = await client
    .from("news_headline_groups")
    .select("*")
    .gt("candidate_count", 1)
    .order("source_count", { ascending: false })
    .order("candidate_count", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listHeadlineGroups failed: ${error.message}`);
  return data;
}
