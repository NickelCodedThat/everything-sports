import type { Sport } from "@/types/sport";

export interface SportQueryProfile {
  sport: Sport;
  /** Human-readable label for CLI/report output. */
  label: string;
  /**
   * Explicit, readable search terms for this sport. Multi-word terms are
   * treated as exact phrases by provider query builders. Deliberately
   * specific — e.g. never bare "football", which means soccer globally.
   */
  terms: string[];
}

/**
 * Provider-agnostic query profiles: one canonical term list per sport,
 * consumed by each provider's own query builder (GDELT's OR-syntax, NewsData's
 * query params, etc). Keeping the terms here — instead of duplicated per
 * provider — means they can't drift apart. Sports without a profile here
 * (currently "other") have no dedicated discovery query.
 */
export const SPORT_QUERY_PROFILES: Partial<Record<Sport, SportQueryProfile>> = {
  basketball: {
    sport: "basketball",
    label: "Basketball",
    terms: ["NBA", "WNBA", "college basketball"],
  },
  football: {
    sport: "football",
    label: "Football",
    terms: ["NFL", "college football"],
  },
  baseball: {
    sport: "baseball",
    label: "Baseball",
    terms: ["MLB", "Major League Baseball"],
  },
  boxing: {
    sport: "boxing",
    label: "Boxing",
    terms: ["boxing match", "boxing title fight", "WBC", "WBA", "IBF", "WBO"],
  },
  mma: {
    sport: "mma",
    label: "MMA",
    terms: ["UFC", "mixed martial arts", "Bellator MMA"],
  },
  soccer: {
    sport: "soccer",
    label: "Soccer",
    terms: [
      "MLS",
      "Premier League",
      "Champions League",
      "UEFA",
      "La Liga",
      "Serie A",
      "Bundesliga",
      "World Cup soccer",
    ],
  },
  hockey: {
    sport: "hockey",
    label: "Hockey",
    terms: ["NHL"],
  },
  tennis: {
    sport: "tennis",
    label: "Tennis",
    terms: ["ATP Tour", "WTA Tour", "Wimbledon", "US Open tennis", "Grand Slam tennis"],
  },
  golf: {
    sport: "golf",
    label: "Golf",
    terms: ["PGA Tour", "LPGA Tour", "Masters Tournament golf", "Ryder Cup"],
  },
  motorsports: {
    sport: "motorsports",
    label: "Motorsports",
    terms: ["Formula 1", "NASCAR", "IndyCar"],
  },
  olympics: {
    sport: "olympics",
    label: "Olympics",
    terms: ["Olympics", "Olympic Games", "IOC"],
  },
};

export function getQueryProfile(sport: Sport): SportQueryProfile | undefined {
  return SPORT_QUERY_PROFILES[sport];
}

/** Every sport that currently has a discovery query profile, in editorial-priority order. */
export const QUERYABLE_SPORTS: Sport[] = [
  "basketball",
  "football",
  "baseball",
  "boxing",
  "mma",
  "soccer",
  "hockey",
  "tennis",
  "golf",
  "motorsports",
  "olympics",
];
