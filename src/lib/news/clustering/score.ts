import { ENTITY_ROUTE_MIN_SHARED_NAMES, ENTITY_ROUTE_MIN_SHARED_TEAMS, THRESHOLDS, fuzzyWindowHours, type MatchConfidence } from "./config";
import { compareEventTypes, type EventAgreement } from "./event-type";
import type { HeadlineFeatures } from "./features";
import { evaluateGuards, type Contradiction } from "./guards";
import { intersect, jaccard } from "./text";

export interface PairInput {
  /** pg_trgm similarity() of the normalized headlines. */
  similarity: number;
  /** greatest(word_similarity(a,b), word_similarity(b,a)). */
  wordSimilarity: number;
  a: HeadlineFeatures;
  b: HeadlineFeatures;
  sportA: string;
  sportB: string;
  leagueA: string | null;
  leagueB: string | null;
  hoursApart: number;
  /** Extra contradictions found at cluster level (cluster event type, cluster span). */
  extraContradictions?: Contradiction[];
}

export type MatchRoute = "fuzzy-headline" | "entity-overlap";

/** The full "why" of one pair comparison — stored as membership/ambiguity evidence. */
export interface PairEvidence {
  similarity: number;
  wordSimilarity: number;
  tokenJaccard: number;
  sharedTeams: string[];
  sharedNames: string[];
  sharedLeagues: string[];
  sharedScores: string[];
  eventA: string | null;
  eventB: string | null;
  eventAgreement: EventAgreement;
  hoursApart: number;
  windowHours: number;
  contradictions: Contradiction[];
  parts: { text: number; entity: number; event: number; numbers: number; timePenalty: number };
  /** 0..1, deterministic. Ranks candidate clusters; the confidence label decides merging. */
  score: number;
  confidence: MatchConfidence;
  /** Which evidence path earned HIGH (null unless confidence is high). */
  route: MatchRoute | null;
  blocked: boolean;
}

const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const EVENT_SCORE: Record<EventAgreement, number> = { same: 1, compatible: 0.7, unknown: 0.35, conflict: 0 };

/**
 * Deterministic pair score and confidence.
 *
 *   text    = 0.50·similarity + 0.20·wordSimilarity + 0.30·tokenJaccard
 *   entity  = min(1, 0.4·min(sharedTeams,2) + 0.2·min(sharedNames,2) + 0.1·sharedLeagues)
 *   event   = same 1 | compatible 0.7 | unknown 0.35 | conflict 0
 *   numbers = 1 when a final score or dollar amount is shared
 *   score   = 0.50·text + 0.30·entity + 0.15·event + 0.05·numbers − 0.10·(hoursApart / window)
 *
 * The score ranks competing clusters. The CONFIDENCE label is what decides merging and is
 * derived from explicit rules, so the reason for a merge never hides in a weighted sum:
 *
 *   blocked (any 'block' contradiction)                                    → low, never merged
 *   HIGH  fuzzy route:  similarity ≥ 0.72, ≥1 shared team/name, event same|compatible
 *         near-identical: similarity ≥ 0.85, ≥1 shared team/name, event not in conflict
 *         entity route: ≥2 shared teams (or 1 team + 1 named person), event same|compatible, not two previews
 *         (or ≥2 shared named people — the individual-sport analogue of two shared teams: both fighters, both players)
 *   a 'downgrade' contradiction caps HIGH at MEDIUM
 *   MEDIUM  similarity ≥ 0.45 with a shared team/name, or ≥2 shared teams with an unclear event type
 *           or two previews of the same game (related commentary, never auto-merged on entities alone)
 *   LOW     everything else
 *
 * Only HIGH auto-merges. MEDIUM goes to the near-miss (needs-review) queue.
 */
export function scorePair(input: PairInput): PairEvidence {
  const { a, b } = input;
  const agreement = compareEventTypes(a.event, b.event);
  const windowHours = fuzzyWindowHours(a.event.type, b.event.type);

  const sharedTeams = intersect(a.teams, b.teams);
  // Name evidence must anchor on a real full name ("Brandon Lowe") seen on at least one side.
  const sharedNames = [...new Set([...intersect(a.names.surnames, b.names.tokens), ...intersect(b.names.surnames, a.names.tokens)])].sort();
  const sharedLeagues = intersect(a.leagues, b.leagues);
  const sharedScores = intersect(a.scores, b.scores);
  const sharedAmounts = intersect(a.amounts, b.amounts);
  const tokenJaccard = jaccard(a.tokens, b.tokens);

  const contradictions = [
    ...evaluateGuards(a, b, { sportA: input.sportA, sportB: input.sportB, leagueA: input.leagueA, leagueB: input.leagueB, hoursApart: input.hoursApart, windowHours }, agreement),
    ...(input.extraContradictions ?? []),
  ];
  const blocked = contradictions.some((c) => c.severity === "block");
  const downgraded = contradictions.some((c) => c.severity === "downgrade");

  const text = 0.5 * input.similarity + 0.2 * input.wordSimilarity + 0.3 * tokenJaccard;
  const entity = Math.min(1, 0.4 * Math.min(sharedTeams.length, 2) + 0.2 * Math.min(sharedNames.length, 2) + 0.1 * sharedLeagues.length);
  const event = EVENT_SCORE[agreement];
  const numbers = sharedScores.length + sharedAmounts.length > 0 ? 1 : 0;
  const timePenalty = 0.1 * Math.min(1, input.hoursApart / windowHours);
  const rawScore = clamp01(0.5 * text + 0.3 * entity + 0.15 * event + 0.05 * numbers - timePenalty);

  const sharedEntities = sharedTeams.length + sharedNames.length;
  const eventOk = agreement === "same" || agreement === "compatible";
  // Two previews of one game are related commentary, not one news event: entity overlap alone never merges them.
  const bothPreviews = a.event.type === "preview" && b.event.type === "preview";

  let route: MatchRoute | null = null;
  if (!blocked) {
    if (input.similarity >= THRESHOLDS.high && sharedEntities >= 1 && eventOk) route = "fuzzy-headline";
    else if (input.similarity >= THRESHOLDS.nearIdentical && sharedEntities >= 1) route = "fuzzy-headline";
    else if (eventOk && !bothPreviews && (sharedTeams.length >= ENTITY_ROUTE_MIN_SHARED_TEAMS || (sharedTeams.length >= 1 && sharedNames.length >= 1) || sharedNames.length >= ENTITY_ROUTE_MIN_SHARED_NAMES)) {
      route = "entity-overlap";
    }
  }

  let confidence: MatchConfidence;
  if (blocked) confidence = "low";
  else if (route && !downgraded) confidence = "high";
  else if (route && downgraded) confidence = "medium";
  else if (input.similarity >= THRESHOLDS.medium && sharedEntities >= 1) confidence = "medium";
  else if ((sharedTeams.length >= ENTITY_ROUTE_MIN_SHARED_TEAMS || sharedNames.length >= ENTITY_ROUTE_MIN_SHARED_NAMES) && (agreement === "unknown" || bothPreviews)) confidence = "medium";
  else confidence = "low";

  return {
    similarity: round(input.similarity),
    wordSimilarity: round(input.wordSimilarity),
    tokenJaccard: round(tokenJaccard),
    sharedTeams,
    sharedNames,
    sharedLeagues,
    sharedScores,
    eventA: a.event.type,
    eventB: b.event.type,
    eventAgreement: agreement,
    hoursApart: round(input.hoursApart, 2),
    windowHours,
    contradictions,
    parts: { text: round(text), entity: round(entity), event: round(event), numbers, timePenalty: round(timePenalty) },
    score: round(blocked ? Math.min(rawScore, 0.2) : rawScore),
    confidence,
    route: confidence === "high" ? route : null,
    blocked,
  };
}

export const CONFIDENCE_RANK: Record<MatchConfidence, number> = { low: 0, medium: 1, high: 2 };
