import type { Database, Tables } from "./database.types";
import type { IntakeRejectReason } from "../filters/intake";

/**
 * Storage-layer types. These mirror database rows (snake_case, generated from
 * the migrations) and are deliberately separate from the domain `NewsCandidate`
 * (camelCase, provider-neutral): the two change for different reasons.
 */
export type { Database };
export type WarehouseCandidateRow = Tables<"news_candidates">;
export type WarehouseProviderRow = Tables<"news_providers">;
export type WarehouseSourceRow = Tables<"news_sources">;
export type IngestionRunRow = Tables<"ingestion_runs">;
export type CandidateIngestionEventRow = Tables<"candidate_ingestion_events">;
export type CandidateRejectionRow = Tables<"candidate_rejections">;

/** Rejection reasons the warehouse can store: intake reasons plus the DB-side source switch. */
export type WarehouseRejectionReason = IntakeRejectReason | "disabled-source";

export type IngestionRunStatus = IngestionRunRow["status"];
export type IngestionProviderState = NonNullable<IngestionRunRow["provider_state"]>;

/** JSON shape sent to `news_ingest_batch` for one candidate. Kept in sync with the SQL function's jsonb_to_recordset. */
export interface CandidatePayload {
  provider_item_id: string | null;
  headline: string;
  normalized_headline: string;
  headline_kind: "publisher-title" | "discovery-text";
  source_url: string;
  normalized_source_url: string;
  fingerprint: string;
  publisher_domain: string;
  publisher_name: string | null;
  source_quality: "known" | "unknown" | "low-quality";
  published_at: string | null;
  discovered_at: string;
  sport: string;
  league: string | null;
  classification_confidence: "high" | "medium" | "low" | "none";
  classification_signals: string[];
  provider_categories: string[] | null;
  query_profile: string | null;
  language: string | null;
  remote_image_ref: string | null;
}

export interface RejectionPayload {
  fingerprint: string;
  headline: string;
  source_url: string;
  publisher_domain: string;
  publisher_name: string | null;
  source_quality: "known" | "unknown" | "low-quality";
  sport: string | null;
  reasons: string[];
}

/** What one `news_ingest_batch` call did. */
export interface IngestMetrics {
  /** True when the immutable unit was already stored — nothing was written. */
  unitSkipped: boolean;
  candidatesReceived: number;
  /** New canonical candidate rows. */
  inserted: number;
  /** Candidate already stored under the same normalized URL. */
  existingUrl: number;
  /** Candidate already stored under the same (provider, provider item id) with a different URL. */
  existingProviderItem: number;
  /** Inserted candidates whose normalized headline already existed (kept, linked to the group root). */
  duplicateHeadline: number;
  /** New provenance rows. Repeat sightings of an existing candidate count here too. */
  observationsCreated: number;
  sourcesCreated: number;
  rejectionsRecorded: number;
  rejectionsSeenAgain: number;
  disabledSourceRejected: number;
}

export function emptyMetrics(): IngestMetrics {
  return {
    unitSkipped: false,
    candidatesReceived: 0,
    inserted: 0,
    existingUrl: 0,
    existingProviderItem: 0,
    duplicateHeadline: 0,
    observationsCreated: 0,
    sourcesCreated: 0,
    rejectionsRecorded: 0,
    rejectionsSeenAgain: 0,
    disabledSourceRejected: 0,
  };
}

export type WarehouseStats = {
  total_candidates: number;
  distinct_headlines: number;
  duplicate_headline_candidates: number;
  duplicate_headline_rate: number;
  new_in_recent_window: number;
  total_observations: number;
  sources: number;
  disabled_sources: number;
  by_sport: Record<string, number>;
  by_provider: Record<string, number>;
  by_source_quality: Record<string, number>;
  by_status: Record<string, number>;
  rejections_total: number;
  rejections_by_reason: Record<string, number>;
  top_headline_groups: { sample_headline: string; source_count: number; candidate_count: number }[];
  latest_run: {
    id: string;
    provider_key: string;
    status: string;
    provider_state: string | null;
    started_at: string;
    finished_at: string | null;
    records_returned: number;
    records_accepted: number;
    records_rejected: number;
    records_inserted: number;
    records_duplicate_url: number;
    records_duplicate_headline: number;
    units_processed: number;
    units_skipped: number;
  } | null;
  runs_by_status: Record<string, number>;
};
