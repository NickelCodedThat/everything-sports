import type { Sport } from "@/types/sport";
import type { ClassificationResult } from "../candidates/types";
import { SPORT_QUERY_PROFILES } from "../queries/sport-profiles";
import { CONTRADICTION_LEXICON, SPORT_LEXICON, matchProperNouns, matchTerms, type LexiconSport } from "./lexicon";

export interface ClassificationInput {
  headline: string;
  /**
   * The sport whose query profile discovered this candidate. Omitted for
   * feed-style providers that aren't discovered per-sport — classification
   * then rests on headline evidence alone.
   */
  queryProfileSport?: Sport;
  providerCategories?: string[];
  /** Extra text (e.g. a Wikipedia Current Events parent event title) scanned for signals but never displayed. */
  context?: string;
}

/**
 * Phrases that contain a sport term but mean something else. Removed from the
 * text before matching. Grown from real data: "Special Olympics Kentucky Truck
 * Pull" (GDELT GKG, 2026-09-20) was classified as Olympics/high.
 */
const NEUTRALIZED_PHRASES = ["Special Olympics", "Junior Olympics", "Olympic Park"];

function neutralize(text: string): string {
  return NEUTRALIZED_PHRASES.reduce((acc, phrase) => acc.replace(new RegExp(phrase, "gi"), " "), text);
}

const SPORTS_CATEGORY_HINTS = ["sport", "sports"];

const STRONG_WEIGHT = 3;
const TEAM_WEIGHT = 2;
const WEAK_WEIGHT = 1;

interface SportEvidence {
  score: number;
  strong: string[];
  team: string[];
  weak: string[];
}

function isLexiconSport(sport: Sport): sport is LexiconSport {
  return sport in SPORT_LEXICON;
}

/** Everything the headline says in favor of one sport, by evidence tier. */
function gatherEvidence(text: string, sport: Sport): SportEvidence {
  const profileTerms = SPORT_QUERY_PROFILES[sport]?.terms ?? [];
  const lexicon = isLexiconSport(sport) ? SPORT_LEXICON[sport] : undefined;

  const strong = [...new Set([...matchTerms(text, profileTerms), ...matchTerms(text, lexicon?.strong ?? [])])];
  const team = lexicon ? matchProperNouns(text, lexicon.team) : [];
  const weak = lexicon ? matchProperNouns(text, lexicon.weak) : [];

  return {
    score: strong.length * STRONG_WEIGHT + team.length * TEAM_WEIGHT + weak.length * WEAK_WEIGHT,
    strong,
    team,
    weak,
  };
}

function describeEvidence(evidence: SportEvidence): string {
  const parts: string[] = [];
  if (evidence.strong.length > 0) parts.push(`league terms: ${evidence.strong.join(", ")}`);
  if (evidence.team.length > 0) parts.push(`team/vocabulary: ${evidence.team.join(", ")}`);
  if (evidence.weak.length > 0) parts.push(`weak hints: ${evidence.weak.join(", ")}`);
  return parts.join("; ");
}

/**
 * Deterministic sport classification — no LLM, no external call. Combines
 * the query profile that discovered the candidate, tiered headline evidence
 * for every sport (league terms > team nicknames/vocabulary > weak hints),
 * contradictory-sport tokens, and provider-supplied categories. Always
 * returns *why*, not just a score.
 *
 * Rules worth knowing:
 *  - Only strong or team-level evidence can move a candidate away from the
 *    sport that discovered it, and only when that evidence outweighs the
 *    query sport's own — weak hints never can.
 *  - "high" requires league-level evidence for the final sport and no equally
 *    strong evidence for a different one.
 *  - Team/vocabulary-only evidence (or two weak hints) is "medium"; query origin alone,
 *    or a single weak hint, is "low".
 */
export function classifyCandidate(input: ClassificationInput): ClassificationResult {
  const { headline, queryProfileSport, providerCategories } = input;
  const text = neutralize(input.context ? `${headline} ${input.context}` : headline);
  const signals: string[] = [];

  const sports = Object.keys(SPORT_QUERY_PROFILES) as Sport[];
  const evidenceBySport = new Map<Sport, SportEvidence>();
  for (const sport of sports) evidenceBySport.set(sport, gatherEvidence(text, sport));

  const ownEvidence = queryProfileSport ? evidenceBySport.get(queryProfileSport) : undefined;

  // Strongest competing sport (other than the query origin), needing at least team-level evidence.
  let rival: { sport: Sport; evidence: SportEvidence } | undefined;
  for (const sport of sports) {
    if (sport === queryProfileSport) continue;
    const evidence = evidenceBySport.get(sport)!;
    if (evidence.strong.length === 0 && evidence.team.length === 0) continue;
    if (!rival || evidence.score > rival.evidence.score) rival = { sport, evidence };
  }

  let finalSport: Sport | "unknown";
  let finalEvidence: SportEvidence | undefined;

  if (queryProfileSport) {
    if (ownEvidence && ownEvidence.score > 0) {
      signals.push(`headline matches ${queryProfileSport} signals — ${describeEvidence(ownEvidence)}`);
      if (ownEvidence.strong.length > 0) {
        signals.push(`headline matches query profile terms: ${ownEvidence.strong.join(", ")}`);
      }
    } else {
      signals.push(`query profile "${queryProfileSport}" discovered this candidate`);
    }

    if (rival && rival.evidence.score > (ownEvidence?.score ?? 0)) {
      finalSport = rival.sport;
      finalEvidence = rival.evidence;
      signals.push(
        `headline matches "${rival.sport}" terms more strongly than its "${queryProfileSport}" query profile: ${describeEvidence(rival.evidence)}`,
      );
    } else {
      finalSport = queryProfileSport;
      finalEvidence = ownEvidence;
      if (rival && ownEvidence && ownEvidence.score > 0) {
        signals.push(
          `contradictory signal: headline also matches "${rival.sport}" — ${describeEvidence(rival.evidence)}`,
        );
      }
    }
  } else {
    // No query origin (feed-style providers, incl. the global GKG firehose): pick the best-supported
    // sport, requiring a league term or two distinct team/vocabulary hits — one bare nickname
    // ("Bills", "Eagles", "Nets") is too easy to hit outside sports.
    let best: { sport: Sport; evidence: SportEvidence } | undefined;
    for (const sport of sports) {
      const evidence = evidenceBySport.get(sport)!;
      if (evidence.strong.length === 0 && evidence.team.length < 2) continue;
      if (!best || evidence.score > best.evidence.score) best = { sport, evidence };
    }
    if (best) {
      finalSport = best.sport;
      finalEvidence = best.evidence;
      signals.push(`headline signals point to ${best.sport} — ${describeEvidence(best.evidence)}`);
    } else {
      finalSport = "unknown";
      signals.push("no sport-specific terms found in headline");
    }
  }

  // Contradictory-sport vocabulary (e.g. "striker" in a football-query headline).
  if (finalSport !== "unknown") {
    for (const [otherSport, terms] of Object.entries(CONTRADICTION_LEXICON) as [Sport, string[]][]) {
      if (otherSport === finalSport) continue;
      const hits = matchTerms(text, terms);
      if (hits.length > 0) {
        signals.push(`contradictory signal: ${otherSport} vocabulary present: ${hits.join(", ")}`);
      }
    }
  }
  const hasContradictoryVocabulary = signals.some((signal) => signal.startsWith("contradictory signal"));

  const categoryHint = providerCategories?.some((category) =>
    SPORTS_CATEGORY_HINTS.includes(category.toLowerCase()),
  );
  const categoryContradicts = providerCategories && providerCategories.length > 0 && categoryHint === false;

  if (categoryHint) {
    signals.push(`provider category confirms sports content: ${providerCategories?.join(", ")}`);
  } else if (categoryContradicts) {
    signals.push(`provider categories do not indicate sports content: ${providerCategories?.join(", ")}`);
  }

  const sportChanged = queryProfileSport !== undefined && finalSport !== queryProfileSport;

  let confidence: ClassificationResult["confidence"];
  if (finalSport === "unknown") {
    confidence = "none";
  } else if (categoryContradicts) {
    confidence = finalEvidence && finalEvidence.strong.length > 0 && !sportChanged ? "medium" : "low";
  } else if (sportChanged) {
    confidence = "medium";
  } else if (finalEvidence && finalEvidence.strong.length > 0) {
    confidence = hasContradictoryVocabulary ? "medium" : "high";
  } else if (finalEvidence && (finalEvidence.team.length > 0 || finalEvidence.weak.length >= 2)) {
    // Team/vocabulary evidence, or two independent weak hints (e.g. "Dream … Sky", "Alabama … Florida State").
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return { sport: finalSport, confidence, signals };
}
