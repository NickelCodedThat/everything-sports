import type { SourceQuality } from "../candidates/types";

/**
 * Lightweight operational source-quality lookup. Deliberately tiny and
 * explicit: it exists to keep obvious junk out of intake, not to rank
 * publishers editorially or politically. Grown from the 2026-09-20 live
 * sample — see docs/NEWS-SOURCE-STRATEGY.md.
 */
const KNOWN_PUBLISHER_DOMAINS = [
  // wire / national / sports networks
  "apnews.com", "reuters.com", "espn.com", "cbssports.com", "foxsports.com", "nbcsports.com",
  "yahoo.com", "usatoday.com", "nytimes.com", "theathletic.com", "si.com", "bleacherreport.com",
  "sportingnews.com", "theguardian.com", "bbc.com", "bbc.co.uk", "washingtonpost.com", "cnn.com",
  "nbcnews.com", "foxnews.com", "sportsnet.ca", "tsn.ca", "profootballtalk.com", "espnfrontrow.com",
  // leagues / governing bodies
  "nba.com", "wnba.com", "nfl.com", "mlb.com", "ncaa.com", "nhl.com", "mlssoccer.com", "pgatour.com",
  "formula1.com", "ufc.com", "olympics.com",
];

/** Domains that exist primarily to sell betting / fantasy affiliate content. */
const LOW_QUALITY_DOMAINS = [
  "covers.com", "prizepicks.com", "actionnetwork.com", "oddschecker.com", "vegasinsider.com",
  "sportsbookreview.com", "bettingpros.com", "oddsshark.com", "sportsbettingdime.com", "lines.com",
  "underdogfantasy.com", "draftkings.com", "fanduel.com",
];

function matchesDomain(hostname: string, domains: string[]): boolean {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function assessSourceQuality(publisherDomain: string): SourceQuality {
  const hostname = publisherDomain.toLowerCase();
  if (matchesDomain(hostname, LOW_QUALITY_DOMAINS)) return "low-quality";
  if (matchesDomain(hostname, KNOWN_PUBLISHER_DOMAINS)) return "known";
  return "unknown";
}
