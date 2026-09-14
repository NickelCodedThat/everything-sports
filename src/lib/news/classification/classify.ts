import type { Sport } from "@/types/sport";
import type { ClassificationResult } from "../candidates/types";
import { SPORT_QUERY_PROFILES } from "../queries/sport-profiles";

export interface ClassificationInput {
  headline: string;
  /** The sport whose query profile discovered this candidate. */
  queryProfileSport: Sport;
  providerCategories?: string[];
}

const SPORTS_CATEGORY_HINTS = ["sport", "sports"];

function matchedTerms(headline: string, terms: string[]): string[] {
  const lowerHeadline = headline.toLowerCase();
  return terms.filter((term) => lowerHeadline.includes(term.toLowerCase()));
}

/**
 * Deterministic sport classification — no LLM, no external call. Combines
 * the query profile that discovered the candidate, headline term matches
 * against every profile (to catch false positives, e.g. a "football" query
 * profile pulling in a soccer story), and provider-supplied categories.
 * Always returns *why*, not just a score.
 */
export function classifyCandidate(input: ClassificationInput): ClassificationResult {
  const { headline, queryProfileSport, providerCategories } = input;
  const signals: string[] = [];

  const ownProfile = SPORT_QUERY_PROFILES[queryProfileSport];
  const ownMatches = ownProfile ? matchedTerms(headline, ownProfile.terms) : [];

  let bestSport: Sport = queryProfileSport;
  let bestMatchCount = ownMatches.length;
  if (ownMatches.length > 0) {
    signals.push(`headline matches query profile terms: ${ownMatches.join(", ")}`);
  } else {
    signals.push(`query profile "${queryProfileSport}" discovered this candidate`);
  }

  for (const [otherSportKey, profile] of Object.entries(SPORT_QUERY_PROFILES)) {
    const otherSport = otherSportKey as Sport;
    if (!profile || otherSport === queryProfileSport) continue;
    const matches = matchedTerms(headline, profile.terms);
    if (matches.length > bestMatchCount) {
      bestSport = otherSport;
      bestMatchCount = matches.length;
      signals.push(
        `headline matches "${otherSport}" terms more strongly than its "${queryProfileSport}" query profile: ${matches.join(", ")}`,
      );
    }
  }

  const categoryHint = providerCategories?.some((category) =>
    SPORTS_CATEGORY_HINTS.includes(category.toLowerCase()),
  );
  const categoryContradicts = providerCategories && providerCategories.length > 0 && categoryHint === false;

  if (categoryHint) {
    signals.push(`provider category confirms sports content: ${providerCategories?.join(", ")}`);
  } else if (categoryContradicts) {
    signals.push(`provider categories do not indicate sports content: ${providerCategories?.join(", ")}`);
  }

  const sportChanged = bestSport !== queryProfileSport;

  let confidence: ClassificationResult["confidence"];
  if (sportChanged) {
    confidence = "medium";
  } else if (ownMatches.length > 0 && !categoryContradicts) {
    confidence = "high";
  } else if (ownMatches.length > 0) {
    confidence = "medium";
  } else if (categoryContradicts) {
    confidence = "low";
  } else {
    confidence = "low";
  }

  return { sport: bestSport, confidence, signals };
}
