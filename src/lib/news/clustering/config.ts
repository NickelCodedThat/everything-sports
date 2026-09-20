/**
 * Every tunable in story clustering, in one place, with the reason it has its value.
 * Values were tuned against the live GKG warehouse corpus (see docs/STORY-CLUSTERING.md,
 * "Real validation results"). Bias: precision over recall — a false split is annoying, a
 * false merge is worse, so when unsure the candidate seeds its own cluster.
 */
export const ALGORITHM_VERSION = "cluster-v1";

export type EventType =
  | "trade"
  | "signing"
  | "injury"
  | "game-result"
  | "preview"
  | "record"
  | "discipline"
  | "coaching"
  | "draft"
  | "transaction"
  | "retirement"
  | "death"
  | "business"
  | "other";

export type MatchConfidence = "high" | "medium" | "low";

export const THRESHOLDS = {
  /**
   * Lowest trigram similarity worth loading from Postgres at all. Bounds the search only —
   * it decides nothing. Set per call (pg_trgm.similarity_threshold is transaction-local), so
   * the global default of 0.3 is never what matters.
   */
  searchFloor: 0.3,
  /** Similarity at which two headlines are "the same sentence, lightly edited". */
  nearIdentical: 0.85,
  /** Similarity for HIGH when a shared entity and a compatible event type back it up. */
  high: 0.72,
  /** Below this, headline similarity alone is not even a near miss. */
  medium: 0.45,
} as const;

/** Distinct teams shared before entity evidence alone may back a HIGH match. */
export const ENTITY_ROUTE_MIN_SHARED_TEAMS = 2;
/** Distinct shared named people (surname evidence) that stand in for two teams in individual sports. */
export const ENTITY_ROUTE_MIN_SHARED_NAMES = 2;

const HOUR = 3_600_000;

/**
 * Time windows. An identical-looking event weeks apart is not the same event, and breaking
 * sports news is covered within hours, so windows are tight and vary by what kind of event
 * it is. Windows are measured on publication time (falling back to discovery time).
 */
export const WINDOWS_HOURS = {
  /** Exact normalized headline: wire copies trickle out over a day; two days is generous. */
  exactHeadline: 48,
  /** A game is reported within hours; the next game in a series is ~a day later. */
  "game-result": 12,
  record: 12,
  /** Event type unclear → the tightest window. */
  unknown: 12,
  default: 24,
} as const;

/** The most the neighbour search ever loads around one candidate. */
export const NEIGHBOR_SEARCH_WINDOW_HOURS = 48;
export const NEIGHBOR_LIMIT = 80;

export function fuzzyWindowHours(a: EventType | null, b: EventType | null): number {
  const w = (t: EventType | null) => (t === null ? WINDOWS_HOURS.unknown : t === "game-result" ? WINDOWS_HOURS["game-result"] : t === "record" ? WINDOWS_HOURS.record : WINDOWS_HOURS.default);
  return Math.min(w(a), w(b));
}

/** A cluster may not stretch over more than this multiple of the pair window (blocks slow chaining). */
export const CLUSTER_SPAN_FACTOR = 2;

export const HOURS_MS = HOUR;
