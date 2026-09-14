import type { TeamRef } from "@/types/entities";

/**
 * Fictional teams for fixture/demo content. Names are invented rather than
 * real franchises, per the Phase 1 content rule against copying real-world
 * reporting into demo data.
 */
export const TEAMS = {
  // NBA
  PORTLAND_IRONLINE: { id: "portland-ironline", name: "Portland Ironline", shortName: "Ironline", sport: "basketball", league: "nba" },
  CHICAGO_VANTAGE: { id: "chicago-vantage", name: "Chicago Vantage", shortName: "Vantage", sport: "basketball", league: "nba" },
  BROOKLYN_COMBINE: { id: "brooklyn-combine", name: "Brooklyn Combine", shortName: "Combine", sport: "basketball", league: "nba" },
  PHOENIX_SOLACE: { id: "phoenix-solace", name: "Phoenix Solace", shortName: "Solace", sport: "basketball", league: "nba" },
  DENVER_ALTITUDE: { id: "denver-altitude", name: "Denver Altitude", shortName: "Altitude", sport: "basketball", league: "nba" },
  // WNBA
  SEATTLE_CURRENT: { id: "seattle-current", name: "Seattle Current", shortName: "Current", sport: "basketball", league: "wnba" },
  ATLANTA_LIFT: { id: "atlanta-lift", name: "Atlanta Lift", shortName: "Lift", sport: "basketball", league: "wnba" },
  // NCAAB
  CASCADE_TIMBERWOLVES: { id: "cascade-timberwolves", name: "Cascade University Timberwolves", shortName: "Cascade", sport: "basketball", league: "ncaab" },
  // NFL
  CLEVELAND_FOUNDRY: { id: "cleveland-foundry", name: "Cleveland Foundry", shortName: "Foundry", sport: "football", league: "nfl" },
  HOUSTON_MERIDIAN: { id: "houston-meridian", name: "Houston Meridian", shortName: "Meridian", sport: "football", league: "nfl" },
  KANSAS_CITY_OVERDRIVE: { id: "kansas-city-overdrive", name: "Kansas City Overdrive", shortName: "Overdrive", sport: "football", league: "nfl" },
  DALLAS_FRONTIER: { id: "dallas-frontier", name: "Dallas Frontier", shortName: "Frontier", sport: "football", league: "nfl" },
  // NCAAF
  PRAIRIE_STATE_LANCERS: { id: "prairie-state-lancers", name: "Prairie State Lancers", shortName: "Lancers", sport: "football", league: "ncaaf" },
  // MLB
  CINCINNATI_HARBOR: { id: "cincinnati-harbor", name: "Cincinnati Harbor", shortName: "Harbor", sport: "baseball", league: "mlb" },
  SAN_DIEGO_TIDELINE: { id: "san-diego-tideline", name: "San Diego Tideline", shortName: "Tideline", sport: "baseball", league: "mlb" },
  MILWAUKEE_IRONWORKS: { id: "milwaukee-ironworks", name: "Milwaukee Ironworks", shortName: "Ironworks", sport: "baseball", league: "mlb" },
  // Soccer
  ATLANTIC_CITY_FC: { id: "atlantic-city-fc", name: "Atlantic City FC", shortName: "Atlantic City", sport: "soccer", league: "mls" },
  RIVERSIDE_UNITED: { id: "riverside-united", name: "Riverside United", shortName: "Riverside", sport: "soccer", league: "premier-league" },
  // Hockey
  MINNESOTA_NORTHLINE: { id: "minnesota-northline", name: "Minnesota Northline", shortName: "Northline", sport: "hockey", league: "nhl" },
} as const satisfies Record<string, TeamRef>;
