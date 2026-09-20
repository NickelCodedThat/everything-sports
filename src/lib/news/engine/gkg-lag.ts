/**
 * GDELT GKG file lag. Files are immutable 15-minute snapshots named for their
 * quarter-hour boundary in UTC (YYYYMMDDHHMMSS). A file is not published at
 * exactly the boundary, so "the current file is missing" is NOT an outage:
 * the newest file we *expect* is the latest boundary that is at least
 * `graceMinutes` old.
 */
export const GKG_INTERVAL_MINUTES = 15;
export const DEFAULT_GKG_GRACE_MINUTES = 10;

const INTERVAL_MS = GKG_INTERVAL_MINUTES * 60_000;
const STAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

/** Parses `YYYYMMDDHHMMSS` (UTC). Returns null for anything that is not a real timestamp. */
export function parseGkgStamp(stamp: string): Date | null {
  const match = STAMP_PATTERN.exec(stamp);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Reject overflow like month 13 or Feb 30, which Date.UTC silently rolls over.
  const same =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;
  return same ? date : null;
}

export function formatGkgStamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/** Extracts the stamp from a unit key such as `gdelt-gkg:20260920121500`. */
export function stampFromUnitKey(unitKey: string | null | undefined): string | null {
  if (!unitKey) return null;
  const stamp = unitKey.split(":")[1];
  return stamp && parseGkgStamp(stamp) ? stamp : null;
}

function floorToBoundary(ms: number): number {
  return Math.floor(ms / INTERVAL_MS) * INTERVAL_MS;
}

/** The newest quarter-hour boundary, regardless of whether its file could be published yet. */
export function newestBoundaryStamp(now: Date): string {
  return formatGkgStamp(new Date(floorToBoundary(now.getTime())));
}

/**
 * The newest file we should already be able to fetch: the latest boundary that is at least
 * `graceMinutes` old. At 00:05 UTC with a 10-minute grace that is 23:45 of the previous day.
 */
export function latestExpectedStamp(now: Date, graceMinutes: number = DEFAULT_GKG_GRACE_MINUTES): string {
  return formatGkgStamp(new Date(floorToBoundary(now.getTime() - graceMinutes * 60_000)));
}

/** Whole 15-minute steps from `from` to `to` (positive when `to` is later). Null if either stamp is invalid. */
export function stampDistance(from: string, to: string): number | null {
  const a = parseGkgStamp(from);
  const b = parseGkgStamp(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / INTERVAL_MS);
}

export interface GkgLag {
  /** Latest file that should exist by now, given the publication grace. */
  expectedStamp: string;
  /** The newest quarter-hour boundary, and whether its file is already due. */
  newestBoundaryStamp: string;
  newestBoundaryDue: boolean;
  latestAvailableStamp: string | null;
  latestProcessedStamp: string | null;
  /** Files GDELT should have published that it hasn't (expected − available). 0 when nothing is late. */
  upstreamLagFiles: number | null;
  /** Files we should have ingested but haven't (expected − processed). 0 when caught up. */
  processedLagFiles: number | null;
  /** Files that exist upstream (per our last look) but are not stored yet (available − processed). */
  unprocessedAvailableFiles: number | null;
  /** Whether the worker or GDELT is the one behind, when there is lag. */
  cause: "none" | "ingest-behind" | "upstream-late" | "no-data";
}

export interface GkgLagInput {
  now: Date;
  graceMinutes?: number;
  latestAvailableStamp?: string | null;
  latestProcessedStamp?: string | null;
}

export function computeGkgLag(input: GkgLagInput): GkgLag {
  const grace = input.graceMinutes ?? DEFAULT_GKG_GRACE_MINUTES;
  const expected = latestExpectedStamp(input.now, grace);
  const boundary = newestBoundaryStamp(input.now);
  const available = input.latestAvailableStamp ?? null;
  const processed = input.latestProcessedStamp ?? null;

  const clamp = (value: number | null) => (value === null ? null : Math.max(0, value));
  const upstream = available ? clamp(stampDistance(available, expected)) : null;
  const processedLag = processed ? clamp(stampDistance(processed, expected)) : null;
  const unprocessed = processed && available ? clamp(stampDistance(processed, available)) : null;

  let cause: GkgLag["cause"];
  if (processedLag === null) cause = "no-data";
  else if (processedLag === 0) cause = "none";
  else if ((upstream ?? 0) >= processedLag) cause = "upstream-late";
  else cause = "ingest-behind";

  return {
    expectedStamp: expected,
    newestBoundaryStamp: boundary,
    newestBoundaryDue: boundary === expected,
    latestAvailableStamp: available,
    latestProcessedStamp: processed,
    upstreamLagFiles: upstream,
    processedLagFiles: processedLag,
    unprocessedAvailableFiles: unprocessed,
    cause,
  };
}
