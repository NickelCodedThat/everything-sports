/**
 * Server-only persistent news warehouse. Nothing under `src/app` should import
 * this: the public site does not read the warehouse in Phase 4.
 */
export { createWarehouseClient, WarehouseConfigError, type WarehouseClient } from "./client";
export { runWarehouseIngestion, ingestCandidates, type RunWarehouseIngestionParams, type WarehouseRunReport } from "./ingest";
export {
  ingestBatch,
  findCandidateByUrl,
  listCandidates,
  getCandidateProvenance,
  listRejections,
  listHeadlineGroups,
  type IngestBatchInput,
} from "./candidates";
export { startRun, finishRun, getRun, getLatestRuns, findProcessedUnitKeys } from "./ingestion-runs";
export { syncProvider, setProviderStatus, ProviderNotAllowedError } from "./providers";
export { getSourceByDomain, listSources, setSourceEnabled } from "./sources";
export { getWarehouseStats } from "./stats";
export { listFreshCandidates, listHeadlineGroupInputs, getPublishableHeadline } from "./feed";
export type { FeedQuery, FeedItem, HeadlineGroupInput, HeadlineGroupQuery } from "./feed";
export { reapStaleRuns, tryAcquireLock, releaseLock, getProviderRow, getLastAttemptAt, getSchedulerStatus } from "./engine-db";
export { normalizeHeadline, headlineKindFor, toCandidatePayload, toRejectionPayload } from "./normalize";
export type * from "./types";
