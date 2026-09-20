import { SPORT_WEIGHT } from "@/lib/ranking/weights";
import type { EventType } from "../clustering/config";

/**
 * Every tunable in editorial ranking, in one file, each with the reason it has its value.
 * Ranking is EDITORIAL PRIORITIZATION — not truth scoring, not publisher credibility, not
 * engagement, not betting. It is a plain sum of named parts; nothing is hidden in a sort clause.
 */
export const ALGORITHM_VERSION = "editorial-v1";

/** The hard hierarchy: basketball > football > baseball, the rest materially lower (Phase 1 table, reused). */
export const SPORT_BASE: Record<string, number> = { ...SPORT_WEIGHT, unknown: SPORT_WEIGHT.other };

export type Tier = "professional" | "international" | "college" | "developmental" | "unspecified-major" | "unspecified";

/**
 * Competition tier, additive. Professional comes before college but college never disappears.
 * `unspecified-major`: basketball/football/baseball with no tier evidence at all — scored between
 * pro and college rather than guessing. Sports with no college structure default to professional.
 */
export const TIER_POINTS: Record<Tier, number> = {
  professional: 20,
  international: 16,
  "unspecified-major": 10,
  college: 6,
  developmental: 0,
  unspecified: 20,
};

/** Sports with a college tier in our lexicon. For every other sport, "no tier evidence" means the pro tour. */
export const COLLEGE_STRUCTURED_SPORTS = new Set(["basketball", "football", "baseball"]);

export const RECENCY = {
  max: 60,
  /** Freshness of the newest report. No hard cliff: a smooth half-life. */
  latestWeight: 0.5,
  latestHalfLifeHours: 6,
  /** Age of the event itself (first report) — an overnight game that regional papers are still re-syndicating is not "now". */
  eventWeight: 0.5,
  eventHalfLifeHours: 10,
} as const;

/** Clusters whose newest report is older than this are ineligible ("too-old"). */
export const MAX_AGE_HOURS = 48;

/**
 * Event-type priors: how much a KIND of event matters editorially, before we know who is
 * involved (a "major" trade cannot be told from a minor one from text alone — breadth of
 * independent coverage does that job). Routine game results sit well below breaking
 * transactions/news; previews are not news events at all.
 */
export const EVENT_IMPORTANCE: Record<EventType | "unknown", number> = {
  death: 55,
  trade: 45,
  coaching: 45,
  retirement: 45,
  injury: 40,
  discipline: 40,
  signing: 35,
  record: 35,
  business: 30,
  draft: 30,
  transaction: 20,
  "game-result": 15,
  other: 10,
  unknown: 10,
  preview: -15,
};

/**
 * An event type only matters editorially once it is corroborated. A lone source claiming a
 * "coaching change" or a "death" has not yet made news the way three independent outlets have,
 * and we never read article bodies to check. One source earns half the type's importance, two
 * earn 80%, three or more the full value. (Exclusive scoops are what an editor's boost is for.)
 */
export const CORROBORATION_FACTOR = { one: 0.5, two: 0.8, threePlus: 1 } as const;

/**
 * Wide syndication of a ROUTINE event is not a significance signal: fifteen regional papers
 * carrying the same wire recap of an ordinary game says the wire moved, not that the game
 * mattered. Breadth is therefore discounted for these types (applied to the sources and
 * independence parts; the known-publisher confirmation is not discounted).
 */
export const BREADTH_EVENT_FACTOR: Partial<Record<EventType | "unknown", number>> = { "game-result": 0.55, preview: 0.4 };

/** Event types that describe real news events — eligible for urgency. Results/previews are not "developing". */
export const NEWSY_EVENT_TYPES = new Set<EventType>(["trade", "signing", "injury", "coaching", "discipline", "retirement", "death", "business", "draft", "transaction", "record"]);
/**
 * News-type events strong enough to justify placement on a desk/Now from a SINGLE source.
 * Deliberately narrower than NEWSY: business, draft and transaction are too loosely typed
 * (shoe colorways, practice-squad elevations, draft profiles) to stand alone uncorroborated.
 */
export const STRONG_NEWS_EVENT_TYPES = new Set<EventType>(["trade", "signing", "injury", "coaching", "discipline", "retirement", "death", "record"]);

/** Types that may become a breaking-candidate. Deliberately narrower: no results, previews, records or generic moves. */
export const BREAKING_EVENT_TYPES = new Set<EventType>(["trade", "signing", "injury", "coaching", "discipline", "retirement", "death"]);

/** Bonus when the headlines themselves carry high-stakes language (we have no game-stage metadata; we do not invent it). */
export const STAKES_BONUS = 20;

/**
 * Source breadth. Distinct publisher DOMAINS (never candidate rows or sightings), on a log
 * scale that saturates, so fifty syndicated copies cannot bury an important story from two
 * strong independent sources. Distinct headline wordings approximate independent reporting
 * (a wire story republished verbatim is one voice, not fourteen).
 */
export const BREADTH = {
  domainsMax: 34,
  domainsSaturateAt: 20,
  variantsMax: 8,
  variantsSaturateAt: 6,
  /** ≥2 / ≥3 distinct `known`-bucket publishers: a useful confirmation signal, not a credibility score. */
  knownConfirmation: { two: 3, threePlus: 6 },
  /** Minor supporting signal. */
  providerPerExtra: 1,
  providerMax: 2,
} as const;

/**
 * The same routine-coverage discount for velocity: dozens of regional papers picking up a wire
 * recap over the following hours is syndication propagating, not a story breaking.
 */
export const VELOCITY_EVENT_FACTOR: Partial<Record<EventType | "unknown", number>> = { "game-result": 0.4, preview: 0.3 };

export const VELOCITY = {
  perSourceLast15m: 5,
  maxCount15m: 4,
  perSourceEarlierHour: 2,
  maxCountEarlierHour: 5,
  /** A single source is not "velocity": at least this many distinct domains before any counts. */
  minDomains: 2,
} as const;

export const URGENCY_POINTS = { normal: 0, developing: 12, "breaking-candidate": 30 } as const;
/** Flat penalty for a cluster with a single independent publisher: the sport prior alone must not float an uncorroborated item. */
export const UNCORROBORATED_PENALTY = -15;
export const CONFIDENCE_POINTS = { high: 5, medium: -25, low: 0 } as const;

export const URGENCY = {
  /** Automated breaking-candidate needs at least this many independent domains — a lone source never qualifies. */
  breakingMinSources: 2,
  breakingMaxAgeHours: 2,
  /** …and this many distinct domains reporting inside the last hour. */
  breakingMinSourcesLastHour: 2,
  developingMinSources: 2,
  developingMaxAgeHours: 6,
} as const;

export const OVERRIDE = {
  pinBonus: 1000,
  suppressDefault: 80,
  boostMax: 300,
} as const;

/** Coarse priority bands for triage (1 = top). */
export const PRIORITY_BANDS = [
  { min: 210, priority: 1 },
  { min: 170, priority: 2 },
  { min: 130, priority: 3 },
] as const;

export const SECTION = {
  lead: { maxAgeHours: 12, minSources: 3, minSourcesWithImportance: 2, importanceThreshold: 40, gameResultMinSources: 12 },
  wire: { maxAgeHours: 6, minSources: 2, velocitySources: 4, velocityLastHour: 2 },
  /** Desk / Now placement needs substance: ≥ this many independent publishers, or a real news-type event that is not speculation. */
  substantiveMinSources: 2,
  now: { maxAgeHours: 12, minScore: 160 },
} as const;

/** Default slate depth per section — basketball deepest, football almost as deep, baseball a strong third. */
export const SLATE_DEPTH = {
  lead: 1,
  wire: 6,
  now: 10,
  run: 8,
  huddle: 7,
  diamond: 6,
  "fight-desk": 4,
  "world-game": 4,
  "across-the-board": 4,
} as const;

/**
 * Slate diversity. Clustering already removed event duplication; these stop one team, one
 * event type or one sport from swamping a section. Breaking-candidates, pins and developing
 * stories with ≥ `dominantMinSources` independent sources are EXEMPT: a genuinely dominant
 * news moment (say, a trade deadline) is allowed to be lopsided.
 */
export const DIVERSITY = {
  maxPerTeamPerSection: 2,
  maxPerTeamAcrossSlate: 3,
  /** Share of a cross-sport section (Wire/Now) any single sport may fill. */
  maxSportShare: 0.4,
  /** Share of a section any single event type may fill (routine game results in particular). */
  maxEventTypeShare: 0.5,
  /** A "dominant news moment" is exempt from the caps: a breaking-candidate, a pin, or a developing story this widely reported. */
  dominantMinSources: 6,
  /** Two ranked clusters sharing this many teams/named people are probably ONE event that clustering split; only the better is shown. */
  sameEventSharedEntities: 2,
} as const;
