import type { NewsCandidate } from "../candidates/types";

export type IntakeRejectReason =
  | "malformed-headline"
  | "non-english"
  | "betting-or-fantasy"
  | "template-page"
  | "video-page"
  | "generic-page"
  | "historical-stats-page"
  | "not-sports"
  | "low-quality-source";

export interface RejectedCandidate {
  candidate: NewsCandidate;
  reasons: IntakeRejectReason[];
}

/**
 * Conservative intake filter. Every rule is here because real candidates from
 * the 2026-09-20 live samples (docs/NEWS-SOURCE-STRATEGY.md) demonstrated the
 * junk class — no speculative rules. Rules are pure, ordered, and each maps
 * to one named reason so rejections stay explainable and testable. Rejected
 * candidates are returned (never silently dropped) by the aggregator.
 */

const BETTING_PATTERNS: RegExp[] = [
  /\bbest bets?\b/i,
  /\bparlays?\b/i,
  /\b(player|touchdown|prop) (props?|bets?)\b/i,
  /\bprop bets?\b/i,
  /\bsportsbooks?\b/i,
  /\bpromo codes?\b/i,
  /\bbonus bets?\b/i,
  /\bbetting (odds|lines?|primer|preview|picks|tips|guide)\b/i,
  /\bDFS\b/,
  /\bfantasy (football|baseball|basketball|sleepers?|rankings?|advice|picks?|injury tracker|lineups?|waiver)\b/i,
  // "picks"/"predictions" alone are legitimate (draft picks, way-too-early predictions);
  // only reject when paired with a wagering term.
  /\b(picks?|predictions?)\b.*\b(odds|spread|props?|against the spread|best bets?|parlay)\b/i,
  /\b(odds|spread|props?|against the spread|best bets?|parlay)\b.*\b(picks?|predictions?)\b/i,
];

/** "Against all odds"-style idioms that contain the word "odds" but aren't about wagering. */
const ODDS_IDIOM = /\b(against (all |the )?odds|beat(ing|s)? the odds|defy(ing)? the odds|odds and ends)\b/i;
const BARE_ODDS = /\bodds\b/i;

const TEMPLATE_PAGE_PATTERNS: RegExp[] = [
  // "Toronto Blue Jays at Texas Rangers Preview - 09/20/2026", "... Game Story, Scores/Highlights - 09/19/2026"
  /\b(Game Summary|Game Story,? Scores\/Highlights|Game Preview|Preview)\s*[-–:]?\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i,
  // Schedule pages: "Charlotte Hornets vs LA Clippers Nov 15, 2026 Game Summary"
  /\b[A-Z][a-z]{2} \d{1,2}, \d{4} Game Summary\s*$/,
  // Game listing stubs: "Indiana Fever vs. Washington Mystics - September 20, 2026"
  /\bvs\.? .+ [-–] [A-Z][a-z]+ \d{1,2}, \d{4}\s*$/,
  // Generic landing pages: "Watch ESPN - Stream Live Sports & ESPN Originals"
  /\bStream Live Sports\b/i,
];

const VIDEO_TITLE_PATTERN = /^(condensed game|field view|resumen|hls|highlights?)\s*[:\-]/i;
const VIDEO_TITLE_PATTERN_2 = /^highlights? from\b/i;
const SPANISH_CLIP_PATTERN = /\b(resumen|jugadas destacadas)\b/i;
const VIDEO_PATH_PATTERN = /\/(videos?|watch)(\/|$)/i;

const HISTORICAL_STATS_PATTERN = /\b(19\d{2}|200\d)\b.*\b(situational )?(stats|statistics)\b\s*$/i;

function wordCount(headline: string): number {
  return headline.split(/\s+/).filter(Boolean).length;
}

function letterCount(headline: string): number {
  return (headline.match(/\p{L}/gu) ?? []).length;
}

function isEnglish(language: string | undefined): boolean {
  if (!language) return true; // unknown ≠ foreign; providers already filter to English where they can
  return /^(en|eng|english)\b/i.test(language.trim());
}

export function getIntakeRejections(candidate: NewsCandidate): IntakeRejectReason[] {
  const reasons: IntakeRejectReason[] = [];
  const { headline, sourceUrl } = candidate;

  if (
    wordCount(headline) < 3 ||
    letterCount(headline) < 12 ||
    /^https?:\/\//i.test(headline) ||
    headline.includes("�")
  ) {
    reasons.push("malformed-headline");
  }

  if (!isEnglish(candidate.language) || SPANISH_CLIP_PATTERN.test(headline)) {
    reasons.push("non-english");
  }

  const bettingHit =
    BETTING_PATTERNS.some((pattern) => pattern.test(headline)) ||
    (BARE_ODDS.test(headline) && !ODDS_IDIOM.test(headline));
  if (bettingHit) reasons.push("betting-or-fantasy");

  if (TEMPLATE_PAGE_PATTERNS.some((pattern) => pattern.test(headline))) {
    reasons.push("template-page");
  }

  let pathname = "/";
  try {
    pathname = new URL(sourceUrl).pathname;
  } catch {
    // buildCandidate already guarantees a parseable URL; keep the default rather than throw.
  }

  if (
    VIDEO_TITLE_PATTERN.test(headline) ||
    VIDEO_TITLE_PATTERN_2.test(headline) ||
    VIDEO_PATH_PATTERN.test(pathname)
  ) {
    reasons.push("video-page");
  }

  if (pathname === "/" || pathname === "") reasons.push("generic-page");

  if (HISTORICAL_STATS_PATTERN.test(headline)) reasons.push("historical-stats-page");

  const categories = candidate.providerCategories;
  const categoriesContradict =
    categories !== undefined &&
    categories.length > 0 &&
    !categories.some((category) => ["sport", "sports"].includes(category.toLowerCase()));
  if (categoriesContradict && candidate.classification.confidence === "low") {
    reasons.push("not-sports");
  }

  if (candidate.sourceQuality === "low-quality") reasons.push("low-quality-source");

  return reasons;
}

export function applyIntakeFilter(candidates: NewsCandidate[]): {
  accepted: NewsCandidate[];
  rejected: RejectedCandidate[];
} {
  const accepted: NewsCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const candidate of candidates) {
    const reasons = getIntakeRejections(candidate);
    if (reasons.length === 0) accepted.push(candidate);
    else rejected.push({ candidate, reasons });
  }
  return { accepted, rejected };
}
