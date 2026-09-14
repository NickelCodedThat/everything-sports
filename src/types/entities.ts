import type { LeagueId, Sport } from "./sport";

export interface TeamRef {
  id: string;
  name: string;
  shortName: string;
  sport: Sport;
  league: LeagueId;
}

export interface PersonRef {
  id: string;
  name: string;
  sport: Sport;
  teamId?: string;
}

/** How much editorial weight a source's own reporting carries in ranking. */
export type SourceCredibilityTier = "staff" | "wire" | "syndicated" | "aggregated";

export interface NewsSource {
  id: string;
  name: string;
  homepageUrl: string;
  credibilityTier: SourceCredibilityTier;
}
