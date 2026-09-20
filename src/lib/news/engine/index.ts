/** Automated newsroom engine — scheduling orchestration, health, GKG lag. Server-side only. */
export { ENGINE_PROVIDERS, STALE_RUN_AFTER_MINUTES, assessSchedulability, getEngineConfig } from "./config";
export type { EngineProviderConfig, ScheduleClass, Schedulability } from "./config";
export { runScheduledTick, createTickDeps, lockKeyFor } from "./tick";
export type { TickDeps, TickResult, TickTrigger, TickOutcome, ProviderTickResult, RunSummary } from "./tick";
export { evaluateProviderHealth, overallState, isSuccessfulRun } from "./health";
export type { HealthState, ProviderHealth, NewsroomHealth, Alert, AlertCode, RunSample } from "./health";
export { collectNewsroomHealth } from "./health-data";
export { computeGkgLag, latestExpectedStamp, newestBoundaryStamp, parseGkgStamp, formatGkgStamp, stampFromUnitKey, stampDistance } from "./gkg-lag";
export { checkBearerSecret } from "./auth";
export { handleTickRequest } from "./http";
export { formatHealthReport, formatTickReport } from "./report";
