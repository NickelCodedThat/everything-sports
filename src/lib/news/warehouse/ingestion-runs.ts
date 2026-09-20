import type { WarehouseClient } from "./client";
import type { IngestionProviderState, IngestionRunRow, IngestionRunStatus, IngestMetrics } from "./types";

export interface StartRunInput {
  providerId: number;
  windowLabel?: string;
  trigger?: "manual" | "scheduled" | "test";
  metadata?: Record<string, string | number | boolean | null>;
}

export async function startRun(client: WarehouseClient, input: StartRunInput): Promise<IngestionRunRow> {
  const { data, error } = await client
    .from("ingestion_runs")
    .insert({
      provider_id: input.providerId,
      window_label: input.windowLabel ?? null,
      trigger: input.trigger ?? "manual",
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`startRun failed: ${error.message}`);
  return data;
}

export interface FinishRunInput {
  runId: string;
  status: Exclude<IngestionRunStatus, "running">;
  providerState: IngestionProviderState;
  recordsReturned: number;
  recordsAccepted: number;
  recordsRejected: number;
  totals: IngestMetrics;
  unitsProcessed: number;
  unitsSkipped: number;
  errorMessage?: string;
  metadata?: Record<string, string | number | boolean | null | string[]>;
}

export async function finishRun(client: WarehouseClient, input: FinishRunInput): Promise<IngestionRunRow> {
  const { data, error } = await client
    .from("ingestion_runs")
    .update({
      status: input.status,
      provider_state: input.providerState,
      finished_at: new Date().toISOString(),
      records_returned: input.recordsReturned,
      records_accepted: input.recordsAccepted,
      records_rejected: input.recordsRejected,
      records_inserted: input.totals.inserted,
      records_duplicate_url: input.totals.existingUrl + input.totals.existingProviderItem,
      records_duplicate_headline: input.totals.duplicateHeadline,
      observations_created: input.totals.observationsCreated,
      sources_created: input.totals.sourcesCreated,
      units_processed: input.unitsProcessed,
      units_skipped: input.unitsSkipped,
      error_message: input.errorMessage ?? null,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })
    .eq("id", input.runId)
    .select()
    .single();
  if (error) throw new Error(`finishRun failed: ${error.message}`);
  return data;
}

export async function getRun(client: WarehouseClient, runId: string): Promise<IngestionRunRow | null> {
  const { data, error } = await client.from("ingestion_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw new Error(`getRun failed: ${error.message}`);
  return data;
}

export async function getLatestRuns(client: WarehouseClient, limit = 10): Promise<IngestionRunRow[]> {
  const { data, error } = await client.from("ingestion_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`getLatestRuns failed: ${error.message}`);
  return data;
}

/** Which of these immutable unit keys are already stored? Lets the ingester skip downloads entirely. */
export async function findProcessedUnitKeys(client: WarehouseClient, unitKeys: string[]): Promise<Set<string>> {
  if (unitKeys.length === 0) return new Set();
  const { data, error } = await client.from("news_ingestion_units").select("unit_key").in("unit_key", unitKeys);
  if (error) throw new Error(`findProcessedUnitKeys failed: ${error.message}`);
  return new Set(data.map((row) => row.unit_key));
}
