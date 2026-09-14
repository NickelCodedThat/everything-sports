/**
 * Canonical sport identifiers. This list intentionally mirrors the editorial
 * priority order in docs/BRAND-UI-BLUEPRINT.md: basketball leads, football is
 * a close second, baseball is a strong third, and the rest receive standard
 * coverage.
 */
export type Sport =
  | "basketball"
  | "football"
  | "baseball"
  | "boxing"
  | "mma"
  | "soccer"
  | "hockey"
  | "tennis"
  | "golf"
  | "motorsports"
  | "olympics"
  | "other";

/** Whether a league is the top professional tier of its sport, college, or another tier. */
export type LeagueTier = "professional" | "college" | "international" | "other";

export interface League {
  id: string;
  name: string;
  sport: Sport;
  tier: LeagueTier;
}

export const LEAGUES = {
  NBA: { id: "nba", name: "NBA", sport: "basketball", tier: "professional" },
  WNBA: { id: "wnba", name: "WNBA", sport: "basketball", tier: "professional" },
  NCAAB: { id: "ncaab", name: "NCAA Basketball", sport: "basketball", tier: "college" },
  NFL: { id: "nfl", name: "NFL", sport: "football", tier: "professional" },
  NCAAF: { id: "ncaaf", name: "NCAA Football", sport: "football", tier: "college" },
  MLB: { id: "mlb", name: "MLB", sport: "baseball", tier: "professional" },
  MILB: { id: "milb", name: "Minor League Baseball", sport: "baseball", tier: "other" },
  BOXING: { id: "boxing", name: "Boxing", sport: "boxing", tier: "professional" },
  UFC: { id: "ufc", name: "UFC", sport: "mma", tier: "professional" },
  PREMIER_LEAGUE: { id: "premier-league", name: "Premier League", sport: "soccer", tier: "professional" },
  MLS: { id: "mls", name: "MLS", sport: "soccer", tier: "professional" },
  INTL_SOCCER: { id: "intl-soccer", name: "International Soccer", sport: "soccer", tier: "international" },
  NHL: { id: "nhl", name: "NHL", sport: "hockey", tier: "professional" },
  ATP_WTA: { id: "atp-wta", name: "ATP / WTA Tour", sport: "tennis", tier: "professional" },
  PGA: { id: "pga", name: "PGA Tour", sport: "golf", tier: "professional" },
  MOTORSPORTS: { id: "motorsports", name: "Motorsports", sport: "motorsports", tier: "professional" },
  OLYMPICS: { id: "olympics", name: "Olympics", sport: "olympics", tier: "international" },
} as const satisfies Record<string, League>;

export type LeagueId = (typeof LEAGUES)[keyof typeof LEAGUES]["id"];
