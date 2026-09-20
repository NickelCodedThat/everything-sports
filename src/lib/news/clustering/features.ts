import { classifyEvent, type EventClassification } from "./event-type";
import { extractLeagues, extractNames, extractTeams, isTitleCased, type NameEvidence } from "./entities";
import { contentTokens, extractAmounts, extractScores, stripSourceSuffix } from "./text";

/** Everything deterministic we know about one headline. Pure, cheap, cacheable. */
export interface HeadlineFeatures {
  headline: string;
  core: string;
  tokens: string[];
  teams: string[];
  leagues: string[];
  names: NameEvidence;
  scores: string[];
  amounts: string[];
  event: EventClassification;
  titleCased: boolean;
}

export function extractFeatures(headline: string): HeadlineFeatures {
  const core = stripSourceSuffix(headline);
  const teams = extractTeams(core);
  const scores = extractScores(core);
  return {
    headline,
    core,
    tokens: contentTokens(core),
    teams,
    leagues: extractLeagues(core),
    names: extractNames(core, teams),
    scores,
    amounts: extractAmounts(core),
    event: classifyEvent(core, scores.length > 0),
    titleCased: isTitleCased(core),
  };
}

/** Prefixed entity keys stored on cluster members ("team:pirates", "league:mlb", "name:lowe"). */
export function entityKeys(features: HeadlineFeatures): string[] {
  return [
    ...features.leagues.map((league) => `league:${league}`),
    ...features.teams.map((team) => `team:${team}`),
    ...features.names.surnames.map((name) => `name:${name}`),
  ];
}
