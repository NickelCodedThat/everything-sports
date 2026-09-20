import { ProviderRateLimitedError, describeFetchError } from "../errors";
import { applyIntakeFilter } from "../filters/intake";
import type { CandidateProvider } from "../providers/types";
import { ingestBatch } from "./candidates";
import type { WarehouseClient } from "./client";
import { finishRun, findProcessedUnitKeys, startRun } from "./ingestion-runs";
import { syncProvider } from "./providers";
import { emptyMetrics, type IngestionProviderState, type IngestionRunRow, type IngestMetrics } from "./types";

/**
 * Persists already-normalized candidates (and the ones intake rejected) for an
 * existing run. Atomic and idempotent — see `ingestBatch`. This is the
 * "ingestCandidates" entry point for callers that do their own fetching.
 */
export const ingestCandidates = ingestBatch;

export function addMetrics(total: IngestMetrics, next: IngestMetrics): void {
  total.candidatesReceived += next.candidatesReceived;
  total.inserted += next.inserted;
  total.existingUrl += next.existingUrl;
  total.existingProviderItem += next.existingProviderItem;
  total.duplicateHeadline += next.duplicateHeadline;
  total.observationsCreated += next.observationsCreated;
  total.sourcesCreated += next.sourcesCreated;
  total.rejectionsRecorded += next.rejectionsRecorded;
  total.rejectionsSeenAgain += next.rejectionsSeenAgain;
  total.disabledSourceRejected += next.disabledSourceRejected;
}

export interface RunWarehouseIngestionParams {
  provider: CandidateProvider;
  window: string;
  /** Per-sport cap for providers that fetch by query; ignored by providers with immutable units. */
  limit: number;
  trigger?: "manual" | "scheduled" | "test";
}

export interface WarehouseRunReport {
  run: IngestionRunRow;
  providerState: IngestionProviderState;
  totals: IngestMetrics;
  returned: number;
  accepted: number;
  rejected: number;
  unitsProcessed: number;
  unitsSkipped: number;
  errors: string[];
  durationMs: number;
}

interface Progress {
  totals: IngestMetrics;
  returned: number;
  accepted: number;
  rejected: number;
  unitsProcessed: number;
  unitsSkipped: number;
  errors: string[];
  state: IngestionProviderState;
  /** Newest unit the provider said exists (GKG: the newest published file) and how many units the window covered. */
  latestAvailableUnit?: string;
  unitsListed?: number;
}

/** Providers with immutable units: skip stored units before downloading, claim each unit atomically with its rows. */
async function ingestUnits(
  client: WarehouseClient,
  provider: CandidateProvider & Required<Pick<CandidateProvider, "units">>,
  runId: string,
  window: string,
  progress: Progress,
): Promise<void> {
  let keys: string[];
  try {
    keys = await provider.units.list({ window });
  } catch (error) {
    progress.state = error instanceof ProviderRateLimitedError ? "throttled" : "error";
    progress.errors.push(error instanceof ProviderRateLimitedError ? error.message : describeFetchError(error));
    return;
  }

  progress.unitsListed = keys.length;
  progress.latestAvailableUnit = keys[keys.length - 1];

  const alreadyProcessed = await findProcessedUnitKeys(client, keys);
  progress.unitsSkipped += alreadyProcessed.size;

  for (const key of keys.filter((candidate) => !alreadyProcessed.has(candidate))) {
    try {
      const unitCandidates = await provider.units.fetch(key);
      if (unitCandidates === null) continue; // not published (yet); leave it unclaimed for a later run

      const { accepted, rejected } = applyIntakeFilter(unitCandidates);
      const metrics = await ingestBatch(client, { runId, unitKey: key, candidates: accepted, rejected });

      if (metrics.unitSkipped) {
        progress.unitsSkipped += 1; // another worker claimed it between our check and our write
        continue;
      }
      progress.unitsProcessed += 1;
      progress.returned += unitCandidates.length;
      progress.accepted += accepted.length;
      progress.rejected += rejected.length;
      addMetrics(progress.totals, metrics);
    } catch (error) {
      if (error instanceof ProviderRateLimitedError) {
        progress.state = "throttled";
        progress.errors.push(error.message);
        return;
      }
      progress.errors.push(`${key}: ${describeFetchError(error)}`);
    }
  }
}

/** Providers without units (Wikipedia, NewsData, the DOC API): one fetch, one batch, no cursor — URL dedupe still applies. */
async function ingestFeed(
  client: WarehouseClient,
  provider: CandidateProvider,
  runId: string,
  params: RunWarehouseIngestionParams,
  progress: Progress,
): Promise<void> {
  const result = await provider.fetchCandidates({ sport: "all", window: params.window, limit: params.limit });

  if (result.status !== "ok") {
    progress.state = result.status;
    progress.errors.push(result.message ?? `provider reported ${result.status}`);
    return;
  }
  if (result.message) progress.errors.push(result.message);
  if (result.candidates.length === 0) {
    progress.state = "empty";
    return;
  }

  const { accepted, rejected } = applyIntakeFilter(result.candidates);
  const metrics = await ingestBatch(client, { runId, candidates: accepted, rejected });
  progress.unitsProcessed += 1;
  progress.returned += result.candidates.length;
  progress.accepted += accepted.length;
  progress.rejected += rejected.length;
  addMetrics(progress.totals, metrics);
}

/**
 * One auditable ingestion run for one provider: registers the provider, opens
 * an `ingestion_runs` row, fetches, filters through intake, persists, and
 * closes the run with counts and a state — even when the provider fails.
 * Safe to call repeatedly: an immutable unit is stored at most once, and a URL
 * is a canonical candidate at most once.
 */
export async function runWarehouseIngestion(
  client: WarehouseClient,
  params: RunWarehouseIngestionParams,
): Promise<WarehouseRunReport> {
  const { provider } = params;
  const providerRow = await syncProvider(client, provider);
  const run = await startRun(client, {
    providerId: providerRow.id,
    windowLabel: params.window,
    trigger: params.trigger,
    metadata: { limit: params.limit },
  });

  const startedAt = Date.now();
  const progress: Progress = {
    totals: emptyMetrics(),
    returned: 0,
    accepted: 0,
    rejected: 0,
    unitsProcessed: 0,
    unitsSkipped: 0,
    errors: [],
    state: "ok",
  };

  try {
    if (provider.units) {
      await ingestUnits(client, provider as CandidateProvider & Required<Pick<CandidateProvider, "units">>, run.id, params.window, progress);
    } else {
      await ingestFeed(client, provider, run.id, params, progress);
    }
  } catch (error) {
    progress.state = "error";
    progress.errors.push(describeFetchError(error));
  }

  const didWork = progress.unitsProcessed + progress.unitsSkipped > 0;
  if (progress.state === "ok" && progress.errors.length > 0 && !didWork) progress.state = "error";

  const hardFailure = progress.state === "error" || progress.state === "throttled" || progress.state === "unavailable";
  const status = hardFailure && progress.unitsProcessed === 0 ? "failed" : progress.errors.length > 0 ? "partial" : "succeeded";

  const finished = await finishRun(client, {
    runId: run.id,
    status,
    providerState: progress.state,
    recordsReturned: progress.returned,
    recordsAccepted: progress.accepted,
    recordsRejected: progress.rejected,
    totals: progress.totals,
    unitsProcessed: progress.unitsProcessed,
    unitsSkipped: progress.unitsSkipped,
    errorMessage: progress.errors.length > 0 ? progress.errors.join("; ").slice(0, 2000) : undefined,
    metadata: {
      limit: params.limit,
      ...(progress.latestAvailableUnit ? { latest_available_unit: progress.latestAvailableUnit } : {}),
      ...(progress.unitsListed !== undefined ? { units_listed: progress.unitsListed } : {}),
    },
  });

  return {
    run: finished,
    providerState: progress.state,
    totals: progress.totals,
    returned: progress.returned,
    accepted: progress.accepted,
    rejected: progress.rejected,
    unitsProcessed: progress.unitsProcessed,
    unitsSkipped: progress.unitsSkipped,
    errors: progress.errors,
    durationMs: Date.now() - startedAt,
  };
}
